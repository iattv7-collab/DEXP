// public/js/services/firebase/messaging-service.js
// Firebase Cloud Messaging registration for DEXP user devices.

import {
  getMessaging,
  getToken,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

import { app } from "./firebase-app.js";
import { firebaseVapidKey } from "../../config/firebase-config.js";
import { saveUserDevice } from "../firestore/user-devices-service.js";

const DEVICE_ID_KEY = "dexp_device_id";

function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

function getBrowserName() {
  const agent = navigator.userAgent || "";

  if (agent.includes("Edg/")) {
    return "Microsoft Edge";
  }

  if (agent.includes("Chrome/")) {
    return "Chrome";
  }

  if (agent.includes("Safari/")) {
    return "Safari";
  }

  if (agent.includes("Firefox/")) {
    return "Firefox";
  }

  return "Browser";
}

export async function registerCurrentDeviceForNotifications() {
  const supported = await isSupported();

  if (!supported) {
    console.warn("Firebase Messaging is not supported in this browser.");
    return;
  }

  if (!("Notification" in window)) {
    console.warn("Browser notifications are not available.");
    return;
  }

  if (!firebaseVapidKey || firebaseVapidKey.includes("PASTE_")) {
    console.warn("Missing Firebase Web Push public VAPID key.");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    await saveUserDevice({
      deviceId: getOrCreateDeviceId(),
      fcmToken: "",
      browser: getBrowserName(),
      platform: navigator.platform || "",
      userAgent: navigator.userAgent || "",
      notificationsEnabled: false,
    });

    return;
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js",
  );

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    console.warn("Firebase did not return an FCM token.");
    return;
  }

  await saveUserDevice({
    deviceId: getOrCreateDeviceId(),
    fcmToken: token,
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",
    notificationsEnabled: true,
  });
}