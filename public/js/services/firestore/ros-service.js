// public/js/services/firestore/ros-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "../../core/session.js";
import { ROS_FIELDS } from "../../config/ros-fields.js";
import { ROS_STATUS } from "../../config/ros-statuses.js";

const ROS_COLLECTION = "ros";
const ACTIVITY_LOG_COLLECTION = "activityLog";

export async function createRO(data = {}, options = {}) {
  const session = requireDealerSession();

  const roNumber = String(data[ROS_FIELDS.roNumber] || "").trim();
  const tagNumber = String(data[ROS_FIELDS.tagNumber] || "").trim();

  if (roNumber) {
    const existingRO = await findActiveROByNumber(roNumber);

    if (existingRO) {
      throw new Error("RO number already exists.");
    }
  }

  if (tagNumber) {
    const existingTag = await findActiveROByTag(tagNumber);

    if (existingTag) {
      throw new Error("Tag number already exists in active RO list.");
    }
  }

  const normalizedRONumber = roNumber
    .replace(/\s+/g, "")
    .toUpperCase();

  const normalizedTagNumber = tagNumber
    .replace(/\s+/g, "")
    .toUpperCase();

  const roDocId =
    normalizedRONumber ||
    `TAG-${normalizedTagNumber}` ||
    crypto.randomUUID();

  const roRef = doc(db, ROS_COLLECTION, roDocId);

  const roData = {
    [ROS_FIELDS.id]: roRef.id,
    [ROS_FIELDS.roNumber]: roNumber,
    [ROS_FIELDS.tagNumber]: tagNumber,
    [ROS_FIELDS.vin]: data[ROS_FIELDS.vin] || "",
    [ROS_FIELDS.vinLast8]: buildVinLast8(data[ROS_FIELDS.vin]),
    [ROS_FIELDS.year]: data[ROS_FIELDS.year] || "",
    [ROS_FIELDS.make]: data[ROS_FIELDS.make] || "",
    [ROS_FIELDS.model]: data[ROS_FIELDS.model] || "",
    [ROS_FIELDS.color]: data[ROS_FIELDS.color] || "",
    [ROS_FIELDS.customerName]: data[ROS_FIELDS.customerName] || "",
    [ROS_FIELDS.customerPhone]: data[ROS_FIELDS.customerPhone] || "",
    [ROS_FIELDS.customerEmail]: data[ROS_FIELDS.customerEmail] || "",
    [ROS_FIELDS.advisorId]: session.uid,
    [ROS_FIELDS.advisorName]: session.displayName || "",
    [ROS_FIELDS.status]: ROS_STATUS.NEW,
    [ROS_FIELDS.dealerId]: session.dealerId,
    [ROS_FIELDS.scanSource]: data[ROS_FIELDS.scanSource] || "manual",
    [ROS_FIELDS.rawOcrText]: data[ROS_FIELDS.rawOcrText] || "",
    [ROS_FIELDS.createdBy]: session.uid,
    [ROS_FIELDS.updatedBy]: session.uid,
    [ROS_FIELDS.createdAt]: serverTimestamp(),
    [ROS_FIELDS.updatedAt]: serverTimestamp()
  };

  await setDoc(roRef, roData);

  await addROActivity(roRef.id, {
    eventType: options.eventType || "ro_created",
    module: options.module || "master-ro",
    message: options.message || "RO created",
    after: roData
  });

  return roData;
}

export async function updateRO(roId, updates = {}, options = {}) {
  const session = requireDealerSession();

  const before = await getRO(roId);

  const roRef = doc(db, ROS_COLLECTION, roId);

  const updateData = {
    ...updates,
    [ROS_FIELDS.updatedBy]: session.uid,
    [ROS_FIELDS.updatedAt]: serverTimestamp()
  };

  await updateDoc(roRef, updateData);

  await addROActivity(roId, {
    eventType: options.eventType || "ro_updated",
    module: options.module || "master-ro",
    message: options.message || "RO updated",
    before,
    after: {
      ...before,
      ...updates
    }
  });
}

export async function getRO(roId) {
  const roRef = doc(db, ROS_COLLECTION, roId);
  const snapshot = await getDoc(roRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}

export async function getDealerROs() {
  const session = getSession();

  if (!session?.dealerId) {
    return [];
  }

  const rosRef = collection(db, ROS_COLLECTION);

  const q = query(
    rosRef,
    where(ROS_FIELDS.dealerId, "==", session.dealerId),
    limit(100)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => doc.data());
}

export function watchDealerROs(callback) {
  const session = getSession();

  if (!session?.dealerId) {
    callback([]);
    return () => { };
  }

  const rosRef = collection(db, ROS_COLLECTION);

  const q = query(
    rosRef,
    where(ROS_FIELDS.dealerId, "==", session.dealerId),
    limit(100)
  );

  return onSnapshot(q, (snapshot) => {
    const ros = snapshot.docs.map((doc) => doc.data());

    callback(ros);
  });
}

export async function findActiveROByNumber(roNumber = "") {
  const session = getSession();

  if (!session?.dealerId || !roNumber) {
    return null;
  }

  const rosRef = collection(db, ROS_COLLECTION);

  const q = query(
    rosRef,
    where(ROS_FIELDS.dealerId, "==", session.dealerId),
    where(ROS_FIELDS.roNumber, "==", String(roNumber).trim()),
    limit(1)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

export async function findActiveROByTag(tagNumber = "") {
  const session = getSession();

  if (!session?.dealerId || !tagNumber) {
    return null;
  }

  const rosRef = collection(db, ROS_COLLECTION);

  const q = query(
    rosRef,
    where(ROS_FIELDS.dealerId, "==", session.dealerId),
    where(ROS_FIELDS.tagNumber, "==", String(tagNumber).trim()),
    limit(1)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data();
}

export async function addROActivity(roId, activity = {}) {
  const session = requireDealerSession();

  const activityRef = doc(
    collection(db, ROS_COLLECTION, roId, ACTIVITY_LOG_COLLECTION)
  );

  const activityData = {
    id: activityRef.id,
    roId,
    dealerId: session.dealerId,
    eventType: activity.eventType || "activity",
    module: activity.module || "master-ro",
    message: activity.message || "",
    changedBy: session.uid,
    changedByName: session.displayName || session.email || "",
    before: activity.before || null,
    after: activity.after || null,
    createdAt: serverTimestamp()
  };

  await setDoc(activityRef, activityData);

  return activityData;
}

function requireDealerSession() {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session");
  }

  return session;
}

function buildVinLast8(vin = "") {
  return String(vin).trim().slice(-8).toUpperCase();
}