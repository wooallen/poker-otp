import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBUwJXBR1Su0GUvVbUr3Z8Ji-yiNur7QPo",
  authDomain: "poker-otp-wooallen.firebaseapp.com",
  projectId: "poker-otp-wooallen",
  storageBucket: "poker-otp-wooallen.firebasestorage.app",
  messagingSenderId: "1027412507086",
  appId: "1:1027412507086:web:017d771fcc89a8bc6e539f",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let pendingSignIn: Promise<string> | null = null;

/**
 * Ensures the browser has a valid Firebase Anonymous Auth session and returns its UID.
 */
export async function ensureAuthUid(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }
  if (!pendingSignIn) {
    pendingSignIn = signInAnonymously(auth)
      .then((cred) => cred.user.uid)
      .finally(() => {
        pendingSignIn = null;
      });
  }
  return pendingSignIn;
}
