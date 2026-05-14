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
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

import { getSession } from "../../core/session.js";

import { ROS_FIELDS } from "../../config/ros-fields.js";

import { ROS_STATUS } from "../../config/ros-statuses.js";

const ROS_COLLECTION = "ros";

export async function createRO(data = {}) {

  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session");
  }

  const roRef = doc(collection(db, ROS_COLLECTION));

  const roData = {
    [ROS_FIELDS.id]: roRef.id,

    [ROS_FIELDS.roNumber]:
      data[ROS_FIELDS.roNumber] || "",

    [ROS_FIELDS.tagNumber]:
      data[ROS_FIELDS.tagNumber] || "",

    [ROS_FIELDS.vin]:
      data[ROS_FIELDS.vin] || "",

    [ROS_FIELDS.vinLast8]:
      buildVinLast8(
        data[ROS_FIELDS.vin]
      ),

    [ROS_FIELDS.year]:
      data[ROS_FIELDS.year] || "",

    [ROS_FIELDS.make]:
      data[ROS_FIELDS.make] || "",

    [ROS_FIELDS.model]:
      data[ROS_FIELDS.model] || "",

    [ROS_FIELDS.color]:
      data[ROS_FIELDS.color] || "",

    [ROS_FIELDS.customerName]:
      data[ROS_FIELDS.customerName] || "",

    [ROS_FIELDS.customerPhone]:
      data[ROS_FIELDS.customerPhone] || "",

    [ROS_FIELDS.customerEmail]:
      data[ROS_FIELDS.customerEmail] || "",

    [ROS_FIELDS.advisorId]:
      session.uid,

    [ROS_FIELDS.advisorName]:
      session.displayName || "",

    [ROS_FIELDS.status]:
      ROS_STATUS.NEW,

    [ROS_FIELDS.dealerId]:
      session.dealerId,

    [ROS_FIELDS.scanSource]:
      data[ROS_FIELDS.scanSource] || "manual",

    [ROS_FIELDS.rawOcrText]:
      data[ROS_FIELDS.rawOcrText] || "",

    [ROS_FIELDS.createdBy]:
      session.uid,

    [ROS_FIELDS.updatedBy]:
      session.uid,

    [ROS_FIELDS.createdAt]:
      serverTimestamp(),

    [ROS_FIELDS.updatedAt]:
      serverTimestamp()
  };

  await setDoc(roRef, roData);

  return roData;
}

export async function updateRO(roId, updates = {}) {

  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session");
  }

  const roRef = doc(db, ROS_COLLECTION, roId);

  await updateDoc(roRef, {
    ...updates,

    [ROS_FIELDS.updatedBy]:
      session.uid,

    [ROS_FIELDS.updatedAt]:
      serverTimestamp()
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

    where(
      ROS_FIELDS.dealerId,
      "==",
      session.dealerId
    ),

    orderBy(
      ROS_FIELDS.createdAt,
      "desc"
    ),

    limit(100)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) =>
    doc.data()
  );
}

function buildVinLast8(vin = "") {
  return String(vin)
    .trim()
    .slice(-8)
    .toUpperCase();
}