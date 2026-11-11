import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAh53ZG9qF92bYgtYdHybcRksEcU3vyVUg",
  authDomain: "dukdui-b71b0.firebaseapp.com",
  projectId: "dukdui-b71b0",
  storageBucket: "dukdui-b71b0.firebasestorage.app",
  messagingSenderId: "93589254341",
  appId: "1:93589254341:web:899474c373fbf2935080ac",
  measurementId: "G-H2GG7HXXV3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
