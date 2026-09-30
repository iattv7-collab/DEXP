// public/js/services/firestore/user-devices-service.js
// Firestore service for registering user devices and notification tokens.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const USER_DEVICES_COLLECTION = "devices";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export async function getUserDevice(deviceId = "") {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const safeDeviceId = String(deviceId || "").trim();

  if (!safeDeviceId) {
    throw new Error("Missing device ID.");
  }

  const deviceRef = doc(
    db,
    "users",
    session.uid,
    USER_DEVICES_COLLECTION,
    safeDeviceId,
  );

  const deviceSnapshot = await getDoc(deviceRef);

  if (!deviceSnapshot.exists()) {
    return null;
  }

  return {
    id: deviceSnapshot.id,
    ...deviceSnapshot.data(),
  };
}

export async function listUserDevices() {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const devicesRef = collection(
    db,
    "users",
    session.uid,
    USER_DEVICES_COLLECTION,
  );

  const snapshot = await getDocs(devicesRef);

  return snapshot.docs.map((deviceDocument) => ({
    id: deviceDocument.id,
    ...deviceDocument.data(),
  }));
}

export async function deleteUserDevice(deviceId = "") {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const safeDeviceId = String(deviceId || "").trim();

  if (!safeDeviceId) {
    throw new Error("Missing device ID.");
  }

  const deviceRef = doc(
    db,
    "users",
    session.uid,
    USER_DEVICES_COLLECTION,
    safeDeviceId,
  );

  await deleteDoc(deviceRef);
}

export async function saveUserDevice(deviceData = {}) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const deviceId = String(deviceData.deviceId || "").trim();

  if (!deviceId) {
    throw new Error("Missing device ID.");
  }

  const deviceRef = doc(
    db,
    "users",
    session.uid,
    USER_DEVICES_COLLECTION,
    deviceId,
  );

  const payload = {
    uid: session.uid,
    dealerId: session.dealerId,
    deviceId,
    active: true,
    lastSeenAt: serverTimestamp(),
    lastSeenAtMs: Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  };

  if (hasOwn(deviceData, "fcmToken")) {
    payload.fcmToken = String(deviceData.fcmToken || "").trim();
  }

  if (hasOwn(deviceData, "browser")) {
    payload.browser = String(deviceData.browser || "").trim();
  }

  if (hasOwn(deviceData, "platform")) {
    payload.platform = String(deviceData.platform || "").trim();
  }

  if (hasOwn(deviceData, "userAgent")) {
    payload.userAgent = String(deviceData.userAgent || "").trim();
  }

  if (typeof deviceData.notificationsEnabled === "boolean") {
    payload.notificationsEnabled = deviceData.notificationsEnabled;
  }

  if (typeof deviceData.soundEnabled === "boolean") {
    payload.soundEnabled = deviceData.soundEnabled;
  }

  if (typeof deviceData.vibrationEnabled === "boolean") {
    payload.vibrationEnabled = deviceData.vibrationEnabled;
  }

  if (deviceData.recordLogin) {
    payload.lastLoginAt = serverTimestamp();
    payload.lastLoginAtMs = Date.now();
  }

  await setDoc(deviceRef, payload, { merge: true });
}
