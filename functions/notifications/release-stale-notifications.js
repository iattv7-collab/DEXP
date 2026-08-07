// functions/notifications/release-stale-notifications.js
// Releases stale opened notifications and processes waiter reminders.
// This is a direct move from functions/index.js with no workflow changes.

const {
  onSchedule,
} = require("firebase-functions/v2/scheduler");

const admin = require("firebase-admin");

const releaseStaleNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    const firestore = admin.firestore();
    const now = Date.now();
    const staleCutoff = now - 5 * 60 * 1000;

    // =========================
    // RELEASE STALE NOTIFICATIONS
    // =========================

    const staleSnapshot = await firestore
      .collection("notificationRequests")
      .where("status", "==", "active")
      .get();

    const staleUpdates = [];

    staleSnapshot.forEach((docSnap) => {
      const notification = docSnap.data();

      if (
        !notification.openedBy ||
        !notification.openedAtMs
      ) {
        return;
      }

      if (
        notification.openedAtMs >
        staleCutoff
      ) {
        return;
      }

      staleUpdates.push(
        docSnap.ref.update({
          openedBy: "",
          openedByName: "",
          openedAtMs: null,

          updatedAt:
            admin.firestore.FieldValue
              .serverTimestamp(),

          updatedAtMs: now,
        }),
      );
    });

    await Promise.all(staleUpdates);

    console.log(
      `Released ${staleUpdates.length} stale notifications.`,
    );

    // =========================
    // PROCESS WAITER REMINDERS
    // =========================

    const dueWaitersSnapshot =
      await firestore
        .collection("ros")
        .where(
          "waiterNextReminderAtMs",
          "<=",
          now,
        )
        .limit(100)
        .get();

    let waiterNotificationsCreated = 0;

    for (
      const waiterDoc of
      dueWaitersSnapshot.docs
    ) {
      const created =
        await firestore.runTransaction(
          async (transaction) => {
            const currentSnapshot =
              await transaction.get(
                waiterDoc.ref,
              );

            if (
              !currentSnapshot.exists
            ) {
              return false;
            }

            const ro =
              currentSnapshot.data();

            const isWaiter = Boolean(
              ro.isWaiter ||
              ro.customerWaiting,
            );

            const readyCalled = Boolean(
              ro.readyCalled ||
              String(
                ro.status || "",
              ).toLowerCase() ===
                "ready called",
            );

            const archived =
              String(
                ro.status || "",
              ).toLowerCase() ===
              "archived";

            const scheduledReminderAtMs =
              Number(
                ro.waiterNextReminderAtMs ||
                  0,
              );

            if (
              !isWaiter ||
              readyCalled ||
              archived ||
              !scheduledReminderAtMs ||
              scheduledReminderAtMs > now
            ) {
              return false;
            }

            const advisorId = String(
              ro.advisorId || "",
            ).trim();

            const dealerId = String(
              ro.dealerId || "",
            ).trim();

            if (
              !advisorId ||
              !dealerId
            ) {
              console.warn(
                `Waiter reminder skipped for RO ${currentSnapshot.id}: missing advisorId or dealerId.`,
              );

              return false;
            }

            const notificationId =
              `waiter-${currentSnapshot.id}-${scheduledReminderAtMs}`;

            const notificationRef =
              firestore
                .collection(
                  "notificationRequests",
                )
                .doc(notificationId);

            const notificationSnapshot =
              await transaction.get(
                notificationRef,
              );

            if (
              !notificationSnapshot.exists
            ) {
              const roNumber =
                String(
                  ro.roNumber || "",
                );

              const tagNumber =
                String(
                  ro.tagNumber || "",
                );

              transaction.set(
                notificationRef,
                {
                  id: notificationId,
                  dealerId,

                  module: "ro-tracker",
                  eventType:
                    "waiter_alert",

                  title:
                    "Waiter Follow-Up Due",

                  message:
                    buildWaiterReminderMessage(
                      roNumber,
                      tagNumber,
                    ),

                  status: "active",

                  targetType: "user",
                  targetUserId:
                    advisorId,

                  targetUserName:
                    ro.advisorName || "",

                  route:
                    "/pages/ro-tracker/index.html",

                  routeParams: {
                    roId:
                      currentSnapshot.id,

                    roNumber,
                    tagNumber,
                  },

                  relatedRoId:
                    currentSnapshot.id,

                  relatedRoNumber:
                    roNumber,

                  relatedTagNumber:
                    tagNumber,

                  openedBy: "",
                  openedByName: "",
                  openedAtMs: null,

                  createdAt:
                    admin.firestore
                      .FieldValue
                      .serverTimestamp(),

                  createdAtMs: now,

                  updatedAt:
                    admin.firestore
                      .FieldValue
                      .serverTimestamp(),

                  updatedAtMs: now,
                },
              );
            }

            let nextReminderAtMs =
              scheduledReminderAtMs +
              30 * 60 * 1000;

            // Skip missed intervals instead of creating
            // several old reminders.
            while (
              nextReminderAtMs <= now
            ) {
              nextReminderAtMs +=
                30 * 60 * 1000;
            }

            transaction.update(
              waiterDoc.ref,
              {
                waiterLastSentAtMs:
                  now,

                waiterReminderCount:
                  Number(
                    ro.waiterReminderCount ||
                      0,
                  ) + 1,

                waiterNextReminderAtMs:
                  nextReminderAtMs,

                updatedAt:
                  admin.firestore
                    .FieldValue
                    .serverTimestamp(),
              },
            );

            return (
              !notificationSnapshot.exists
            );
          },
        );

      if (created) {
        waiterNotificationsCreated += 1;
      }
    }

    console.log(
      `Created ${waiterNotificationsCreated} waiter notifications.`,
    );
  },
);

function buildWaiterReminderMessage(
  roNumber = "",
  tagNumber = "",
) {
  const identifiers = [];

  if (roNumber) {
    identifiers.push(
      `RO ${roNumber}`,
    );
  }

  if (tagNumber) {
    identifiers.push(
      `Tag ${tagNumber}`,
    );
  }

  if (!identifiers.length) {
    return "A customer is still marked as waiting.";
  }

  return `${identifiers.join(" · ")} is still marked as a waiter.`;
}

module.exports = {
  releaseStaleNotifications,
};