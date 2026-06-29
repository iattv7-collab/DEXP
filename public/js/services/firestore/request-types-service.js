// public/js/services/firestore/request-types-service.js
// Dealer-scoped request type settings for DEXP Requests.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const REQUEST_TYPES_COLLECTION = "requestTypes";

function getDealerRequestTypesCollection() {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  return collection(
    db,
    "dealers",
    session.dealerId,
    "settings",
    REQUEST_TYPES_COLLECTION,
    "items",
  );
}

export async function getRequestTypes() {
  const requestTypesQuery = query(
    getDealerRequestTypesCollection(),
    orderBy("sortOrder", "asc"),
  );

  const snapshot = await getDocs(requestTypesQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getActiveRequestTypes() {
  const requestTypes = await getRequestTypes();

  return requestTypes.filter((requestType) => requestType.active !== false);
}

export async function createRequestType(data = {}) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const name = String(data.name || "").trim();
  const requestType = String(data.requestType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const targetGroupId = String(data.targetGroupId || "").trim();
  const targetGroupName = String(data.targetGroupName || "").trim();

  if (!name) {
    throw new Error("Request name is required.");
  }

  if (!requestType) {
    throw new Error("Request type key is required.");
  }

  if (!targetGroupId) {
    throw new Error("Target group is required.");
  }

  await addDoc(getDealerRequestTypesCollection(), {
    name,
    requestType,

    targetGroupId,
    targetGroupName,

    defaultMessage: String(data.defaultMessage || "").trim(),

    route:
      String(data.route || "").trim() ||
      "/pages/move-locate/move-locate.html",

    active: data.active !== false,
    sortOrder: Number(data.sortOrder || 0),

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    createdBy: session.uid,

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}

export async function updateRequestType(requestTypeId, data = {}) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!requestTypeId) {
    throw new Error("Missing request type ID.");
  }

  const requestTypeRef = doc(
    getDealerRequestTypesCollection(),
    requestTypeId,
  );

  await updateDoc(requestTypeRef, {
    ...data,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}

export async function deleteRequestType(requestTypeId) {
  if (!requestTypeId) {
    throw new Error("Missing request type ID.");
  }

  const requestTypeRef = doc(
    getDealerRequestTypesCollection(),
    requestTypeId,
  );

  await deleteDoc(requestTypeRef);
}