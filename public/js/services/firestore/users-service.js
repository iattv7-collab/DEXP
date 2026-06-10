// public/js/services/firestore/users-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "../../core/session.js";

import { DEFAULT_ROLE, ROLES, SETUP_ADMIN_EMAILS } from "../../config/roles.js";

import { MODULES } from "../../config/modules.js";

export async function ensureUserProfile(user, options = {}) {
  const userRef = doc(db, "users", user.uid);

  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  const email = (user.email || "").trim().toLowerCase();

  const pendingRegistration = options.pendingRegistration || {};

  const isSetupAdmin = SETUP_ADMIN_EMAILS.includes(email);

  if (isSetupAdmin) {
    const newProfile = {
      uid: user.uid,

      email,

      displayName: pendingRegistration.displayName || user.displayName || "",

      phone: pendingRegistration.phone || "",

      companyId: pendingRegistration.companyId || "",

      role: ROLES.PLATFORM_ADMIN,

      dealerId: "platform",

      active: true,

      assignedModules: [
        MODULES.PLATFORM_ADMIN,
        MODULES.ADMIN,
        MODULES.COMPANY_PROFILE,
        MODULES.NOTIFICATIONS,
      ],

      createdAt: serverTimestamp(),

      approvalRequestedAt: serverTimestamp(),

      approvedAt: serverTimestamp(),

      approvedBy: "setup",

      inactiveAt: null,
      inactiveBy: "",
    };

    await setDoc(userRef, newProfile);

    return newProfile;
  }

  const invite = await getDealerAdminInvite(email);

  if (invite) {
    const newProfile = {
      uid: user.uid,

      email,

      displayName:
        pendingRegistration.displayName ||
        user.displayName ||
        invite.displayName ||
        "",

      phone: pendingRegistration.phone || invite.phone || "",

      companyId: pendingRegistration.companyId || "",

      role: ROLES.ADMIN,

      dealerId: invite.dealerId,

      active: true,

      assignedModules: [
        MODULES.ADMIN,
        MODULES.COMPANY_PROFILE,
        MODULES.RO_TRACKER,
        MODULES.NOTIFICATIONS,
      ],

      createdAt: serverTimestamp(),

      approvalRequestedAt: serverTimestamp(),

      approvedAt: serverTimestamp(),

      approvedBy: "dealer-admin-invite",

      inactiveAt: null,
      inactiveBy: "",
    };

    await setDoc(userRef, newProfile);

    await setDoc(
      doc(db, "dealerAdminInvites", email),
      {
        status: "accepted",

        acceptedAt: serverTimestamp(),

        acceptedBy: user.uid,

        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return newProfile;
  }

  const requestedDealerId = cleanDealerId(options.requestedDealerId);

  const dealerExists = await doesDealerExist(requestedDealerId);

  const newProfile = {
    uid: user.uid,

    email,

    displayName: pendingRegistration.displayName || user.displayName || "",

    phone: pendingRegistration.phone || "",

    companyId: pendingRegistration.companyId || "",

    role: DEFAULT_ROLE,

    dealerId: dealerExists ? requestedDealerId : "",

    active: false,

    assignedModules: [],

    createdAt: serverTimestamp(),

    approvalRequestedAt: serverTimestamp(),

    approvedAt: null,
    approvedBy: "",

    inactiveAt: null,
    inactiveBy: "",
  };

  await setDoc(userRef, newProfile);

  return newProfile;
}

export async function getPendingUsers() {
  const session = getSession();

  if (!session) {
    return [];
  }

  if (session.role === ROLES.PLATFORM_ADMIN) {
    const pendingQuery = query(
      collection(db, "users"),

      where("role", "==", ROLES.PENDING),
    );

    const snapshot = await getDocs(pendingQuery);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  }

  if (!session.dealerId) {
    return [];
  }

  const pendingQuery = query(
    collection(db, "users"),

    where("dealerId", "==", session.dealerId),

    where("role", "==", ROLES.PENDING),
  );

  const snapshot = await getDocs(pendingQuery);

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function getAllUsers() {
  const session = getSession();

  if (!session?.dealerId) {
    return [];
  }

  const usersQuery = query(
    collection(db, "users"),

    where("dealerId", "==", session.dealerId),
  );

  const snapshot = await getDocs(usersQuery);

  return snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }))
    .filter((user) => user.role !== ROLES.PLATFORM_ADMIN);
}

export async function getAdminUserGroups() {
  const users = await getAllUsers();

  return {
    pendingUsers: users.filter((user) => user.role === ROLES.PENDING),

    activeUsers: users.filter(
      (user) => user.role !== ROLES.PENDING && user.active !== false,
    ),

    inactiveUsers: users.filter(
      (user) => user.role !== ROLES.PENDING && user.active === false,
    ),
  };
}

async function doesDealerExist(dealerId) {
  if (!dealerId) {
    return false;
  }

  const dealerRef = doc(db, "dealers", dealerId);

  const snapshot = await getDoc(dealerRef);

  return snapshot.exists();
}

function cleanDealerId(value = "") {
  return String(value || "").trim();
}

async function getDealerAdminInvite(email) {
  if (!email) {
    return null;
  }

  const inviteRef = doc(db, "dealerAdminInvites", email);

  const snapshot = await getDoc(inviteRef);

  if (!snapshot.exists()) {
    return null;
  }

  const invite = snapshot.data();

  if (invite.status === "accepted") {
    return null;
  }

  return invite;
}
