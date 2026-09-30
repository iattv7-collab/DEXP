// functions/notifications/notification-recipients.js
// Shared recipient and device resolution for DEXP notifications.

async function getNotificationTargetUids({ admin, notification = {} }) {
  const dealerId = String(notification.dealerId || "").trim();

  let targetUids = [];

  if (notification.targetType === "user" && notification.targetUserId) {
    targetUids = [String(notification.targetUserId).trim()];
  }

  if (notification.targetType === "group" && notification.targetGroupId) {
    const groupSnapshot = await admin
      .firestore()
      .doc(`notificationGroups/${notification.targetGroupId}`)
      .get();

    if (groupSnapshot.exists) {
      const group = groupSnapshot.data();

      if (group.dealerId === dealerId && Array.isArray(group.memberUids)) {
        targetUids = group.memberUids;
      }
    }
  }

  targetUids = Array.from(
    new Set(targetUids.map((uid) => String(uid || "").trim()).filter(Boolean)),
  );

  if (
    String(notification.eventType || "") !== "finish_move_nag" &&
    targetUids.length
  ) {
    const route = String(notification.route || "").toLowerCase();
    const isMovePing =
      route.includes("move-locate") ||
      String(notification.module || "") === "move-locate";

    if (isMovePing) {
      const movingSnap = await admin
        .firestore()
        .collection("ros")
        .where("moveStatus", "==", "moving")
        .limit(200)
        .get();

      const busyUids = new Set();

      movingSnap.forEach((docSnap) => {
        const uid = String(docSnap.data()?.moveStartedByUid || "").trim();
        if (uid) {
          busyUids.add(uid);
        }
      });

      targetUids = targetUids.filter((uid) => !busyUids.has(String(uid)));
    }
  }

  return targetUids;
}

async function getNotificationTargetDevices({
  admin,
  dealerId = "",
  targetUids = [],
}) {
  const devicesByToken = new Map();
  const now = Date.now();
  const STALE_DEVICE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

  for (const uid of targetUids) {
    const devicesSnapshot = await admin
      .firestore()
      .collection(`users/${uid}/devices`)
      .where("dealerId", "==", dealerId)
      .where("active", "==", true)
      .where("notificationsEnabled", "==", true)
      .get();

    devicesSnapshot.forEach((deviceDocument) => {
      const device = deviceDocument.data();

      const token = String(device.fcmToken || "").trim();

      if (!token) {
        return;
      }

      const lastSeenAtMs = Number(device.lastSeenAtMs || 0);

      // Safety net: ignore devices that have not been seen recently
      if (lastSeenAtMs > 0 && now - lastSeenAtMs > STALE_DEVICE_MS) {
        return;
      }

      devicesByToken.set(token, {
        token,

        soundEnabled:
          typeof device.soundEnabled === "boolean" ? device.soundEnabled : true,

        vibrationEnabled:
          typeof device.vibrationEnabled === "boolean"
            ? device.vibrationEnabled
            : true,
      });
    });
  }

  return Array.from(devicesByToken.values());
}
module.exports = {
  getNotificationTargetUids,
  getNotificationTargetDevices,
};
