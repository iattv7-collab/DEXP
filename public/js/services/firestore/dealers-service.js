// public/js/services/firestore/dealers-service.js

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

export async function getDealer(dealerId) {
  if (!dealerId) {
    return null;
  }

  const dealerRef = doc(db, "dealers", dealerId);

  const snapshot = await getDoc(dealerRef);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  const newDealer = {
    id: dealerId,
    name: "DEXP Demo Dealer",
    active: true,
    createdAt: serverTimestamp()
  };

  await setDoc(dealerRef, newDealer);

  return newDealer;
}