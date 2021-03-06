import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from './config.js';
import { getAuth, signInAnonymously } from "firebase/auth";

const video = document.getElementById("video")
const keyword = document.getElementById("keyword")

// firestore の初期化
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// 送信側のコード
async function sender(){
	// RTCPeerConnection = WebRTC を司るクラス
	const pc = new RTCPeerConnection()
	// ICE candidate の収集が終わったら起動されるベントハンドラ
	// ICE を含んだ offer SDP を firestore 経由で送信する
	pc.onicegatheringstatechange = async () => {
		if(pc.iceGatheringState == "complete")
			await setDoc(doc(db, "sdp_offer", keyword.value), {
				sdp: pc.localDescription['sdp']
			});
	};

	// カメラデバイスを取得して画面に表示
	// 今回はデフォルトのカメラデバイスを取得してるが、複数ある場合ここで指定すれば任意のカメラデバイスを選択できる
	const media = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
	video.srcObject = media;
	// カメラ映像を peer に送信するために、RTCPeerConnection に登録
	media.getTracks().forEach((track) => pc.addTrack(track, media));
	// offer SDP を取得して、RTCPeerConnection に登録
	// この時点で送信側の ICE の収集が走り始め、完了したら先のイベントハンドラがキックされる
	const offerDesc = await pc.createOffer();
	pc.setLocalDescription(offerDesc);

	// peer から firestore 経由で answer SDP が届くのを待つ
	const answerDocument = doc(db, "sdp_answer", keyword.value)
	var unsubscribe = onSnapshot(answerDocument, (doc) => {
		const data = doc.data();
		console.log("onSnapshot: ", data);

		if(!data)
			return

		if(!data['sdp'])
			return

		// answer SDP を受信したら、firestore の変更通知を止める
		unsubscribe();
		// 受信して用済みなので firestore 上の answer SDP を削除
		deleteDoc(answerDocument);

		// テキストの answer SDP をオブジェクト化して、RTCPeerConnection に登録
		const remoteDesc = new RTCSessionDescription({ sdp: data['sdp'], type: 'answer' })
		pc.setRemoteDescription(remoteDesc)
		// この時点で WebRTC の通信が始まって、peer にカメラ映像が送信される
	});
}

// 受信側のコード
async function recever(){
	// RTCPeerConnection = WebRTC を司るクラス
	const pc = new RTCPeerConnection()
	// ICE candidate の収集が終わったら起動されるベントハンドラ
	// ICE を含んだ answer SDP を firestore 経由で送信する
	pc.onicegatheringstatechange = async () => {
		if(pc.iceGatheringState == "complete")
			await setDoc(doc(db, "sdp_answer", keyword.value), {
				sdp: pc.localDescription['sdp']
			});
	};
	// WebRTC の通信が始まって、送信側のカメラ映像が届いた際にキックされるイベントハンドラ
	pc.ontrack = (e) => {
		console.log('ontrack event: ', e);
		video.srcObject = e.streams[0];
	};

	// 送信側から offer SDP が firestore 経由で届くのを待つ
	const offerDocument = doc(db, "sdp_offer", keyword.value)
	var unsubscribe = onSnapshot(offerDocument, (doc) => {
		const data = doc.data();
		console.log("onSnapshot: ", data);

		if(!data)
			return

		if(!data['sdp'])
			return

		// offer SDP を受信したら、firestore の変更通知を止める
		unsubscribe();
		// 受信して用済みなので firestore 上の offer SDP を削除
		deleteDoc(offerDocument);

		// テキストの offer SDP をオブジェクト化して、RTCPeerConnection に登録
		const remoteDesc = new RTCSessionDescription({ sdp: data['sdp'], type: 'offer' })
		pc.setRemoteDescription(remoteDesc)

		// answer SDP を作成して、RTCPeerConnection に登録
		// この時点で受信側の ICE の収集が走り始め、完了したら onicegatheringstatechange がキックされる
		pc.createAnswer().then((answer) => {
			pc.setLocalDescription(answer )
		});
	});
}

// connect ボタンのイベントハンドラ。
// 送信側/受信側 のラジオボタンの状態によって、sender() か recever() のどちらかを呼ぶ
document.getElementById("connect").addEventListener('click', () => {
	if(!keyword.value) return;

	const mode = document.getElementsByName("mode")
	for(let element of mode){
		if(!element.checked)
			continue;

		console.log('mode: ', element.value)
		var f
		if(element.value == 'sender')
			f = sender;
		else
			f = recever;

		// firestore に匿名でログインし、成功したら sender()/recever() のいずれかを実行
		const auth = getAuth();
		signInAnonymously(auth).then(f()).catch((error) => {
			console.log(error)
		});
		break;
	}
});