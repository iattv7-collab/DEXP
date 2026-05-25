// public/js/services/firebase/auth-service.js

import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { app } from "./firebase-app.js";

export const auth = getAuth(app);

const provider = new GoogleAuthProvider();

export async function loginWithGoogle() {
  return signInWithPopup(auth, provider);
}

export async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(
    auth,
    email,
    password
  );
}

export async function sendResetPasswordEmail(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  return signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}