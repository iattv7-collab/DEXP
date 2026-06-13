// public/js/services/firestore/notification-requests-service.js
// Central Firestore service for DEXP notification requests.

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "../../core/session.js";

const NOTIFICATION_REQUESTS_COLLECTION = "notificationRequests";

export const NOTIFICATION_STATUS = {
  ACTIVE: "active",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  EXPIRED: "expired",
};

export const NOTIFICATION_TARGET_TYPE = {
  USER: "user",
  GROUP: "group",
};

export async function createNotificationRequest(data = {}) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const targetType = String(data.targetType || "").trim();

  if (
    targetType !== NOTIFICATION_TARGET_TYPE.USER &&
    targetType !== NOTIFICATION_TARGET_TYPE.GROUP
  ) {
    throw new Error("Invalid notification target type.");
  }

  if (targetType === NOTIFICATION_TARGET_TYPE.USER && !data.targetUserId) {
    throw new Error("Missing target user.");
  }

  if (targetType === NOTIFICATION_TARGET_TYPE.GROUP && !data.targetGroupId) {
    throw new Error("Missing target group.");
  }

  const notificationRef = doc(collection(db, NOTIFICATION_REQUESTS_COLLECTION));

  const notificationData = {
    id: notificationRef.id,

    dealerId: session.dealerId,

    module: String(data.module || "").trim(),
    eventType: String(data.eventType || "").trim(),

    targetType,
    targetUserId: data.targetUserId || "",
    targetGroupId: data.targetGroupId || "",

    title: String(data.title || "").trim(),
    message: String(data.message || "").trim(),

    route: String(data.route || "").trim(),

    routeParams: {
      ...(typeof data.routeParams === "object" && data.routeParams
        ? data.routeParams
        : {}),
      notificationId: notificationRef.id,
    },

    status: NOTIFICATION_STATUS.ACTIVE,

    sourceType: String(data.sourceType || "").trim(),
    sourceId: String(data.sourceId || "").trim(),

    relatedRoId: data.relatedRoId || "",
    relatedRoNumber: data.relatedRoNumber || "",
    relatedTagNumber: data.relatedTagNumber || "",

    data: data.data || {},

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    createdBy: session.uid || "",
    createdByName: session.displayName || session.email || "",

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid || "",

    resolvedAt: null,
    resolvedAtMs: null,
    resolvedBy: "",

    expiresAtMs: data.expiresAtMs || null,

    openedBy: "",
    openedByName: "",
    openedAtMs: null,

    dismissedBy: {},
  };

  if (!notificationData.module) {
    throw new Error("Notification module is required.");
  }

  if (!notificationData.eventType) {
    throw new Error("Notification event type is required.");
  }

  if (!notificationData.title) {
    throw new Error("Notification title is required.");
  }

  if (!notificationData.message) {
    throw new Error("Notification message is required.");
  }

  await setDoc(notificationRef, notificationData);

  return notificationData;
}

export function listenToActiveNotificationRequests(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const notificationQuery = query(
    collection(db, NOTIFICATION_REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("status", "==", NOTIFICATION_STATUS.ACTIVE),
    orderBy("createdAtMs", "desc"),
  );

  return onSnapshot(notificationQuery, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    callback(rows);
  });
}

export function watchDealerNotifications(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const notificationQuery = query(
    collection(db, NOTIFICATION_REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    orderBy("createdAtMs", "desc"),
  );

  return onSnapshot(notificationQuery, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    callback(rows);
  });
}

export async function resolveNotificationRequest(notificationId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await updateDoc(notificationRef, {
    status: NOTIFICATION_STATUS.RESOLVED,
    resolvedAt: serverTimestamp(),
    resolvedAtMs: Date.now(),
    resolvedBy: session.uid,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}

export async function openNotificationRequest(notificationId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(notificationRef);

    if (!snapshot.exists()) {
      throw new Error("Notification not found.");
    }

    const notification = snapshot.data();

    if (notification.openedBy && notification.openedBy !== session.uid) {
      throw new Error("Notification already opened.");
    }

    transaction.update(notificationRef, {
      openedBy: session.uid,
      openedByName: session.displayName || session.email || session.uid,

      openedAtMs: Date.now(),

      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedBy: session.uid,
    });
  });
}

export async function markNotificationInProgress(notificationId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await updateDoc(notificationRef, {
    status: NOTIFICATION_STATUS.IN_PROGRESS,

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}

export async function releaseNotificationRequest(notificationId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await updateDoc(notificationRef, {
    status: NOTIFICATION_STATUS.ACTIVE,

    openedBy: "",
    openedByName: "",
    openedAtMs: null,

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}

export async function releaseStaleOpenedNotificationRequest(
  notificationId,
  maxOpenedMs = 5 * 60 * 1000,
) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(notificationRef);

    if (!snapshot.exists()) {
      return;
    }

    const notification = snapshot.data();

    if (notification.status !== NOTIFICATION_STATUS.ACTIVE) {
      return;
    }

    if (!notification.openedBy || !notification.openedAtMs) {
      return;
    }

    const openedTooLong =
      Date.now() - Number(notification.openedAtMs) > maxOpenedMs;

    if (!openedTooLong) {
      return;
    }

    transaction.update(notificationRef, {
      openedBy: "",
      openedByName: "",
      openedAtMs: null,

      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedBy: session.uid,
    });
  });
}

export async function dismissNotificationRequest(notificationId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationId) {
    throw new Error("Missing notification ID.");
  }

  const notificationRef = doc(
    db,
    NOTIFICATION_REQUESTS_COLLECTION,
    notificationId,
  );

  await updateDoc(notificationRef, {
    [`dismissedBy.${session.uid}`]: Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid,
  });
}
