// public/js/services/firestore/locations-service.js

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const COLLECTION_NAME = "locationCatalog";

function getDealerId() {
  const session = getSession();

  return session?.dealerId || null;
}

export async function getActiveLocations() {
  const dealerId = getDealerId();

  if (!dealerId) {
    return [];
  }

  const locationsRef = collection(db, COLLECTION_NAME);

  const q = query(
    locationsRef,
    where("dealerId", "==", dealerId),
    where("active", "==", true),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docItem) => ({
    id: docItem.id,
    ...docItem.data()
  }));
}

export async function getAllLocations() {
  const dealerId = getDealerId();

  if (!dealerId) {
    return [];
  }

  const locationsRef = collection(db, COLLECTION_NAME);

  const q = query(
    locationsRef,
    where("dealerId", "==", dealerId),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docItem) => ({
    id: docItem.id,
    ...docItem.data()
  }));
}

export async function createLocation({
  label,
  area = "main"
}) {
  const dealerId = getDealerId();

  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const cleanLabel = String(label || "").trim();

  if (!cleanLabel) {
    throw new Error("Location label required");
  }

  const id =
    cleanLabel
      .toLowerCase()
      .replace(/\s+/g, "-");

  const locationRef = doc(
    db,
    COLLECTION_NAME,
    `${dealerId}_${id}`
  );

  await setDoc(locationRef, {
    dealerId,
    label: cleanLabel,
    area,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return true;
}

export async function updateLocation(
  locationId,
  updates = {}
) {
  const locationRef = doc(
    db,
    COLLECTION_NAME,
    locationId
  );

  await updateDoc(locationRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });

  return true;
}

export function groupLocationsByArea(
  locations = []
) {
  return {
    main: locations.filter(
      (location) => location.area === "main"
    ),

    annex: locations.filter(
      (location) => location.area === "annex"
    )
  };
}