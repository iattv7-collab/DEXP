// public/js/services/firestore/areas-service.js

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const COLLECTION_NAME = "locationAreas";

function getDealerId() {
  const session = getSession();

  return session?.dealerId || null;
}

function makeAreaId(label = "") {
  return String(label).trim().toLowerCase().replace(/\s+/g, "-");
}

export async function getAreas() {
  const dealerId = getDealerId();

  if (!dealerId) {
    return [];
  }

  const snapshot = await getDocs(collection(db, COLLECTION_NAME));

  return snapshot.docs
    .map((docItem) => ({
      id: docItem.id,
      ...docItem.data(),
    }))
    .filter((area) => area.dealerId === dealerId);
}

export async function createArea(label) {
  const dealerId = getDealerId();

  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const cleanLabel = String(label || "").trim();

  if (!cleanLabel) {
    throw new Error("Area name required");
  }

  const areaId = `${dealerId}_${makeAreaId(cleanLabel)}`;

  await setDoc(doc(db, COLLECTION_NAME, areaId), {
    dealerId,
    label: cleanLabel,
    value: makeAreaId(cleanLabel),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return true;
}

export async function updateArea(areaId, updates = {}) {
  await updateDoc(doc(db, COLLECTION_NAME, areaId), {
    ...updates,
    updatedAt: serverTimestamp()
  });

  return true;
}

export async function deleteArea(areaId) {
  await deleteDoc(doc(db, COLLECTION_NAME, areaId));

  return true;
}
