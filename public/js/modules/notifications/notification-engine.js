// public/js/modules/notifications/notification-engine.js
// In-app notification engine for DEXP.

import { getSession } from "../../core/session.js";

import {
  listenToActiveNotificationRequests,
  dismissNotificationRequest,
  openNotificationRequest,
  releaseStaleOpenedNotificationRequest,
} from "../../services/firestore/notification-requests-service.js";

import { getNotificationGroups } from "../../services/firestore/notification-groups-service.js";

import { getCurrentDeviceNotificationPreferences } from "../../services/firebase/messaging-service.js";

import {
  NOTIFICATION_CONFIG,
  getNotificationSoundPath,
  getNotificationVolume,
  getNotificationVibration,
} from "../../config/notification-config.js";

let unsubscribeNotifications = null;
let userGroupIds = [];
let notificationPreferences = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

let initialNotificationSnapshotLoaded = false;

const alertedNotificationIds = new Set();

const notificationAudioCache = new Map();

let currentVisibleNotifications = [];

let notificationAlertTimer = null;

const ringingNotificationIds = new Set();

const silencedNotificationIds = new Set();

const NOTIFICATION_ALERT_REPEAT_MS = NOTIFICATION_CONFIG.repeatDelayMs;

const OPENED_NOTIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

export async function startNotificationEngine() {
  const session = getSession();

  if (!session?.uid || !session?.dealerId) {
    return;
  }

  stopNotificationEngine();
  notificationPreferences = {
  notificationsEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
};

  initialNotificationSnapshotLoaded = false;
  alertedNotificationIds.clear();

  getCurrentDeviceNotificationPreferences()
  .then((preferences) => {
    notificationPreferences = preferences;
  })
  .catch((error) => {
    console.warn(
      "Could not load device notification preferences.",
      error,
    );
  });

const groups = await getNotificationGroups();

  userGroupIds = groups
    .filter(
      (group) =>
        Array.isArray(group.memberUids) &&
        group.memberUids.includes(session.uid),
    )
    .map((group) => group.id);

  unsubscribeNotifications = listenToActiveNotificationRequests((requests) => {
    releaseStaleOpenedNotifications(requests, session);

    const visibleNotifications = getVisibleNotifications(requests, session);

    processNewNotificationAlerts(visibleNotifications);

    renderNotificationTray(
      notificationPreferences.notificationsEnabled ? visibleNotifications : [],
    );
  });
}

export function stopNotificationEngine() {
  if (typeof unsubscribeNotifications === "function") {
    unsubscribeNotifications();
  }

  unsubscribeNotifications = null;

  ringingNotificationIds.clear();
  silencedNotificationIds.clear();

  stopRepeatingNotificationAlert();
}

window.addEventListener("dexp-notification-preferences-changed", (event) => {
  notificationPreferences = {
    ...notificationPreferences,
    ...(event.detail || {}),
  };

  if (!notificationPreferences.notificationsEnabled) {
    ringingNotificationIds.clear();

    stopRepeatingNotificationAlert();

    renderNotificationTray([]);
  }
});

function processNewNotificationAlerts(notifications = []) {
  currentVisibleNotifications = notifications;
  const visibleIds = new Set(
    notifications.map((notification) => notification?.id).filter(Boolean),
  );

  ringingNotificationIds.forEach((notificationId) => {
    if (!visibleIds.has(notificationId)) {
      ringingNotificationIds.delete(notificationId);
    }
  });

  if (!initialNotificationSnapshotLoaded) {
    notifications.forEach((notification) => {
      if (notification?.id) {
        alertedNotificationIds.add(notification.id);
      }
    });

    initialNotificationSnapshotLoaded = true;
    stopRepeatingNotificationAlert();
    return;
  }

  notifications.forEach((notification) => {
    if (!notification?.id) {
      return;
    }

    if (
      !alertedNotificationIds.has(notification.id) &&
      !silencedNotificationIds.has(notification.id)
    ) {
      ringingNotificationIds.add(notification.id);
    }

    alertedNotificationIds.add(notification.id);
  });

  if (ringingNotificationIds.size) {
    startRepeatingNotificationAlert();
  } else {
    stopRepeatingNotificationAlert();
  }
}

function triggerNotificationAlert() {
  if (
    !notificationPreferences.notificationsEnabled ||
    !ringingNotificationIds.size
  ) {
    stopRepeatingNotificationAlert();
    return;
  }

  const notification = [...ringingNotificationIds]
    .map((id) =>
      currentVisibleNotifications.find(
        (item) => item.id === id,
      ),
    )
    .find(Boolean);

  if (!notification) {
    return;
  }

  if (notificationPreferences.soundEnabled) {
    playNotificationSound(notification);
  }

  if (
    notificationPreferences.vibrationEnabled &&
    typeof navigator.vibrate === "function"
  ) {
    navigator.vibrate(
      getNotificationVibration(notification),
    );
  }
}

function startRepeatingNotificationAlert() {
  if (notificationAlertTimer) {
    return;
  }

  triggerNotificationAlert();

  notificationAlertTimer = window.setTimeout(() => {
    triggerNotificationAlert();

    ringingNotificationIds.clear();

    stopRepeatingNotificationAlert();
  }, NOTIFICATION_ALERT_REPEAT_MS);
}

function stopRepeatingNotificationAlert() {
  if (notificationAlertTimer) {
    window.clearTimeout(notificationAlertTimer);
    notificationAlertTimer = null;
  }

  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(0);
  }
}

function silenceNotificationAlert(notificationId) {
  const safeNotificationId = String(notificationId || "").trim();

  if (!safeNotificationId) {
    return;
  }

  silencedNotificationIds.add(safeNotificationId);
  ringingNotificationIds.delete(safeNotificationId);

  if (!ringingNotificationIds.size) {
    stopRepeatingNotificationAlert();
  }
}

function playNotificationSound(notification = {}) {
  try {
    const soundPath = getNotificationSoundPath(notification);

    let audio = notificationAudioCache.get(soundPath);

    if (!audio) {
      audio = new Audio(soundPath);
      audio.preload = "auto";

      notificationAudioCache.set(soundPath, audio);
    }

    audio.pause();
    audio.currentTime = 0;

    audio.volume = getNotificationVolume(notification);

    audio.play().catch((error) => {
      console.warn("Browser blocked notification sound.", error);
    });
  } catch (error) {
    console.warn("Could not play notification sound.", error);
  }
}

function releaseStaleOpenedNotifications(requests = [], session) {
  requests.forEach((item) => {
    if (!item || item.status !== "active") {
      return;
    }

    if (!item.openedBy || !item.openedAtMs) {
      return;
    }

    const belongsToUser =
      item.targetType === "user" && item.targetUserId === session.uid;

    const belongsToUserGroup =
      item.targetType === "group" && userGroupIds.includes(item.targetGroupId);

    if (!belongsToUser && !belongsToUserGroup) {
      return;
    }

    const openedTooLong =
      Date.now() - Number(item.openedAtMs) > OPENED_NOTIFICATION_TIMEOUT_MS;

    if (!openedTooLong) {
      return;
    }

    releaseStaleOpenedNotificationRequest(
      item.id,
      OPENED_NOTIFICATION_TIMEOUT_MS,
    ).catch((error) => {
      console.error("Could not release stale notification.", error);
    });
  });
}

function getVisibleNotifications(requests = [], session) {
  return requests.filter((item) => {
    if (!item || item.status !== "active") {
      return false;
    }

    if (item.dismissedBy?.[session.uid]) {
      return false;
    }

    if (item.expiresAtMs && Date.now() > item.expiresAtMs) {
      return false;
    }

    if (item.openedBy) {
      return false;
    }

    if (item.targetType === "user" && item.targetUserId === session.uid) {
      return true;
    }

    if (
      item.targetType === "group" &&
      userGroupIds.includes(item.targetGroupId)
    ) {
      return true;
    }

    return false;
  });
}

function renderNotificationTray(notifications = []) {
  let tray = document.getElementById("dexpNotificationTray");

  if (!tray) {
    tray = document.createElement("div");
    tray.id = "dexpNotificationTray";
    tray.className = "dexp-notification-tray";

    document.body.appendChild(tray);
  }

  if (!notifications.length) {
    tray.innerHTML = "";
    tray.style.display = "none";
    return;
  }

  tray.style.display = "block";

  tray.innerHTML = notifications
    .map((item) => renderNotificationCard(item))
    .join("");

  tray.querySelectorAll("[data-open-notification-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notificationId = button.dataset.openNotificationId;

      const notification = notifications.find(
        (item) => item.id === notificationId,
      );

      if (!notification?.route) {
        return;
      }

      silenceNotificationAlert(notificationId);

      await openNotificationRequest(notificationId);

      window.location.href = buildNotificationRoute(notification);
    });
  });

  tray.querySelectorAll("[data-dismiss-notification-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notificationId = button.dataset.dismissNotificationId;

      silenceNotificationAlert(notificationId);

      await dismissNotificationRequest(notificationId);
    });
  });

  tray.querySelectorAll("[data-silence-notification-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const notificationId = button.dataset.silenceNotificationId;

      silenceNotificationAlert(notificationId);

      button.textContent = "Silenced";
      button.disabled = true;
    });
  });
}

function renderNotificationCard(item) {
  const eventType = String(item.eventType || "").trim();

  const hasRoute = Boolean(String(item.route || "").trim());

  const isOpened = Boolean(String(item.openedBy || "").trim());

  const openedByName = item.openedByName || "another user";

  const showOpen =
    !isOpened &&
    hasRoute &&
    (item.module === "requests" ||
      ["followup_due", "developer_test"].includes(eventType));

  const showDismiss =
    !isOpened &&
    ["waiter_alert", "followup_due", "developer_test"].includes(eventType);

  return `
    <div class="dexp-notification-card ${isOpened ? "dexp-notification-card-opened" : ""}">
      <div class="dexp-notification-title">
        ${escapeHtml(item.title)}
      </div>

      <div class="dexp-notification-message">
        ${escapeHtml(item.message)}
      </div>

      ${
        isOpened
          ? `
            <div class="dexp-notification-opened-label">
              Opened by ${escapeHtml(openedByName)}
            </div>
          `
          : ""
      }

      <div class="dexp-notification-actions">

      ${
        ringingNotificationIds.has(item.id)
          ? `
      <button
        type="button"
        class="dexp-notification-silence"
        data-silence-notification-id="${item.id}"
      >
        Silence
      </button>
    `
          : ""
      }

        ${
          showOpen
            ? `
              <button
                type="button"
                class="dexp-notification-open"
                data-open-notification-id="${item.id}"
              >
                Open
              </button>
            `
            : ""
        }

        ${
          showDismiss
            ? `
              <button
                type="button"
                class="dexp-notification-dismiss"
                data-dismiss-notification-id="${item.id}"
              >
                Dismiss
              </button>
            `
            : ""
        }

      </div>
    </div>
  `;
}

function buildNotificationRoute(notification) {
  const route = String(notification.route || "").trim();

  const routeParams =
    typeof notification.routeParams === "object" && notification.routeParams
      ? notification.routeParams
      : {};

  const params = new URLSearchParams();

  Object.entries(routeParams).forEach(([key, value]) => {
    if (
      key &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();

  if (!queryString) {
    return route;
  }

  return `${route}?${queryString}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
