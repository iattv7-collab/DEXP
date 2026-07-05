// public/js/services/firestore/requests-service.js
// Central Firestore service for DEXP requests.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { updateRO } from "/js/services/firestore/ros-service.js";

import {
  createNotificationRequest,
  NOTIFICATION_STATUS,
  NOTIFICATION_TARGET_TYPE,
} from "/js/services/firestore/notification-requests-service.js";

const REQUESTS_COLLECTION = "requests";
const NOTIFICATION_REQUESTS_COLLECTION = "notificationRequests";

export const REQUEST_STATUS = {
  ACTIVE: "active",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const OPEN_REQUEST_STATUSES = [
  REQUEST_STATUS.ACTIVE,
  REQUEST_STATUS.IN_PROGRESS,
];

async function assertNoOpenRequestForRO({
  dealerId,
  roId = "",
  roNumber = "",
  tagNumber = "",
}) {
  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("dealerId", "==", dealerId),
    where("status", "in", OPEN_REQUEST_STATUSES),
    limit(50),
  );

  const snapshot = await getDocs(requestsQuery);

  const existingRequest = snapshot.docs
    .map((docSnap) => docSnap.data())
    .find((request) => {
      return (
        (roId && request.roId === roId) ||
        (roNumber && request.roNumber === roNumber) ||
        (tagNumber && request.tagNumber === tagNumber)
      );
    });

  if (existingRequest) {
    throw new Error(
      `This RO already has an active request: ${
        existingRequest.title || existingRequest.requestType || "Request"
      }.`,
    );
  }
}

async function updateROActiveRequestFieldsForRequest(roId, updates = {}) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  if (!roId) {
    return;
  }

  const roRef = doc(db, "ros", roId);
  const roSnap = await getDoc(roRef);

  if (!roSnap.exists()) {
    throw new Error("RO not found.");
  }

  const ro = roSnap.data();

  if (ro.dealerId !== session.dealerId) {
    throw new Error("RO not found or dealer mismatch.");
  }

  await updateDoc(roRef, {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedBy: session.uid || "",
  });
}

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

  await assertNoOpenRequestForRO({
    dealerId: session.dealerId,
    roId,
    roNumber,
    tagNumber,
  });

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

    cancelledAt: null,
    cancelledAtMs: null,
    cancelledBy: "",
    cancelledByName: "",
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

  await updateROActiveRequestFieldsForRequest(roId, {
    activeRequestId: requestRef.id,
    activeRequestNotificationId: notification.id,
    activeRequestType: requestType,
    activeRequestTitle: title || "New Request",
    activeRequestStatus: REQUEST_STATUS.ACTIVE,
    activeRequestTargetGroupId: targetGroupId,
    activeRequestTargetGroupName: targetGroupName,
    activeRequestRequestedByUid: session.uid || "",
    activeRequestRequestedByName: session.displayName || session.email || "",
    activeRequestRequestedByCompanyId: session.companyId || "",
    activeRequestCreatedAtMs: Date.now(),
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

export async function markRequestInProgress(requestId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!requestId) {
    throw new Error("Missing request ID.");
  }

  const requestRef = doc(db, REQUESTS_COLLECTION, requestId);

  await updateDoc(requestRef, {
    status: REQUEST_STATUS.IN_PROGRESS,

    startedAt: serverTimestamp(),
    startedAtMs: Date.now(),
    startedBy: session.uid,
    startedByName: session.displayName || session.email || "",

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });

  const requestSnap = await getDoc(requestRef);
  const request = requestSnap.exists() ? requestSnap.data() : null;

  if (request?.roId) {
    await updateRO(
      request.roId,
      {
        activeRequestStatus: REQUEST_STATUS.IN_PROGRESS,
        activeRequestStartedAtMs: Date.now(),
        activeRequestStartedByUid: session.uid,
        activeRequestStartedByName: session.displayName || session.email || "",
      },
      {
        module: "requests",
        eventType: "request_started",
        message: request.title || "Request started",
      },
    );
  }
}

export async function releaseRequestInProgress(requestId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!requestId) {
    throw new Error("Missing request ID.");
  }

  const requestRef = doc(db, REQUESTS_COLLECTION, requestId);

  await updateDoc(requestRef, {
    status: REQUEST_STATUS.ACTIVE,

    startedAt: null,
    startedAtMs: null,
    startedBy: "",
    startedByName: "",

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });
}

export async function releaseRequestInProgressByNotificationId(
  notificationRequestId,
) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!notificationRequestId) {
    throw new Error("Missing notification request ID.");
  }

  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("notificationRequestId", "==", notificationRequestId),
    limit(1),
  );

  const snapshot = await getDocs(requestsQuery);

  if (snapshot.empty) {
    return;
  }

  const requestDoc = snapshot.docs[0];

  await releaseRequestInProgress(requestDoc.id);
}

function buildClearedActiveRequestFields() {
  return {
    activeRequestId: "",
    activeRequestNotificationId: "",
    activeRequestType: "",
    activeRequestTitle: "",
    activeRequestStatus: "",
    activeRequestTargetGroupId: "",
    activeRequestTargetGroupName: "",
    activeRequestRequestedByUid: "",
    activeRequestRequestedByName: "",
    activeRequestRequestedByCompanyId: "",
    activeRequestCreatedAtMs: null,
    activeRequestStartedAtMs: null,
    activeRequestStartedByUid: "",
    activeRequestStartedByName: "",
  };
}

export async function completeRequest(requestId) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!requestId) {
    throw new Error("Missing request ID.");
  }

  const requestRef = doc(db, REQUESTS_COLLECTION, requestId);

  await updateDoc(requestRef, {
    status: REQUEST_STATUS.COMPLETED,

    completedAt: serverTimestamp(),
    completedAtMs: Date.now(),
    completedBy: session.uid,
    completedByName: session.displayName || session.email || "",

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });

  const requestSnap = await getDoc(requestRef);
  const request = requestSnap.exists() ? requestSnap.data() : null;

  if (request?.roId) {
    await updateRO(request.roId, buildClearedActiveRequestFields(), {
      module: "requests",
      eventType: "request_completed",
      message: request.title || "Request completed",
    });
  }
}

export async function cancelRequest(request = {}) {
  console.log("Cancelling request:", request);

  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing user session.");
  }

  if (!request?.id) {
    throw new Error("Missing request ID.");
  }

  const requestRef = doc(db, REQUESTS_COLLECTION, request.id);

  await updateDoc(requestRef, {
    status: REQUEST_STATUS.CANCELLED,

    cancelledAt: serverTimestamp(),
    cancelledAtMs: Date.now(),
    cancelledBy: session.uid,
    cancelledByName: session.displayName || session.email || "",

    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });

  if (request.roId) {
    await updateRO(request.roId, buildClearedActiveRequestFields(), {
      module: "requests",
      eventType: "request_cancelled",
      message: request.title || "Request cancelled",
    });
  }

  if (request.notificationRequestId) {
    const notificationRef = doc(
      db,
      NOTIFICATION_REQUESTS_COLLECTION,
      request.notificationRequestId,
    );

    await updateDoc(notificationRef, {
      status: NOTIFICATION_STATUS.EXPIRED,

      resolvedAt: serverTimestamp(),
      resolvedAtMs: Date.now(),
      resolvedBy: session.uid,

      updatedAt: serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedBy: session.uid,
    });
  }
}

export function watchDealerRequests(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
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

export function watchActiveRequests(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const requestsQuery = query(
    collection(db, REQUESTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("status", "in", [REQUEST_STATUS.ACTIVE, REQUEST_STATUS.IN_PROGRESS]),
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
