// public/js/services/firestore/modules-service.js

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

export async function getDealerModules(dealerId) {
  if (!dealerId) {
    return [];
  }

  const moduleRef = doc(db, "moduleRegistry", dealerId);

  const snapshot = await getDoc(moduleRef);

  if (!snapshot.exists()) {
    return [];
  }

  return snapshot.data().enabledModules || [];
}