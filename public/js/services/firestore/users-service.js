// public/js/services/firestore/users-service.js

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
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

  // Existing user
  if (snapshot.exists()) {

    const existingProfile = snapshot.data();

    // Temporary setup auto-admin
    if (
      SETUP_ADMIN_EMAILS.includes(user.email) &&
      existingProfile.role !== ROLES.ADMIN
    ) {

      await updateDoc(userRef, {
        role: ROLES.ADMIN
      });

      existingProfile.role = ROLES.ADMIN;
    }

    return existingProfile;
  }

  // First-time profile creation
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

    active: true,

    createdAt: serverTimestamp()
  };

  await setDoc(userRef, newProfile);

  return newProfile;
}