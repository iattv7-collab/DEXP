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
  deleteUserDevice,
  getUserDevice,
  saveUserDevice,
  deactivateOtherUserDevices,
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

function isCapacitorNative() {
  try {
    const cap = window.Capacitor;

    if (!cap) {
      return false;
    }

    if (typeof cap.isNativePlatform === "function") {
      return cap.isNativePlatform() === true;
    }

    if (typeof cap.getPlatform === "function") {
      const platform = String(cap.getPlatform() || "").toLowerCase();
      return platform === "android" || platform === "ios";
    }

    return false;
  } catch (error) {
    return false;
  }
}

function getCapacitorPushPlugin() {
  try {
    return window.Capacitor?.Plugins?.PushNotifications || null;
  } catch (error) {
    return null;
  }
}

async function registerNativePushToken(preferenceOverrides = {}) {
  const PushNotifications = getCapacitorPushPlugin();

  if (!PushNotifications) {
    console.warn("Capacitor PushNotifications plugin not available.");
    return "unsupported";
  }

  const permission = await PushNotifications.requestPermissions();

  if (permission?.receive !== "granted") {
    await saveNotificationsDisabledDevice();
    return "denied";
  }

  const token = await new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Native push registration timed out."));
    }, 15000);

    const registrationListener = await PushNotifications.addListener(
      "registration",
      (tokenResult) => {
        clearTimeout(timeoutId);
        registrationListener.remove();
        resolve(String(tokenResult?.value || "").trim());
      },
    );

    const errorListener = await PushNotifications.addListener(
      "registrationError",
      (error) => {
        clearTimeout(timeoutId);
        errorListener.remove();
        reject(error);
      },
    );

    try {
      await PushNotifications.createChannel({
        id: "dexp_alerts",
        name: "DEXP Alerts",
        description: "Shop floor request alerts",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
    } catch (channelError) {
      console.warn("Could not create DEXP alert channel.", channelError);
    }

    try {
      await PushNotifications.register();
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });

  if (!token) {
    console.warn("Native push did not return an FCM token.");
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
    browser: "DEXP Android",
    platform: "android-native",
    userAgent: navigator.userAgent || "",
    notificationsEnabled: true,
    soundEnabled,
    vibrationEnabled,
    recordLogin: true,
  });

  console.log("Native FCM token saved for this device.");
  return "granted";
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
    !isCapacitorNative() &&
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
  const currentPreferences = await getCurrentDeviceNotificationPreferences();

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
  if (isCapacitorNative()) {
    const preferences = await getCurrentDeviceNotificationPreferences();
    const device = await getCurrentDeviceRecord();
    const hasToken = !!(device && String(device.fcmToken || "").trim());

    if (!preferences.notificationsEnabled) {
      return {
        status: "disabled",
        label: "🔕 Notifications",
        title: "DEXP notifications are disabled on this device.",
      };
    }

    if (hasToken) {
      return {
        status: "granted",
        label: "✅ Notifications",
        title: "Native notifications are enabled on this device.",
      };
    }

    return {
      status: "default",
      label: "🔔 Enable",
      title: "Enable native notifications on this device.",
    };
  }

  const supported = await isSupported();

  if (!supported || !("Notification" in window)) {
    return {
      status: "unsupported",
      label: "❌ Notifications",
      title: "Notifications are not supported on this device.",
    };
  }

  const preferences = await getCurrentDeviceNotificationPreferences();

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

  if (isCapacitorNative()) {
    try {
      return await registerNativePushToken(preferenceOverrides);
    } catch (error) {
      console.error("Native push registration failed.", error);
      return "error";
    }
  }

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

  const currentDeviceId = getCurrentDeviceId();

  await saveUserDevice({
    deviceId: currentDeviceId,
    fcmToken: token,
    browser: getBrowserName(),
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",

    notificationsEnabled: true,
    soundEnabled,
    vibrationEnabled,

    recordLogin: true,
  });

  try {
    const deactivatedCount = await deactivateOtherUserDevices(currentDeviceId);

    if (deactivatedCount > 0) {
      console.log(
        `Deactivated ${deactivatedCount} older device(s) for this user.`,
      );
    }
  } catch (error) {
    console.warn("Could not deactivate older devices.", error);
  }

  return "granted";
}

export async function unregisterCurrentDeviceForNotifications() {
  const deviceId = getCurrentDeviceId();

  try {
    await deleteUserDevice(deviceId);
  } catch (error) {
    console.error(
      "Could not remove current device from the outgoing user.",
      error,
    );

    throw error;
  }

  window.dispatchEvent(
    new CustomEvent("dexp-notification-preferences-changed", {
      detail: {
        notificationsEnabled: false,
        soundEnabled: false,
        vibrationEnabled: false,
      },
    }),
  );

  return true;
}
