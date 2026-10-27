import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDePcUImOpiguo8IyBbnvVmVRmd7uzIIhw",
    authDomain: "machikoto-keijiban.firebaseapp.com",
    projectId: "machikoto-keijiban",
    storageBucket: "machikoto-keijiban.firebasestorage.app",
    messagingSenderId: "57542828451",
    appId: "1:57542828451:web:0261da9e3feeb5860b7a16",
    measurementId: "G-K5K0G8YP5V"
};

export const isFirebaseConfigured = Boolean(
    firebaseConfig && 
    firebaseConfig.apiKey && 
    firebaseConfig.apiKey.trim() !== "" &&
    firebaseConfig.projectId && 
    firebaseConfig.projectId.trim() !== ""
);

let firebaseApp = null;
export let db = null;

if (isFirebaseConfigured) {
    try {
        firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
    } catch (err) {
        console.warn("Firebase init warning:", err);
    }
}