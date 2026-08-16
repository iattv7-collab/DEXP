// functions/notifications/send-notification-push.js
// Sends a push notification when a notification request is created.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const admin = require("firebase-admin");

const {
  getNotificationTargetUids,
  getNotificationTargetDevices,
} = require("./notification-recipients");

const sendPushForNotificationRequest = onDocumentCreated(
  "notificationRequests/{notificationId}",
  async (event) => {
    const notification = event.data?.data();

    if (!notification) {
      return;
    }

    const dealerId = notification.dealerId || "";

    const title = notification.title || "DEXP Notification";

    const body = notification.message || "";

    const targetUids = await getNotificationTargetUids({
      admin,
      notification,
    });

    if (!targetUids.length) {
      return;
    }

    const targetDevices = await getNotificationTargetDevices({
      admin,
      dealerId,
      targetUids,
    });

    if (!targetDevices.length) {
      return;
    }

    const baseData = {
      title,
      body,

      notificationId: event.params.notificationId,

      requestId: String(
        notification.routeParams?.requestId ||
          notification.data?.requestId ||
          "",
      ),

      tagNumber: String(
        notification.routeParams?.tagNumber ||
          notification.relatedTagNumber ||
          "",
      ),

      route: notification.route || "",

      module: notification.module || "",

      eventType: notification.eventType || "",

      relatedRoId: notification.relatedRoId || "",

      relatedRoNumber: String(notification.relatedRoNumber || ""),

      relatedTagNumber: String(notification.relatedTagNumber || ""),
    };

    const sendResults = await Promise.allSettled(
      targetDevices.map((device) => {
        return admin.messaging().send({
          token: device.token,

          // Data-only style message:
          // service worker is responsible for showing the notification.
          data: {
            title: String(title || "DEXP Notification"),
            body: String(body || ""),

            notificationId: String(baseData.notificationId || ""),
            requestId: String(baseData.requestId || ""),
            tagNumber: String(baseData.tagNumber || ""),
            route: String(baseData.route || ""),
            module: String(baseData.module || ""),
            eventType: String(baseData.eventType || ""),
            relatedRoId: String(baseData.relatedRoId || ""),
            relatedRoNumber: String(baseData.relatedRoNumber || ""),
            relatedTagNumber: String(baseData.relatedTagNumber || ""),

            soundEnabled: String(device.soundEnabled !== false),
            vibrationEnabled: String(device.vibrationEnabled !== false),
          },

          android: {
            priority: "high",
            notification: {
              channelId: "dexp_alerts",
              sound: "default",
              priority: "high",
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },

          webpush: {
            headers: {
              Urgency: "high",
              TTL: "300",
            },
            fcmOptions: {
              // optional deep link host page
              link: baseData.route
                ? String(baseData.route)
                : "/pages/dashboard/index.html",
            },
          },
        });
      }),
    );

    const successCount = sendResults.filter(
      (result) => result.status === "fulfilled",
    ).length;

    const failureCount = sendResults.length - successCount;

    await event.data.ref.set(
      {
        pushSentAt: admin.firestore.FieldValue.serverTimestamp(),

        pushSentAtMs: Date.now(),

        pushTargetDeviceCount: targetDevices.length,

        pushSuccessCount: successCount,

        pushFailureCount: failureCount,
      },
      { merge: true },
    );

    sendResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Push failed for notification ${event.params.notificationId}, device ${index + 1}:`,
          result.reason,
        );
      }
    });

    console.log(
      `Push sent for notification ${event.params.notificationId}: ${successCount}/${targetDevices.length}`,
    );
  },
);

module.exports = {
  sendPushForNotificationRequest,
};
