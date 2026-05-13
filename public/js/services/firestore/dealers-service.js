// public/js/services/firestore/dealers-service.js

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

export async function getDealer(dealerId) {
  if (!dealerId) {
    return null;
  }

  const dealerRef = doc(db, "dealers", dealerId);

  const snapshot = await getDoc(dealerRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}