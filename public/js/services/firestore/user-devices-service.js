// public/js/services/firestore/user-devices-service.js
// Firestore service for registering user devices and notification tokens.

import {
  doc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const USER_DEVICES_COLLECTION = "devices";

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
      notificationsEnabled: Boolean(deviceData.notificationsEnabled),

      lastLoginAt: serverTimestamp(),
      lastLoginAtMs: Date.now(),
      lastSeenAt: serverTimestamp(),
      lastSeenAtMs: Date.now(),

      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true },
  );
}