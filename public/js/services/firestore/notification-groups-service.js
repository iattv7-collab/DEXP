// public/js/services/firestore/notification-groups-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "../../core/session.js";

const NOTIFICATION_GROUPS_COLLECTION =
  "notificationGroups";

export async function getNotificationGroups() {
  const session = getSession();

  if (!session?.dealerId) {
    return [];
  }

  const q = query(
    collection(db, NOTIFICATION_GROUPS_COLLECTION),
    where("dealerId", "==", session.dealerId),
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getNotificationGroup(groupId) {
  if (!groupId) {
    throw new Error("Missing group ID.");
  }

  const groupRef = doc(
    db,
    NOTIFICATION_GROUPS_COLLECTION,
    groupId,
  );

  const snapshot = await getDoc(groupRef);

  if (!snapshot.exists()) {
    throw new Error("Notification group not found.");
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function createNotificationGroup(data = {}) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const groupRef = doc(
    collection(db, NOTIFICATION_GROUPS_COLLECTION),
  );

  const groupData = {
    id: groupRef.id,
    dealerId: session.dealerId,
    name: String(data.name || "").trim(),
    groupType: String(data.groupType || "custom").trim(),
    active: true,
    memberUids: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: session.uid || "",
    updatedBy: session.uid || "",
  };

  if (!groupData.name) {
    throw new Error("Group name is required.");
  }

  await setDoc(groupRef, groupData);

  return groupData;
}

export async function updateNotificationGroupMembers(
  groupId,
  memberUids = [],
) {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  const groupRef = doc(
    db,
    NOTIFICATION_GROUPS_COLLECTION,
    groupId,
  );

  await updateDoc(groupRef, {
    memberUids,
    updatedAt: serverTimestamp(),
    updatedBy: session.uid || "",
  });
}