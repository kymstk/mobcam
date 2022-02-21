import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from './config.js';
import { getAuth, signInAnonymously } from "firebase/auth";

const video = document.getElementById("video")
const keyword = document.getElementById("keyword")

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

async function sender(){
	const pc = new RTCPeerConnection()
	pc.onicegatheringstatechange = async () => {
		if(pc.iceGatheringState == "complete")
			await setDoc(doc(db, "sdp_offer", keyword.value), {
				sdp: pc.localDescription['sdp']
			});
	};

	const media = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
	video.srcObject = media;
	media.getTracks().forEach((track) => pc.addTrack(track, media));
	const offerDesc = await pc.createOffer();
	pc.setLocalDescription(offerDesc);

	const answerDocument = doc(db, "sdp_answer", keyword.value)
	var unsubscribe = onSnapshot(answerDocument, (doc) => {
		const data = doc.data();
		console.log("onSnapshot: ", data);

		if(!data)
			return

		if(!data['sdp'])
			return

		unsubscribe();
		deleteDoc(answerDocument);

		const remoteDesc = new RTCSessionDescription({ sdp: data['sdp'], type: 'answer' })
		pc.setRemoteDescription(remoteDesc)
	});
}

async function recever(){
	const pc = new RTCPeerConnection()
	pc.onicegatheringstatechange = async () => {
		if(pc.iceGatheringState == "complete")
			await setDoc(doc(db, "sdp_answer", keyword.value), {
				sdp: pc.localDescription['sdp']
			});
	};
	pc.ontrack = (e) => {
		console.log('ontrack event: ', e);
		video.srcObject = e.streams[0];
	};

	const offerDocument = doc(db, "sdp_offer", keyword.value)
	var unsubscribe = onSnapshot(offerDocument, (doc) => {
		const data = doc.data();
		console.log("onSnapshot: ", data);

		if(!data)
			return

		if(!data['sdp'])
			return

		unsubscribe();
		deleteDoc(offerDocument);

		const remoteDesc = new RTCSessionDescription({ sdp: data['sdp'], type: 'offer' })
		pc.setRemoteDescription(remoteDesc)
		pc.createAnswer().then((answer) => {
			pc.setLocalDescription(answer )
		});
	});
}

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

		const auth = getAuth();
		signInAnonymously(auth).then(f()).catch((error) => {
			console.log(error)
		});
		break;
	}
});