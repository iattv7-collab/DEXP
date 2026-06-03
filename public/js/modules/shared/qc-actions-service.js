// ======================================================
// FILE: /public/js/modules/shared/qc-actions-service.js
// PURPOSE:
// Shared QC workflow actions.
// Used by Advisor, Booker, QC, and future reports.
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

export async function requestQc(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    qcRequired: true,
    qcStatus: "requested",
    qcRequestedAt: serverTimestamp(),
    qcRequestedAtMs: Date.now(),
    qcRequestedBy: user.uid,
    qcStartedAt: null,
    qcStartedAtMs: null,
    qcStartedBy: null,
    qcDoneAt: null,
    qcDoneAtMs: null,
    qcDoneBy: null,
    ...auditPatch([
      "qcRequired",
      "qcStatus",
      "qcRequestedAt",
      "qcRequestedAtMs",
      "qcRequestedBy",
      "qcStartedAt",
      "qcStartedAtMs",
      "qcStartedBy",
      "qcDoneAt",
      "qcDoneAtMs",
      "qcDoneBy"
    ])
  });
}

export async function markNoQcRequired(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    qcRequired: false,
    qcStatus: "not_required",
    qcRequestedAt: null,
    qcRequestedAtMs: null,
    qcRequestedBy: null,
    qcStartedAt: null,
    qcStartedAtMs: null,
    qcStartedBy: null,
    qcDoneAt: null,
    qcDoneAtMs: null,
    qcDoneBy: null,
    ...auditPatch([
      "qcRequired",
      "qcStatus",
      "qcRequestedAt",
      "qcRequestedAtMs",
      "qcRequestedBy",
      "qcStartedAt",
      "qcStartedAtMs",
      "qcStartedBy",
      "qcDoneAt",
      "qcDoneAtMs",
      "qcDoneBy"
    ])
  });
}

export async function startQc(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    qcRequired: true,
    qcStatus: "working",
    qcStartedAt: serverTimestamp(),
    qcStartedAtMs: Date.now(),
    qcStartedBy: user.uid,
    ...auditPatch([
      "qcRequired",
      "qcStatus",
      "qcStartedAt",
      "qcStartedAtMs",
      "qcStartedBy"
    ])
  });
}

export async function markQcComplete(roId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  await updateDoc(doc(db, "ros", roId), {
    qcRequired: true,
    qcStatus: "complete",
    qcDoneAt: serverTimestamp(),
    qcDoneAtMs: Date.now(),
    qcDoneBy: user.uid,
    ...auditPatch([
      "qcRequired",
      "qcStatus",
      "qcDoneAt",
      "qcDoneAtMs",
      "qcDoneBy"
    ])
  });
}