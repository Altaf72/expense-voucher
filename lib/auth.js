import { auth, db } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc, getDoc, collection, query, where, getDocs
} from "firebase/firestore";

// Login function
export async function loginUser(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;

    // First try: look up by document ID matching UID
    const directDoc = await getDoc(doc(db, "users", user.uid));
    if (directDoc.exists()) {
      return {
        success: true,
        user: { uid: user.uid, ...directDoc.data() }
      };
    }

    // Second try: search by uid field inside documents
    const q = query(
      collection(db, "users"),
      where("uid", "==", user.uid)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return {
        success: true,
        user: { uid: user.uid, ...snap.docs[0].data() }
      };
    }

    // Third try: search by email
    const emailQ = query(
      collection(db, "users"),
      where("email", "==", email)
    );
    const emailSnap = await getDocs(emailQ);
    if (!emailSnap.empty) {
      return {
        success: true,
        user: { uid: user.uid, ...emailSnap.docs[0].data() }
      };
    }

    throw new Error("User profile not found. Contact your admin.");
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Logout
export async function logoutUser() {
  await signOut(auth);
}

// Get current logged in user profile
export async function getCurrentUser() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) { resolve(null); return; }

      // Try by document ID first
      const directDoc = await getDoc(doc(db, "users", user.uid));
      if (directDoc.exists()) {
        resolve({ uid: user.uid, ...directDoc.data() });
        return;
      }

      // Try by uid field
      const q = query(
        collection(db, "users"),
        where("uid", "==", user.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        resolve({ uid: user.uid, ...snap.docs[0].data() });
        return;
      }

      // Try by email
      const emailQ = query(
        collection(db, "users"),
        where("email", "==", user.email)
      );
      const emailSnap = await getDocs(emailQ);
      if (!emailSnap.empty) {
        resolve({ uid: user.uid, ...emailSnap.docs[0].data() });
        return;
      }

      resolve(null);
    });
  });
}

// Redirect based on role
export function getDashboardByRole(role) {
  switch (role) {
    case "admin":   return "/admin";
    case "staff":   return "/staff";
    case "cashier": return "/cashier";
    case "finance": return "/finance";
    default:        return "/login";
  }
}