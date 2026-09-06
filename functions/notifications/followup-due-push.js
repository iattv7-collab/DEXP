// functions/notifications/followup-due-push.js

const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

const followUpDuePush = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    const firestore = admin.firestore();
    const now = Date.now();

    const dueSnapshot = await firestore
      .collection("ros")
      .where("followupDueAtMs", "<=", now)
      .limit(100)
      .get();

    let created = 0;

    for (const roDoc of dueSnapshot.docs) {
      const ro = roDoc.data() || {};

      if (String(ro.followupStatus || "") !== "pending") {
        continue;
      }

      if (String(ro.status || "").toLowerCase() !== "archived") {
        continue;
      }

      if (ro.followup1SentAtMs) {
        continue;
      }

      const advisorId = String(ro.advisorId || "").trim();
      const dealerId = String(ro.dealerId || "").trim();

      if (!advisorId || !dealerId) {
        continue;
      }

      const notificationId = `followup-${roDoc.id}-1`;
      const notificationRef = firestore
        .collection("notificationRequests")
        .doc(notificationId);

      const existing = await notificationRef.get();

      if (!existing.exists) {
        const roNumber = String(ro.roNumber || "");
        const name = String(ro.customerName || "");
        const model = String(ro.model || "");

        await notificationRef.set({
          id: notificationId,
          dealerId,
          module: "ro-followup",
          eventType: "followup_due",
          title: "Follow-up Due",
          message: `RO ${roNumber} – ${name} – ${model}`.replace(/ – $/, ""),
          status: "active",
          targetType: "user",
          targetUserId: advisorId,
          targetUserName: ro.advisorName || "",
          route: "/pages/ro-followup/index.html",
          routeParams: {
            roId: roDoc.id,
            roNumber,
          },
          relatedRoId: roDoc.id,
          relatedRoNumber: roNumber,
          relatedTagNumber: String(ro.tagNumber || ""),
          openedBy: "",
          openedByName: "",
          openedAtMs: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAtMs: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAtMs: now,
        });

        created += 1;
      }

      await roDoc.ref.update({
        followup1SentAtMs: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`Created ${created} follow-up due notifications.`);
  },
);

module.exports = {
  followUpDuePush,
};