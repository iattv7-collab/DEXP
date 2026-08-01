// public/js/services/firebase/messaging-service.js
// Firebase Cloud Messaging registration and preferences for DEXP user devices.

import {
  getMessaging,
  getToken,
  isSupported,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

import { app } from "./firebase-app.js";
import { firebaseVapidKey } from "../../config/firebase-config.js";

import {
  getUserDevice,
  saveUserDevice,
} from "../firestore/user-devices-service.js";

const DEVICE_ID_KEY = "dexp_device_id";

const DEFAULT_NOTIFICATION_PREFERENCES = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

export function getCurrentDeviceId() {
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

function normalizePreferences(device = null) {
  return {
    notificationsEnabled:
      typeof device?.notificationsEnabled === "boolean"
        ? device.notificationsEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.notificationsEnabled,

    soundEnabled:
      typeof device?.soundEnabled === "boolean"
        ? device.soundEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled,

    vibrationEnabled:
      typeof device?.vibrationEnabled === "boolean"
        ? device.vibrationEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.vibrationEnabled,
  };
}

async function getCurrentDeviceRecord() {
  try {
    return await getUserDevice(getCurrentDeviceId());
  } catch (error) {
    console.warn("Could not load current device settings.", error);
    return null;
  }
}

async function saveNotificationsDisabledDevice() {
  const existingDevice = await getCurrentDeviceRecord();
  const preferences = normalizePreferences(existingDevice);

  await saveUserDevice({
    deviceId: getCurrentDeviceId(),
    fcmToken: "",
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",

    notificationsEnabled: false,
    soundEnabled: preferences.soundEnabled,
    vibrationEnabled: preferences.vibrationEnabled,
  });
}

function showNotificationsBlockedMessage() {
  alert(
    "Notifications are blocked on this device.\n\nTo receive DEXP alerts, enable notifications for this site in your browser settings, then refresh DEXP or sign out and sign back in.",
  );
}

export async function getCurrentDeviceNotificationPreferences() {
  const device = await getCurrentDeviceRecord();
  const preferences = normalizePreferences(device);

  if (
    "Notification" in window &&
    Notification.permission === "denied"
  ) {
    preferences.notificationsEnabled = false;
  }

  return preferences;
}

export async function updateCurrentDeviceNotificationPreferences(
  nextPreferences = {},
) {
  const currentPreferences =
    await getCurrentDeviceNotificationPreferences();

  const preferences = {
    notificationsEnabled:
      typeof nextPreferences.notificationsEnabled === "boolean"
        ? nextPreferences.notificationsEnabled
        : currentPreferences.notificationsEnabled,

    soundEnabled:
      typeof nextPreferences.soundEnabled === "boolean"
        ? nextPreferences.soundEnabled
        : currentPreferences.soundEnabled,

    vibrationEnabled:
      typeof nextPreferences.vibrationEnabled === "boolean"
        ? nextPreferences.vibrationEnabled
        : currentPreferences.vibrationEnabled,
  };

  if (preferences.notificationsEnabled) {
    const result = await registerCurrentDeviceForNotifications({
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
    });

    if (result !== "granted") {
      preferences.notificationsEnabled = false;
    }
  } else {
    await saveUserDevice({
      deviceId: getCurrentDeviceId(),

      notificationsEnabled: false,
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
    });
  }

  window.dispatchEvent(
    new CustomEvent("dexp-notification-preferences-changed", {
      detail: preferences,
    }),
  );

  return preferences;
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

  const preferences =
    await getCurrentDeviceNotificationPreferences();

  if (Notification.permission === "granted") {
    if (!preferences.notificationsEnabled) {
      return {
        status: "disabled",
        label: "🔕 Notifications",
        title: "DEXP notifications are disabled on this device.",
      };
    }

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

export async function registerCurrentDeviceForNotifications(
  preferenceOverrides = {},
) {
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

  const existingDevice = await getCurrentDeviceRecord();
  const currentPreferences = normalizePreferences(existingDevice);

  const soundEnabled =
    typeof preferenceOverrides.soundEnabled === "boolean"
      ? preferenceOverrides.soundEnabled
      : currentPreferences.soundEnabled;

  const vibrationEnabled =
    typeof preferenceOverrides.vibrationEnabled === "boolean"
      ? preferenceOverrides.vibrationEnabled
      : currentPreferences.vibrationEnabled;

  await saveUserDevice({
    deviceId: getCurrentDeviceId(),
    fcmToken: token,
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",

    notificationsEnabled: true,
    soundEnabled,
    vibrationEnabled,

    recordLogin: true,
  });

  return "granted";
}