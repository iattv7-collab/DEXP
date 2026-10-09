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
} from "../firestore/user-devices-service.js";

const DEVICE_ID_KEY = "dexp_device_id";

const DEFAULT_NOTIFICATION_PREFERENCES = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

const SAVE_MESSAGES = {
  granted: "Saved for this device.",
  "in-app":
    "In-app and sound saved. Lock-screen push is not available on this browser.",
  denied:
    "Browser blocked lock-screen alerts. In-app and sound are still on.",
  "missing-vapid-key":
    "In-app and sound saved. Push key is missing.",
  unsupported:
    "In-app and sound saved. Lock-screen push is not supported here.",
  "no-token":
    "In-app and sound saved. Lock-screen token was not issued.",
  error:
    "Could not register lock-screen push. In-app settings were saved.",
  disabled: "Alerts off on this device.",
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

function messageForStatus(status = "") {
  return SAVE_MESSAGES[status] || SAVE_MESSAGES.error;
}

async function getCurrentDeviceRecord() {
  try {
    return await getUserDevice(getCurrentDeviceId());
  } catch (error) {
    console.warn("Could not load current device settings.", error);
    return null;
  }
}

async function persistThisDevice({
  fcmToken,
  notificationsEnabled,
  soundEnabled,
  vibrationEnabled,
  recordLogin = false,
} = {}) {
  const existingDevice = await getCurrentDeviceRecord();
  const preferences = normalizePreferences(existingDevice);

  const nextToken =
    fcmToken === undefined
      ? String(existingDevice?.fcmToken || "").trim()
      : String(fcmToken || "").trim();

  await saveUserDevice({
    deviceId: getCurrentDeviceId(),
    fcmToken: nextToken,
    browser: isCapacitorNative() ? "DEXP Android" : getBrowserName(),
    platform: isCapacitorNative()
      ? "android-native"
      : navigator.platform || "",
    userAgent: navigator.userAgent || "",

    notificationsEnabled:
      typeof notificationsEnabled === "boolean"
        ? notificationsEnabled
        : preferences.notificationsEnabled,

    soundEnabled:
      typeof soundEnabled === "boolean"
        ? soundEnabled
        : preferences.soundEnabled,

    vibrationEnabled:
      typeof vibrationEnabled === "boolean"
        ? vibrationEnabled
        : preferences.vibrationEnabled,

    recordLogin,
  });
}

async function registerNativePushToken(preferenceOverrides = {}) {
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

  const platform = String(window.Capacitor?.getPlatform?.() || "").toLowerCase();
  const FirebaseMessaging = window.Capacitor?.Plugins?.FirebaseMessaging || null;
  const PushNotifications = getCapacitorPushPlugin();

  if (platform === "ios" && FirebaseMessaging) {
    const permission = await FirebaseMessaging.requestPermissions();

    if (permission?.receive !== "granted") {
      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "denied";
    }

    const tokenResult = await FirebaseMessaging.getToken();
    const iosToken = String(tokenResult?.token || "").trim();

    if (!iosToken) {
      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "no-token";
    }

    await persistThisDevice({
      fcmToken: iosToken,
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "granted";
  }

  if (!PushNotifications) {
    console.warn("Capacitor PushNotifications plugin not available.");

    await persistThisDevice({
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "unsupported";
  }

  const permission = await PushNotifications.requestPermissions();

  if (permission?.receive !== "granted") {
    await persistThisDevice({
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "denied";
  }

  let token = "";

  try {
    token = await new Promise(async (resolve, reject) => {
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
  } catch (error) {
    console.warn("Native push registration did not return a token.", error);
  }

  if (!token) {
    await persistThisDevice({
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "no-token";
  }

  await persistThisDevice({
    fcmToken: token,
    notificationsEnabled: true,
    soundEnabled,
    vibrationEnabled,
    recordLogin: true,
  });

  console.log("Native FCM token saved for this device.");
  return "granted";
}

export async function getCurrentDeviceNotificationPreferences() {
  const device = await getCurrentDeviceRecord();
  return normalizePreferences(device);
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
      notificationsEnabled: true,
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
    });

    preferences.delivery = result;
    preferences.saveMessage = messageForStatus(result);
  } else {
    await persistThisDevice({
      notificationsEnabled: false,
      soundEnabled: preferences.soundEnabled,
      vibrationEnabled: preferences.vibrationEnabled,
    });

    preferences.delivery = "disabled";
    preferences.saveMessage = messageForStatus("disabled");
  }

  window.dispatchEvent(
    new CustomEvent("dexp-notification-preferences-changed", {
      detail: preferences,
    }),
  );

  return preferences;
}

export async function getCurrentNotificationStatus() {
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

  if (isCapacitorNative()) {
    if (hasToken) {
      return {
        status: "granted",
        label: "✅ Notifications",
        title: "Native notifications are enabled on this device.",
      };
    }

    return {
      status: "in-app",
      label: "✅ Notifications",
      title:
        "In-app alerts are on. Lock-screen token is not on this device yet.",
    };
  }

  if (!("Notification" in window)) {
    return {
      status: "in-app",
      label: "✅ Notifications",
      title: "In-app alerts are on. Lock-screen push is not available here.",
    };
  }

  if (Notification.permission === "granted") {
    return {
      status: hasToken ? "granted" : "in-app",
      label: "✅ Notifications",
      title: hasToken
        ? "Notifications are enabled on this device."
        : "In-app alerts are on. Lock-screen token was not issued.",
    };
  }

  if (Notification.permission === "denied") {
    return {
      status: "in-app",
      label: "✅ Notifications",
      title:
        "In-app alerts are on. Lock-screen push is blocked in this browser.",
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
  const existingDevice = await getCurrentDeviceRecord();
  const currentPreferences = normalizePreferences(existingDevice);

  const wantNotifications =
    typeof preferenceOverrides.notificationsEnabled === "boolean"
      ? preferenceOverrides.notificationsEnabled
      : currentPreferences.notificationsEnabled;

  const soundEnabled =
    typeof preferenceOverrides.soundEnabled === "boolean"
      ? preferenceOverrides.soundEnabled
      : currentPreferences.soundEnabled;

  const vibrationEnabled =
    typeof preferenceOverrides.vibrationEnabled === "boolean"
      ? preferenceOverrides.vibrationEnabled
      : currentPreferences.vibrationEnabled;

  if (!wantNotifications) {
    await persistThisDevice({
      notificationsEnabled: false,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "disabled";
  }

  if (isCapacitorNative()) {
    try {
      return await registerNativePushToken({
        soundEnabled,
        vibrationEnabled,
      });
    } catch (error) {
      console.error("Native push registration failed.", error);

      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "error";
    }
  }

  try {
    const supported = await isSupported();

    if (!supported || !("Notification" in window)) {
      console.warn("Firebase Messaging is not supported in this browser.");

      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "unsupported";
    }

    if (!firebaseVapidKey || firebaseVapidKey.includes("PASTE_")) {
      console.warn("Missing Firebase Web Push public VAPID key.");

      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "missing-vapid-key";
    }

    let permission = Notification.permission;

    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return permission === "denied" ? "denied" : "in-app";
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

      await persistThisDevice({
        notificationsEnabled: true,
        soundEnabled,
        vibrationEnabled,
        recordLogin: true,
      });

      return "no-token";
    }

    await persistThisDevice({
      fcmToken: token,
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "granted";
  } catch (error) {
    console.error("Web push registration failed.", error);

    await persistThisDevice({
      notificationsEnabled: true,
      soundEnabled,
      vibrationEnabled,
      recordLogin: true,
    });

    return "error";
  }
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