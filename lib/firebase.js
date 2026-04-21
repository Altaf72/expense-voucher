import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDNeJ1qI-u1gKNK7_8IxTn6phGDJ0wjEhc",
  authDomain: "expense-voucher-bcad9.firebaseapp.com",
  projectId: "expense-voucher-bcad9",
  messagingSenderId: "497690580363",
  appId: "1:497690580363:web:a97569cfd04e671ebdcb8e",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);