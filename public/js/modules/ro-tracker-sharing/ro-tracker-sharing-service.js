// public/js/modules/ro-tracker-sharing/ro-tracker-sharing-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

export async function getDealerAdvisors() {
  const session = getSession();

  if (!session?.dealerId) return [];

  const usersQuery = query(
    collection(db, "users"),
    where("dealerId", "==", session.dealerId),
    where("role", "==", "advisor")
  );

  const snapshot = await getDocs(usersQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

export async function getMyROTrackerSharing() {
  const session = getSession();

  if (!session?.uid) return null;

  const shareRef = doc(db, "roTrackerShares", session.uid);
  const snapshot = await getDoc(shareRef);

  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveROTrackerSharing({
  sharedWithCompanyIds = []
}) {
  const session = getSession();

  if (!session?.uid) {
    throw new Error("Missing session");
  }

  const shareRef = doc(db, "roTrackerShares", session.uid);

  await setDoc(
    shareRef,
    {
      dealerId: session.dealerId,
      ownerAdvisorId: session.uid,
      ownerCompanyId: session.companyId || "",
      ownerAdvisorName: session.displayName || "",
      sharedWithCompanyIds,
      active: sharedWithCompanyIds.length > 0,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function watchMyROTrackerSharing(callback) {
  const session = getSession();

  if (!session?.uid) {
    callback(null);
    return () => {};
  }

  const shareRef = doc(db, "roTrackerShares", session.uid);

  return onSnapshot(shareRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() : null);
  });
}

export function watchSharedROTrackers(callback) {
  const session = getSession();

  if (!session?.dealerId || !session?.companyId) {
    callback([]);
    return () => {};
  }

  const sharesQuery = query(
    collection(db, "roTrackerShares"),
    where("dealerId", "==", session.dealerId)
  );

  return onSnapshot(sharesQuery, (snapshot) => {
    const shares = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      .filter((share) => {
        return (
          share.active !== false &&
          Array.isArray(share.sharedWithCompanyIds) &&
          share.sharedWithCompanyIds.includes(session.companyId)
        );
      });

    callback(shares);
  });
}