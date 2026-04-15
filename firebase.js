import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyD8mhgrQnPLqpXJI9Fq6_PvzxKBVUViLLg", 
    authDomain: "sciencetokyowater.firebaseapp.com",
    projectId: "sciencetokyowater", 
    storageBucket: "sciencetokyowater.firebasestorage.app",
    messagingSenderId: "1039095456448", 
    appId: "1:1039095456448:web:548ed9fcc01c811b470325"
};

const app = initializeApp(firebaseConfig); 
export const db = getFirestore(app); 
export const storage = getStorage(app);
export const auth = getAuth(app);

// 脆弱性対策: 未認証ユーザーによる荒らし・スパムを防ぐための匿名ログイン
signInAnonymously(auth).catch((error) => {
    console.error("匿名ログインに失敗しました:", error);
});