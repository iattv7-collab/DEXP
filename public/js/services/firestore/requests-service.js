// public/js/services/firestore/requests-service.js

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

import {
  createNotificationRequest,
  NOTIFICATION_TARGET_TYPE,
} from "/js/services/firestore/notification-requests-service.js";

const REQUESTS_COLLECTION = "requests";

export const REQUEST_STATUS = {
  ACTIVE: "active",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export async function createRequest({
  roId = "",
  roNumber = "",
  tagNumber = "",
  vinLast8 = "",

  requestType,
  sourceModule,

  targetGroupId,
  targetGroupName = "",

  title = "",
  message = "",

  route = "",
  routeParams = {},
}) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  if (!requestType) {
    throw new Error("Missing request type.");
  }

  if (!targetGroupId) {
    throw new Error("Missing target group.");
  }

  const requestRef = await addDoc(collection(db, REQUESTS_COLLECTION), {
    dealerId: session.dealerId,

    roId,
    roNumber,
    tagNumber,
    vinLast8,

    requestType,
    sourceModule: sourceModule || "",

    requestedByUid: session.uid || "",
    requestedByName: session.displayName || session.email || "",
    requestedByRole: session.role || "",

    targetGroupId,
    targetGroupName,

    status: REQUEST_STATUS.ACTIVE,

    title,
    message,

    route,
    routeParams,

    notificationRequestId: "",

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),

    completedAt: null,
    completedAtMs: null,
  });

  const notification = await createNotificationRequest({
    module: "requests",
    eventType: requestType,

    targetType: NOTIFICATION_TARGET_TYPE.GROUP,
    targetGroupId,

    title: title || "New Request",
    message,

    route,
    routeParams: {
      ...routeParams,
      requestId: requestRef.id,
    },

    sourceType: "request",
    sourceId: requestRef.id,

    relatedRoId: roId,
    relatedRoNumber: roNumber,
    relatedTagNumber: tagNumber,

    data: {
      requestId: requestRef.id,
      requestType,
      sourceModule: sourceModule || "",
      targetGroupName,
    },
  });

  await linkNotificationToRequest({
    requestId: requestRef.id,
    notificationRequestId: notification.id,
  });

  return {
    requestId: requestRef.id,
    notificationRequestId: notification.id,
  };
}

export async function linkNotificationToRequest({
  requestId,
  notificationRequestId,
}) {
  if (!requestId || !notificationRequestId) {
    throw new Error("Missing request or notification id.");
  }

  const requestRef = doc(db, REQUESTS_COLLECTION, requestId);

  await setDoc(
    requestRef,
    {
      notificationRequestId,
      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
    },
    { merge: true },
  );
}

export function watchActiveRequests(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("status", "in", [
      REQUEST_STATUS.ACTIVE,
      REQUEST_STATUS.IN_PROGRESS,
    ]),
    orderBy("createdAtMs", "desc"),
  );

  return onSnapshot(requestsQuery, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    callback(rows);
  });
}

export function watchCompletedRequests(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("status", "==", REQUEST_STATUS.COMPLETED),
    orderBy("completedAtMs", "desc"),
  );

  return onSnapshot(requestsQuery, (snapshot) => {
    const rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    callback(rows);
  });
}