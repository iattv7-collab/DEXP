// ======================================================
// FILE: /public/js/modules/shared/booking-actions-service.js
// PURPOSE:
// Shared booking actions for Advisor, Booker,
// Manager, and future reports.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

import {
  doc,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function auditPatch(fields = []) {
  const user = auth.currentUser;
  const session = getSession();

  return {
    updatedAt: serverTimestamp(),
    updatedByUid: user?.uid || "",
    updatedByName: user?.displayName || "",
    updatedByEmail: user?.email || "",
    lastEditedAtMs: Date.now(),
    lastEditedBy: user?.uid || "",
    lastEditedRole: session?.role || "unknown",
    lastEditedFields: fields
  };
}

export async function markCpBooked(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    cpBookedAt: serverTimestamp(),
    cpBookedAtMs: Date.now(),
    cpBookedBy: user.uid,
    cpBookingStatus: "booked",
    ...auditPatch([
      "cpBookedAt",
      "cpBookedAtMs",
      "cpBookedBy",
      "cpBookingStatus"
    ])
  });
}

export async function markWarrantyBooked(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    wtyBookedAt: serverTimestamp(),
    wtyBookedAtMs: Date.now(),
    wtyBookedBy: user.uid,
    wtyBookingStatus: "booked",
    ...auditPatch([
      "wtyBookedAt",
      "wtyBookedAtMs",
      "wtyBookedBy",
      "wtyBookingStatus"
    ])
  });
}

export async function clearCpBooked(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    cpBookedAt: null,
    cpBookedAtMs: null,
    cpBookedBy: null,
    cpBookingStatus: "",
    ...auditPatch([
      "cpBookedAt",
      "cpBookedAtMs",
      "cpBookedBy",
      "cpBookingStatus"
    ])
  });
}

export async function clearWarrantyBooked(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    wtyBookedAt: null,
    wtyBookedAtMs: null,
    wtyBookedBy: null,
    wtyBookingStatus: "",
    ...auditPatch([
      "wtyBookedAt",
      "wtyBookedAtMs",
      "wtyBookedBy",
      "wtyBookingStatus"
    ])
  });
}