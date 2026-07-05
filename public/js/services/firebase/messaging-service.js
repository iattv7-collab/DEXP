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

  if (agent.includes("Edg/")) return "Microsoft Edge";
  if (agent.includes("Chrome/")) return "Chrome";
  if (agent.includes("Safari/")) return "Safari";
  if (agent.includes("Firefox/")) return "Firefox";

  return "Browser";
}

async function saveNotificationsDisabledDevice() {
  await saveUserDevice({
    deviceId: getOrCreateDeviceId(),
    fcmToken: "",
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",
    notificationsEnabled: false,
  });
}

function showNotificationsBlockedMessage() {
  alert(
    "Notifications are blocked on this device.\n\nTo receive DEXP alerts, enable notifications for this site in your browser settings, then refresh DEXP or sign out and sign back in.",
  );
}

export async function getCurrentNotificationStatus() {
  const supported = await isSupported();

  if (!supported || !("Notification" in window)) {
    return {
      status: "unsupported",
      label: "❌ Notifications",
      title: "Notifications are not supported on this device.",
    };
  }

  if (Notification.permission === "granted") {
    return {
      status: "granted",
      label: "✅ Notifications",
      title: "Notifications are enabled on this device.",
    };
  }

  if (Notification.permission === "denied") {
    return {
      status: "denied",
      label: "⚠️ Notifications",
      title: "Notifications are blocked on this device.",
    };
  }

  return {
    status: "default",
    label: "🔔 Enable",
    title: "Enable notifications on this device.",
  };
}

export async function registerCurrentDeviceForNotifications() {
  const supported = await isSupported();

  if (!supported) {
    console.warn("Firebase Messaging is not supported in this browser.");
    return "unsupported";
  }

  if (!("Notification" in window)) {
    console.warn("Browser notifications are not available.");
    return "unsupported";
  }

  if (!firebaseVapidKey || firebaseVapidKey.includes("PASTE_")) {
    console.warn("Missing Firebase Web Push public VAPID key.");
    return "missing-vapid-key";
  }

  if (Notification.permission === "denied") {
    await saveNotificationsDisabledDevice();
    showNotificationsBlockedMessage();
    return "denied";
  }

  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    await saveNotificationsDisabledDevice();

    if (permission === "denied") {
      showNotificationsBlockedMessage();
    }

    return permission;
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
    await saveNotificationsDisabledDevice();
    return "no-token";
  }

  await saveUserDevice({
    deviceId: getOrCreateDeviceId(),
    fcmToken: token,
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",
    notificationsEnabled: true,
  });

  return "granted";
}