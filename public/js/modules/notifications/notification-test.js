// public/js/modules/notifications/notification-test.js
// Temporary developer test helper for notificationRequests.
// Remove later before production.

import {
  createNotificationRequest,
  NOTIFICATION_TARGET_TYPE,
} from "../../services/firestore/notification-requests-service.js";

import { getSession } from "../../core/session.js";

export async function createTestNotificationForMe(options = {}) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  return createNotificationRequest({
    module: "notifications",
    eventType: "developer_test",

    targetType: NOTIFICATION_TARGET_TYPE.USER,
    targetUserId: session.uid,

    title: options.title || "Notification Test",

    message:
      options.message ||
      "Notification engine is connected and working.",

    route: options.route || "",

    routeParams:
      typeof options.routeParams === "object" &&
      options.routeParams
        ? options.routeParams
        : {},

    sourceType: "developer-test",
    sourceId: session.uid,
  });
}