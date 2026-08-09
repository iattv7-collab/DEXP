// ======================================================
// FILE: /public/js/services/firestore/courtesy-wash-service.js
// MODULE: Courtesy Wash
// PURPOSE:
// Firestore service for Courtesy Wash vehicles.
// Courtesy Wash records are independent from Master ROS.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const COURTESY_WASH_COLLECTION = "courtesyWashes";

const ACTIVE_WASH_STATUSES = ["pending", "rewash_requested", "washing"];

const DEFAULT_WASH_MINUTES_PER_VEHICLE = 15;

function clean(value) {
  return String(value || "").trim();
}

function normalizeVin(value) {
  return clean(value).toUpperCase();
}

function getDealerId() {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Dealer session not ready.");
  }

  return session.dealerId;
}

function washEvent(type) {
  const session = getSession();

  return {
    type,
    atMs: Date.now(),
    by: auth.currentUser?.uid || "",
    role: session?.role || "unknown",
    cycle: "wash",
  };
}

function auditPatch() {
  const session = getSession();
  const user = auth.currentUser;

  return {
    updatedAt: serverTimestamp(),
    updatedByUid: user?.uid || "",
    updatedByName: clean(user?.displayName || ""),
    updatedByEmail: clean(user?.email || ""),
    lastEditedAtMs: Date.now(),
    lastEditedBy: user?.uid || "",
    lastEditedRole: session?.role || "unknown",
  };
}

// ======================================================
// ACTIVE RO WASHES
// Used only for completion-time estimation.
// ======================================================

async function getActiveRoWashRows(dealerId) {
  const activeQuery = query(
    collection(db, "ros"),
    where("dealerId", "==", dealerId),
    where("washStatus", "in", ACTIVE_WASH_STATUSES),
  );

  const snapshot = await getDocs(activeQuery);

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    sourceType: "ro",
    ...documentSnapshot.data(),
  }));
}

// ======================================================
// ACTIVE COURTESY WASHES
// ======================================================

async function getActiveCourtesyWashRows(dealerId) {
  const activeQuery = query(
    collection(db, COURTESY_WASH_COLLECTION),
    where("dealerId", "==", dealerId),
    where("washStatus", "in", ACTIVE_WASH_STATUSES),
  );

  const snapshot = await getDocs(activeQuery);

  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    sourceType: "courtesy",
    ...documentSnapshot.data(),
  }));
}

// ======================================================
// REAL-TIME COURTESY WASH QUEUE
// ======================================================

export function listenToActiveCourtesyWashes(dealerId, onRows, onError = null) {
  if (!dealerId) {
    throw new Error("Dealer ID is required.");
  }

  const activeQuery = query(
    collection(db, COURTESY_WASH_COLLECTION),
    where("dealerId", "==", dealerId),
    where("washStatus", "in", ACTIVE_WASH_STATUSES),
  );

  return onSnapshot(
    activeQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        sourceType: "courtesy",
        ...documentSnapshot.data(),
      }));

      onRows(rows);
    },
    (error) => {
      console.error("Courtesy Wash listener failed:", error);

      if (typeof onError === "function") {
        onError(error);
      }
    },
  );
}

// ======================================================
// DUPLICATE ACTIVE VIN CHECK
// ======================================================

export async function findActiveCourtesyWashByVin(vin) {
  const dealerId = getDealerId();
  const normalizedVin = normalizeVin(vin);

  if (!normalizedVin) {
    return null;
  }

  const activeRows = await getActiveCourtesyWashRows(dealerId);

  return (
    activeRows.find((row) => normalizeVin(row.vin) === normalizedVin) || null
  );
}

// ======================================================
// ESTIMATED COMPLETION TIME
// ======================================================

export async function getCourtesyWashEstimate({
  minutesPerVehicle = DEFAULT_WASH_MINUTES_PER_VEHICLE,
} = {}) {
  const dealerId = getDealerId();

  const [roRows, courtesyRows] = await Promise.all([
    getActiveRoWashRows(dealerId),
    getActiveCourtesyWashRows(dealerId),
  ]);

  const vehiclesAhead = roRows.length + courtesyRows.length;

  const estimatedMinutes = (vehiclesAhead + 1) * minutesPerVehicle;

  const estimatedCompletionAtMs = Date.now() + estimatedMinutes * 60 * 1000;

  return {
    vehiclesAhead,
    estimatedMinutes,
    estimatedCompletionAtMs,
    minutesPerVehicle,
  };
}

// ======================================================
// CREATE COURTESY WASH
// ======================================================

export async function createCourtesyWash({
  vin,
  year = "",
  make = "",
  model = "",
  customerName,
  customerPhone,
  estimatedCompletionAtMs = null,
}) {
  const session = getSession();
  const dealerId = getDealerId();

  const normalizedVin = normalizeVin(vin);
  const normalizedName = clean(customerName);
  const normalizedPhone = clean(customerPhone);

  if (normalizedVin.length !== 17) {
    throw new Error("A valid 17-character VIN is required.");
  }

  if (!normalizedName) {
    throw new Error("Customer name is required.");
  }

  if (!normalizedPhone) {
    throw new Error("Customer phone number is required.");
  }

  const existing = await findActiveCourtesyWashByVin(normalizedVin);

  if (existing) {
    throw new Error("This VIN already has an active Courtesy Wash.");
  }

  const nowMs = Date.now();

  const record = {
    dealerId,

    sourceType: "courtesy",

    vin: normalizedVin,
    vinLast8: normalizedVin.slice(-8),

    year: clean(year),
    make: clean(make),
    model: clean(model),

    customerName: normalizedName,
    customerPhone: normalizedPhone,

    customerWaiting: false,
    priorityType: "normal",

    washNotes: "",
    washStatus: "pending",

    washQueuedAt: serverTimestamp(),
    washQueuedAtMs: nowMs,
    washQueuedBy: session?.uid || "",

    estimatedCompletionAtMs:
      typeof estimatedCompletionAtMs === "number"
        ? estimatedCompletionAtMs
        : null,

    washEvents: [
      {
        type: "wash_queued",
        atMs: nowMs,
        by: session?.uid || "",
        role: session?.role || "unknown",
        cycle: "wash",
      },
    ],

    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    createdBy: session?.uid || "",
    createdByName: clean(session?.displayName || ""),

    updatedAt: serverTimestamp(),
    updatedAtMs: nowMs,
  };

  const documentReference = await addDoc(
    collection(db, COURTESY_WASH_COLLECTION),
    record,
  );

  return {
    id: documentReference.id,
    ...record,
  };
}

// ======================================================
// START / COMPLETE COURTESY WASH
// ======================================================

export async function setCourtesyWashStatus(courtesyWashId, nextStatus) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Not signed in.");
  }

  const status = clean(nextStatus).toLowerCase();

  if (!["washing", "washed"].includes(status)) {
    throw new Error("Invalid wash status.");
  }

  const nowMs = Date.now();

  const patch = {
    washStatus: status,
    ...auditPatch(),
  };

  if (status === "washing") {
    patch.washingStartedAt = serverTimestamp();
    patch.washingStartedAtMs = nowMs;
    patch.washingStartedBy = user.uid;

    patch.washEvents = arrayUnion(washEvent("wash_start"));

    patch.lastEditedFields = [
      "washStatus",
      "washingStartedAt",
      "washingStartedAtMs",
      "washingStartedBy",
    ];
  }

  if (status === "washed") {
    patch.washedAt = serverTimestamp();
    patch.washedAtMs = nowMs;
    patch.washedBy = user.uid;
    patch.washedByName = clean(user.displayName || "");

    patch.priorityType = "normal";

    patch.washEvents = arrayUnion(washEvent("wash_complete"));

    patch.lastEditedFields = [
      "washStatus",
      "washedAt",
      "washedAtMs",
      "washedBy",
      "washedByName",
      "priorityType",
    ];
  }

  await updateDoc(doc(db, COURTESY_WASH_COLLECTION, courtesyWashId), patch);
}

// ======================================================
// REMOVE COURTESY WASH
// ======================================================

export async function removeCourtesyWashFromQueue(courtesyWashId) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Not signed in.");
  }

  await updateDoc(doc(db, COURTESY_WASH_COLLECTION, courtesyWashId), {
    washStatus: "removed",

    removedAt: serverTimestamp(),
    removedAtMs: Date.now(),
    removedBy: user.uid,
    removedByName: clean(user.displayName || ""),

    washEvents: arrayUnion(washEvent("wash_removed")),

    ...auditPatch(),

    lastEditedFields: [
      "washStatus",
      "removedAt",
      "removedAtMs",
      "removedBy",
      "removedByName",
    ],
  });
}

// ======================================================
// COMPLETED COURTESY WASH HISTORY
// ======================================================

export function listenToCompletedCourtesyWashes(
  dealerId,
  onRows,
  onError = null,
) {
  if (!dealerId) {
    throw new Error("Dealer ID is required.");
  }

  const historyQuery = query(
    collection(db, COURTESY_WASH_COLLECTION),
    where("dealerId", "==", dealerId),
    where("washStatus", "==", "washed"),
  );

  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        sourceType: "courtesy",
        ...documentSnapshot.data(),
      }));

      onRows(rows);
    },
    (error) => {
      console.error("Courtesy Wash history listener failed:", error);

      if (typeof onError === "function") {
        onError(error);
      }
    },
  );
}

export {
  COURTESY_WASH_COLLECTION,
  ACTIVE_WASH_STATUSES,
  DEFAULT_WASH_MINUTES_PER_VEHICLE,
};
