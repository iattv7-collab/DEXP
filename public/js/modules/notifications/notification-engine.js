// public/js/modules/notifications/notification-engine.js
// In-app notification engine for DEXP.

import { getSession } from "../../core/session.js";

import {
  listenToActiveNotificationRequests,
  dismissNotificationRequest,
  openNotificationRequest,
} from "../../services/firestore/notification-requests-service.js";

import { getNotificationGroups } from "../../services/firestore/notification-groups-service.js";

let unsubscribeNotifications = null;
let userGroupIds = [];

export async function startNotificationEngine() {
  const session = getSession();

  if (!session?.uid || !session?.dealerId) {
    return;
  }

  stopNotificationEngine();

  const groups = await getNotificationGroups();

  userGroupIds = groups
    .filter(
      (group) =>
        Array.isArray(group.memberUids) &&
        group.memberUids.includes(session.uid),
    )
    .map((group) => group.id);

  unsubscribeNotifications = listenToActiveNotificationRequests((requests) => {
    const visibleNotifications = getVisibleNotifications(requests, session);

    renderNotificationTray(visibleNotifications);
  });
}

export function stopNotificationEngine() {
  if (typeof unsubscribeNotifications === "function") {
    unsubscribeNotifications();
  }

  unsubscribeNotifications = null;
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

      await openNotificationRequest(notificationId);

      window.location.href = buildNotificationRoute(notification);
    });
  });

  tray.querySelectorAll("[data-dismiss-notification-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const notificationId = button.dataset.dismissNotificationId;

      await dismissNotificationRequest(notificationId);
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
    [
      "followup_due",
      "pickup_request",
      "move_request",
      "developer_test",
    ].includes(eventType);

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
