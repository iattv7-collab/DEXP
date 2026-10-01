// functions/notifications/finish-move-nag.js
// Nags the valet who started a move until they Save or Cancel.
// First send after they leave the page (finishMoveLeftAtMs).
// Then every 3 minutes. Same notification id so it replaces, not stacks.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const {
  getNotificationTargetDevices,
} = require("./notification-recipients");

const NAG_EVERY_MS = 1 * 60 * 1000;
const STALE_MOVE_MS = 20 * 60 * 1000;

const finishMoveNag = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    const firestore = admin.firestore();
    const now = Date.now();

    const movingSnapshot = await firestore
      .collection("ros")
      .where("moveStatus", "==", "moving")
      .limit(200)
      .get();

    let sent = 0;

    for (const roDoc of movingSnapshot.docs) {
      const ro = roDoc.data() || {};
      const uid = String(ro.moveStartedByUid || "").trim();
      const dealerId = String(ro.dealerId || "").trim();
      const leftAt = Number(ro.finishMoveLeftAtMs || 0);
      const lastNag = Number(ro.finishMoveNagAtMs || 0);
      const startedAt = Number(ro.moveStartedAt || 0);

      if (!uid || !dealerId) {
        continue;
      }

      if (!lastNag) {
        // first ping on the next 1-min tick after Start Move
      } else if (now - lastNag < NAG_EVERY_MS) {
        continue;
      }

      const tag = String(ro.tagNumber || "").trim();
      const roNumber = String(ro.roNumber || "").trim();
      const stale = startedAt > 0 && now - startedAt >= STALE_MOVE_MS;
      const notificationId = `finish-move-${roDoc.id}`;

      const title = stale
        ? `Finish stale move — tag ${tag || roNumber}`
        : `Finish move — tag ${tag || roNumber}`;

      const body = stale
        ? `Started ${formatClock(startedAt)}. Save lot or Cancel. After 20 min another valet can Override.`
        : `Save lot or Cancel. Tag ${tag || "—"} · RO ${roNumber || "—"}.`;

      const notificationRef = firestore
        .collection("notificationRequests")
        .doc(notificationId);

      await notificationRef.set(
        {
          id: notificationId,
          dealerId,
          module: "move-locate",
          eventType: "finish_move_nag",
          title,
          message: body,
          status: "active",
          targetType: "user",
          targetUserId: uid,
          targetUserName: String(ro.moveStartedBy || ""),
          route: "/pages/move-locate/move-locate.html",
          routeParams: {
            tagNumber: tag,
          },
          relatedRoId: roDoc.id,
          relatedRoNumber: roNumber,
          relatedTagNumber: tag,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: now,
        },
        { merge: true },
      );

      const devices = await getNotificationTargetDevices({
        admin,
        dealerId,
        targetUids: [uid],
      });

      if (devices.length) {
        await Promise.allSettled(
          devices.map((device) => {
            return admin.messaging().send({
              token: device.token,
              data: {
                title,
                body,
                notificationId,
                tagNumber: tag,
                route: "/pages/move-locate/move-locate.html",
                module: "move-locate",
                eventType: "finish_move_nag",
                relatedRoId: String(roDoc.id),
                relatedRoNumber: roNumber,
                relatedTagNumber: tag,
                soundEnabled: String(device.soundEnabled !== false),
                vibrationEnabled: String(device.vibrationEnabled !== false),
              },
              android: {
                collapseKey: notificationId,
                priority: "high",
                notification: {
                  channelId: "dexp_alerts",
                  tag: notificationId,
                  sound: "default",
                  priority: "high",
                  defaultSound: true,
                  defaultVibrateTimings: true,
                },
              },
              webpush: {
                headers: {
                  Urgency: "high",
                  TTL: "180",
                },
                fcmOptions: {
                  link: `/pages/move-locate/move-locate.html?tagNumber=${encodeURIComponent(tag)}`,
                },
              },
            });
          }),
        );
        sent += 1;
      }

      await roDoc.ref.update({
        finishMoveNagAtMs: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const activeNags = await firestore
      .collection("notificationRequests")
      .where("eventType", "==", "finish_move_nag")
      .where("status", "==", "active")
      .limit(200)
      .get();

    for (const alertDoc of activeNags.docs) {
      const alert = alertDoc.data() || {};
      const roId = String(alert.relatedRoId || "").trim();
      if (!roId) {
        continue;
      }

      const roSnap = await firestore.collection("ros").doc(roId).get();
      const ro = roSnap.exists ? roSnap.data() || {} : {};

      if (String(ro.moveStatus || "") === "moving") {
        continue;
      }

      await alertDoc.ref.update({
        status: "resolved",
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedAtMs: now,
        resolvedBy: "finishMoveNag",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAtMs: now,
      });
    }

    console.log(`Finish-move nags sent: ${sent}`);
  },
);

function formatClock(ms) {
  if (!ms) {
    return "—";
  }
  try {
    return new Date(ms).toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch (error) {
    return "—";
  }
}

module.exports = {
  finishMoveNag,
};
