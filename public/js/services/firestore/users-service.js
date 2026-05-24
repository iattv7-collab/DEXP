// public/js/services/firestore/users-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

import {
  DEFAULT_ROLE,
  ROLES,
  SETUP_ADMIN_EMAILS
} from "../../config/roles.js";

export async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);

  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const existingProfile = snapshot.data();

    return existingProfile;
  }

  const isSetupAdmin =
    SETUP_ADMIN_EMAILS.includes(user.email);

  const newProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",

    role: isSetupAdmin
      ? ROLES.ADMIN
      : DEFAULT_ROLE,

    dealerId: "default-dealer",

    active: isSetupAdmin,

    createdAt: serverTimestamp(),
    approvalRequestedAt: serverTimestamp(),

    approvedAt: isSetupAdmin
      ? serverTimestamp()
      : null,

    approvedBy: isSetupAdmin
      ? "setup"
      : "",

    inactiveAt: null,
    inactiveBy: ""
  };

  await setDoc(userRef, newProfile);

  return newProfile;
}

export async function getAllUsers() {
  const snapshot = await getDocs(
    collection(db, "users")
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

export async function getPendingUsers() {
  const pendingQuery = query(
    collection(db, "users"),
    where("role", "==", ROLES.PENDING)
  );

  const snapshot = await getDocs(pendingQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}

export async function getAdminUserGroups() {
  const users = await getAllUsers();

  return {
    pendingUsers: users.filter((user) =>
      user.role === ROLES.PENDING
    ),

    activeUsers: users.filter((user) =>
      user.role !== ROLES.PENDING &&
      user.active !== false
    ),

    inactiveUsers: users.filter((user) =>
      user.role !== ROLES.PENDING &&
      user.active === false
    )
  };
}