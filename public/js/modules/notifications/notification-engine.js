// public/js/modules/notifications/notification-engine.js
// In-app notification engine for DEXP.

import { getSession } from "../../core/session.js";

import {
  listenToActiveNotificationRequests,
  dismissNotificationRequest,
  openNotificationRequest,
  releaseStaleOpenedNotificationRequest,
  resolveNotificationRequest,
} from "../../services/firestore/notification-requests-service.js";

import { acknowledgeAppointmentArrived } from "../../services/firestore/appointments-service.js";

import { getNotificationGroups } from "../../services/firestore/notification-groups-service.js";

import { getCurrentDeviceNotificationPreferences } from "../../services/firebase/messaging-service.js";
import { app } from "../../services/firebase/firebase-app.js";
import {
  getMessaging,
  isSupported,
  onMessage,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

import {
  NOTIFICATION_CONFIG,
  getNotificationSoundPath,
  getNotificationVolume,
  getNotificationVibration,
} from "../../config/notification-config.js";

let unsubscribeNotifications = null;
let unsubscribeForegroundPush = null;
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

let notificationTrayExpanded = false;

let notificationAlertTimer = null;

const ringingNotificationIds = new Set();

const silencedNotificationIds = new Set();

const popupNotificationIds = new Set();

const openSystemNotifications = new Map();

const NOTIFICATION_ALERT_REPEAT_MS = NOTIFICATION_CONFIG.repeatDelayMs;

const OPENED_NOTIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

function canVibrate() {
  return (
    typeof navigator.vibrate === "function" &&
    navigator.userActivation?.hasBeenActive === true
  );
}

export async function startNotificationEngine() {
  const session = getSession();

  if (!session?.uid || !session?.dealerId) {
    return;
  }

  stopNotificationEngine();
  document.addEventListener("pointerdown", unlockNotificationAlerts, {
    once: true,
  });

  document.addEventListener("keydown", unlockNotificationAlerts, {
    once: true,
  });
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
      console.warn("Could not load device notification preferences.", error);
    });

  const groups = await getNotificationGroups();

  userGroupIds = groups
    .filter(
      (group) =>
        Array.isArray(group.memberUids) &&
        group.memberUids.includes(session.uid),
    )
    .map((group) => group.id);

  startForegroundPushListener();

  unsubscribeNotifications = listenToActiveNotificationRequests((requests) => {
    releaseStaleOpenedNotifications(requests, session);

    const visibleNotifications = getVisibleNotifications(requests, session);

    processNewNotificationAlerts(visibleNotifications);

    renderNotificationTray(visibleNotifications);
    renderDesktopPopups(
      notificationPreferences.notificationsEnabled ? visibleNotifications : [],
    );
  });
}

export function stopNotificationEngine() {
  if (typeof unsubscribeNotifications === "function") {
    unsubscribeNotifications();
  }

  unsubscribeNotifications = null;

  if (typeof unsubscribeForegroundPush === "function") {
    unsubscribeForegroundPush();
  }
  unsubscribeForegroundPush = null;

  ringingNotificationIds.clear();
  silencedNotificationIds.clear();
  popupNotificationIds.clear();

  stopRepeatingNotificationAlert();
  renderDesktopPopups([]);
}

window.addEventListener("dexp-notification-preferences-changed", (event) => {
  notificationPreferences = {
    ...notificationPreferences,
    ...(event.detail || {}),
  };

  if (!notificationPreferences.notificationsEnabled) {
    ringingNotificationIds.clear();
    popupNotificationIds.clear();

    stopRepeatingNotificationAlert();
    renderDesktopPopups([]);
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

  popupNotificationIds.forEach((notificationId) => {
    if (!visibleIds.has(notificationId)) {
      popupNotificationIds.delete(notificationId);
      closeSystemNotification(notificationId);
    }
  });

  alertedNotificationIds.forEach((notificationId) => {
    if (!visibleIds.has(notificationId)) {
      alertedNotificationIds.delete(notificationId);
    }
  });

  silencedNotificationIds.forEach((notificationId) => {
    if (!visibleIds.has(notificationId)) {
      silencedNotificationIds.delete(notificationId);
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
      popupNotificationIds.add(notification.id);
      showSystemNotification(notification);
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
    .map((id) => currentVisibleNotifications.find((item) => item.id === id))
    .find(Boolean);

  if (!notification) {
    return;
  }

  if (notificationPreferences.soundEnabled) {
    playNotificationSound(notification);
  }

  if (notificationPreferences.vibrationEnabled && canVibrate()) {
    navigator.vibrate(getNotificationVibration(notification));
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

  if (canVibrate()) {
    navigator.vibrate(0);
  }
}

function pageIsInForeground() {
  return document.visibilityState === "visible" && document.hasFocus();
}

async function startForegroundPushListener() {
  if (typeof unsubscribeForegroundPush === "function") {
    unsubscribeForegroundPush();
    unsubscribeForegroundPush = null;
  }

  try {
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    unsubscribeForegroundPush = onMessage(messaging, (payload) => {
      const data = payload?.data || {};
      showSystemNotification(
        {
          id: data.notificationId || data.id || "dexp-notification",
          title: data.title || payload?.notification?.title || "DEXP Notification",
          message: data.body || payload?.notification?.body || "",
        },
        { force: true },
      );
    });
  } catch (error) {
    console.warn("Could not listen for desktop push messages.", error);
  }
}

function showSystemNotification(notification = {}, options = {}) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  if (!options.force && pageIsInForeground()) {
    return;
  }

  try {
    const systemNotification = new Notification(
      String(notification.title || "DEXP Notification"),
      {
        body: String(notification.message || ""),
        icon: "/assets/logo-v2.png",
        badge: "/assets/logo-v2.png",
        tag: String(notification.id || `dexp-${Date.now()}`),
        renotify: true,
        requireInteraction: true,
        silent: notificationPreferences.soundEnabled === false,
      },
    );

    systemNotification.onclick = () => {
      window.focus();
      systemNotification.close();
    };
  } catch (error) {
    console.warn("Could not show desktop system notification.", error);
  }
}

function closeSystemNotification(notificationId = "") {
  const tag = String(notificationId || "").trim();
  if (!tag || !navigator.serviceWorker?.ready) {
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => registration.getNotifications({ tag }))
    .then((notifications) => {
      notifications.forEach((notification) => notification.close());
    })
    .catch((error) => {
      console.warn("Could not close desktop notification.", error);
    });
}

function silenceNotificationAlert(notificationId) {
  const safeNotificationId = String(notificationId || "").trim();

  if (!safeNotificationId) {
    return;
  }

  silencedNotificationIds.add(safeNotificationId);
  ringingNotificationIds.delete(safeNotificationId);
  popupNotificationIds.delete(safeNotificationId);
  closeSystemNotification(safeNotificationId);

  if (!ringingNotificationIds.size) {
    stopRepeatingNotificationAlert();
  }
}

function unlockNotificationAlerts() {
  const soundPaths = Object.values(NOTIFICATION_CONFIG.sounds || {});

  soundPaths.forEach((soundPath) => {
    let audio = notificationAudioCache.get(soundPath);

    if (!audio) {
      audio = new Audio(soundPath);
      audio.preload = "auto";

      notificationAudioCache.set(soundPath, audio);
    }

    const previousVolume = audio.volume;

    audio.volume = 0;
    audio.currentTime = 0;

    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      })
      .catch((error) => {
        audio.volume = previousVolume;

        console.warn("Could not unlock notification audio.", error);
      });
  });

  if (canVibrate()) {
    navigator.vibrate(1);
    navigator.vibrate(0);
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
  const headerButton = document.getElementById("headerAlertsButton");
  const headerCount = document.getElementById("headerAlertsCount");

  let tray = document.getElementById("dexpNotificationTray");

  if (!tray) {
    tray = document.createElement("div");
    tray.id = "dexpNotificationTray";
    tray.className = "dexp-notification-tray";
    document.body.appendChild(tray);
    ensureCompactTrayStyles();
  }

  const count = notifications.length;

  if (headerButton && headerCount) {
    headerCount.textContent = String(count);
    headerButton.style.display = count ? "" : "none";

    if (count) {
      headerButton.classList.add("is-open");
    } else {
      headerButton.classList.remove("is-open");
    }

    headerButton.onclick = () => {
      notificationTrayExpanded = !notificationTrayExpanded;
      renderNotificationTray(notifications);
    };
  }

  if (!count) {
    notificationTrayExpanded = false;
    tray.innerHTML = "";
    tray.style.display = "none";
    return;
  }

  if (!notificationTrayExpanded) {
    tray.innerHTML = "";
    tray.style.display = "none";
    return;
  }

  tray.style.display = "block";

  tray.innerHTML = `
    <div class="dexp-notification-inbox">
      <div class="dexp-notification-inbox-head">
        <strong>Alerts (${count})</strong>
        <button
          type="button"
          class="dexp-notification-collapse-button"
          id="dexpNotificationCollapseButton"
        >
          Hide
        </button>
      </div>
      ${notifications.map((item) => renderNotificationCard(item)).join("")}
    </div>
  `;

  document
    .getElementById("dexpNotificationCollapseButton")
    ?.addEventListener("click", () => {
      notificationTrayExpanded = false;
      renderNotificationTray(notifications);
    });

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
      const notification = notifications.find(
        (item) => item.id === notificationId,
      );
      silenceNotificationAlert(notificationId);
      await handleDismissNotification(notification || { id: notificationId });
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

async function handleDismissNotification(notification = {}) {
  const eventType = String(notification.eventType || "").trim();
  const notificationId = String(notification.id || "").trim();

  if (eventType === "appointment_arrived") {
    const appointmentId = String(
      notification.relatedAppointmentId ||
        notification.sourceId ||
        notificationId.replace(/^appt-arrived-/, ""),
    ).trim();

    if (appointmentId) {
      try {
        await acknowledgeAppointmentArrived(appointmentId);
        return;
      } catch (error) {
        console.warn("Could not acknowledge arrived appointment.", error);
      }
    }

    if (notificationId) {
      await resolveNotificationRequest(notificationId);
    }
    return;
  }

  await dismissNotificationRequest(notificationId);
}

function renderDesktopPopups(notifications = []) {
  let host = document.getElementById("dexpDesktopPopupHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "dexpDesktopPopupHost";
    document.body.appendChild(host);
    ensureCompactTrayStyles();
  }

  const popups = [...popupNotificationIds]
    .map((id) => notifications.find((item) => item.id === id))
    .filter(Boolean);

  if (!popups.length) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }

  host.style.display = "flex";
  host.innerHTML = popups
    .map(
      (item) => `
      <div class="dexp-desktop-popup" data-popup-id="${escapeHtml(item.id)}">
        <div class="dexp-desktop-popup-kicker">New alert</div>
        <div class="dexp-notification-title">${escapeHtml(item.title)}</div>
        <div class="dexp-notification-message">${escapeHtml(item.message)}</div>
        <div class="dexp-notification-actions">
          ${
            item.route
              ? `<button type="button" class="dexp-notification-open" data-popup-open-id="${escapeHtml(item.id)}">Open</button>`
              : ""
          }
          <button type="button" class="dexp-notification-dismiss" data-popup-dismiss-id="${escapeHtml(item.id)}">Dismiss</button>
        </div>
      </div>
    `,
    )
    .join("");

  host.querySelectorAll("[data-popup-open-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notificationId = button.dataset.popupOpenId;
      const notification = popups.find((item) => item.id === notificationId);
      if (!notification?.route) return;
      silenceNotificationAlert(notificationId);
      renderDesktopPopups(
        currentVisibleNotifications.filter((item) => popupNotificationIds.has(item.id)),
      );
      await openNotificationRequest(notificationId);
      window.location.href = buildNotificationRoute(notification);
    });
  });

  host.querySelectorAll("[data-popup-dismiss-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notificationId = button.dataset.popupDismissId;
      const notification = popups.find((item) => item.id === notificationId);
      silenceNotificationAlert(notificationId);
      renderDesktopPopups(
        currentVisibleNotifications.filter((item) => popupNotificationIds.has(item.id)),
      );
      await handleDismissNotification(notification || { id: notificationId });
    });
  });
}

function ensureCompactTrayStyles() {
  if (document.getElementById("dexpCompactTrayStyles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "dexpCompactTrayStyles";
  style.textContent = `
    #dexpNotificationTray {
      position: fixed;
      top: 64px;
      right: 12px;
      z-index: 9990;
      width: auto;
      max-width: 360px;
    }

    .dexp-notification-count-button {
      min-width: 120px;
    }

    .dexp-notification-inbox {
      width: 360px;
      max-width: 92vw;
      max-height: 70vh;
      overflow: auto;
      background: #fff;
      border: 1px solid #cfd6df;
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0,0,0,.18);
      padding: 10px;
    }

    .dexp-notification-inbox-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .dexp-notification-card {
      margin: 0 0 8px 0;
    }

    #dexpDesktopPopupHost {
      position: fixed;
      top: 72px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: none;
      flex-direction: column;
      gap: 10px;
      width: min(420px, 92vw);
      pointer-events: none;
    }

    .dexp-desktop-popup {
      pointer-events: auto;
      background: #fff;
      border: 2px solid #c62828;
      border-radius: 10px;
      box-shadow: 0 16px 40px rgba(0,0,0,.28);
      padding: 14px 16px;
    }

    .dexp-desktop-popup-kicker {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #c62828;
      margin-bottom: 4px;
    }
  `;

  document.head.appendChild(style);
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
      ["followup_due", "developer_test", "appointment_arrived"].includes(
        eventType,
      ));

  const showDismiss =
    !isOpened &&
    ["waiter_alert", "followup_due", "developer_test", "appointment_arrived"].includes(
      eventType,
    );

  return `
    <div class="dexp-notification-card ${isOpened ? "dexp-notification-card-opened" : ""}">
      <div class="dexp-notification-title">
        ${escapeHtml(item.title)}
      </div>

      <div class="dexp-notification-message">
        ${escapeHtml(item.message)}
      </div>

      ${isOpened
      ? `
            <div class="dexp-notification-opened-label">
              Opened by ${escapeHtml(openedByName)}
            </div>
          `
      : ""
    }

      <div class="dexp-notification-actions">

      ${ringingNotificationIds.has(item.id)
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

        ${showOpen
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

        ${showDismiss
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
