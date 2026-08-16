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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const USER_DEVICES_COLLECTION = "devices";

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

export async function deactivateOtherUserDevices(currentDeviceId = "") {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  const safeCurrentDeviceId = String(currentDeviceId || "").trim();
  const devices = await listUserDevices();

  const updates = devices
    .filter((device) => {
      const id = String(device.id || device.deviceId || "").trim();
      return id && id !== safeCurrentDeviceId && device.active !== false;
    })
    .map((device) => {
      const id = String(device.id || device.deviceId || "").trim();

      const deviceRef = doc(
        db,
        "users",
        session.uid,
        USER_DEVICES_COLLECTION,
        id,
      );

      return updateDoc(deviceRef, {
        active: false,
        notificationsEnabled: false,
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
        deactivatedAt: serverTimestamp(),
        deactivatedAtMs: Date.now(),
        deactivatedReason: "replaced-by-newer-device",
      });
    });

  await Promise.allSettled(updates);

  return updates.length;
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

  await setDoc(
    deviceRef,
    {
      uid: session.uid,
      dealerId: session.dealerId,

      deviceId,

      fcmToken: String(deviceData.fcmToken || "").trim(),

      browser: String(deviceData.browser || "").trim(),
      platform: String(deviceData.platform || "").trim(),
      userAgent: String(deviceData.userAgent || "").trim(),

      active: true,

      notificationsEnabled:
        typeof deviceData.notificationsEnabled === "boolean"
          ? deviceData.notificationsEnabled
          : true,

      soundEnabled:
        typeof deviceData.soundEnabled === "boolean"
          ? deviceData.soundEnabled
          : true,

      vibrationEnabled:
        typeof deviceData.vibrationEnabled === "boolean"
          ? deviceData.vibrationEnabled
          : true,

      ...(deviceData.recordLogin
        ? {
            lastLoginAt: serverTimestamp(),
            lastLoginAtMs: Date.now(),
          }
        : {}),

      lastSeenAt: serverTimestamp(),
      lastSeenAtMs: Date.now(),

      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true },
  );
}