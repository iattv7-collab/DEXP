// public/js/modules/ro-tracker/ro-tracker-settings.js

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";

import { getSession } from "/js/core/session.js";

import {
  RO_TRACKER_COLUMNS
} from "/js/modules/ro-tracker/ro-tracker-columns.js";

const SETTINGS_COLLECTION = "moduleSettings";
const RO_TRACKER_SETTINGS_DOC = "ro-tracker";

export function getDefaultVisibleColumnKeys() {
  return RO_TRACKER_COLUMNS.map((column) => column.key);
}

export async function loadROTrackerColumnSettings() {
  const session = getSession();

  if (!session?.uid) {
    return getDefaultVisibleColumnKeys();
  }

  const settingsRef = doc(
    db,
    "users",
    session.uid,
    SETTINGS_COLLECTION,
    RO_TRACKER_SETTINGS_DOC
  );

  const snapshot = await getDoc(settingsRef);

  if (!snapshot.exists()) {
    return getDefaultVisibleColumnKeys();
  }

  const data = snapshot.data() || {};

  const savedKeys = Array.isArray(data.visibleColumnKeys)
    ? data.visibleColumnKeys
    : [];

  const validKeys = new Set(
    RO_TRACKER_COLUMNS.map((column) => column.key)
  );

  const cleanKeys = savedKeys.filter((key) =>
    validKeys.has(key)
  );

  return cleanKeys.length
    ? cleanKeys
    : getDefaultVisibleColumnKeys();
}

export async function saveROTrackerColumnSettings(visibleColumnKeys = []) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const validKeys = new Set(
    RO_TRACKER_COLUMNS.map((column) => column.key)
  );

  const cleanKeys = visibleColumnKeys.filter((key) =>
    validKeys.has(key)
  );

  const settingsRef = doc(
    db,
    "users",
    session.uid,
    SETTINGS_COLLECTION,
    RO_TRACKER_SETTINGS_DOC
  );

  await setDoc(
    settingsRef,
    {
      visibleColumnKeys: cleanKeys,
      updatedAt: serverTimestamp()
    },
    {
      merge: true
    }
  );

  return cleanKeys;
}

export function getColumnsByKeys(keys = []) {
  const keySet = new Set(keys);

  return RO_TRACKER_COLUMNS.filter((column) =>
    keySet.has(column.key)
  );
}