// ======================================================
// FILE: /public/js/modules/loaners/loaner-trips.js
// PURPOSE:
// Open a trip on assign. Close it on return. No day math.
// A return with no open trip still writes one closed history row.
// ======================================================

import {db} from "/js/services/firebase/firestore.js";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * @param {object} value
 * @return {number}
 */
function stampMs(value) {
  if (value && typeof value.toMillis === "function") {
    return value.toMillis();
  }

  const parsed = Date.parse(String(value || ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {string} dealerId
 * @return {Promise<object[]>}
 */
async function dealerTrips(dealerId) {
  const snap = await getDocs(
      query(
          collection(db, "loanerTrips"),
          where("dealerId", "==", dealerId),
      ),
  );

  return snap.docs.map((tripDoc) => ({
    id: tripDoc.id,
    ref: tripDoc.ref,
    ...(tripDoc.data() || {}),
  }));
}

/**
 * @param {object} trip
 * @param {object} row
 * @return {boolean}
 */
function sameClosedReturn(trip, row) {
  return String(trip.vin || "") === String(row.vin || "").trim() &&
    trip.status === "closed" &&
    String(trip.returnedAtText || "") === String(row.returnedAtText || "") &&
    String(trip.returnMileage || "") === String(row.returnMileage || row.mileage || "");
}

/**
 * Write one open trip for this VIN and out time.
 * A second save of the same assignment does not open another trip.
 * @param {object} trip
 * @return {Promise<void>}
 */
export async function openLoanerTrip(trip) {
  const vin = String(trip.vin || "").trim();
  const outAtMs = Number(trip.outAtMs || Date.now());

  if (!vin || !trip.dealerId) {
    return;
  }

  const trips = await dealerTrips(trip.dealerId);
  const openTrip = trips.find((row) => {
    return row.vin === vin && row.status === "open";
  });

  if (openTrip) {
    return;
  }

  await setDoc(doc(db, "loanerTrips", `${vin}-${outAtMs}`), {
    dealerId: trip.dealerId,
    vin,
    unitNumber: trip.unitNumber || "",
    year: trip.year || "",
    make: trip.make || "",
    model: trip.model || "",
    plate: trip.plate || "",
    assignedRo: trip.assignedRo || "",
    customerName: trip.customerName || "",
    advisorId: trip.advisorId || "",
    advisorName: trip.advisorName || "",
    outAtMs,
    outAtText: trip.outAtText || "",
    outMileage: trip.outMileage || "",
    returnedAtMs: 0,
    returnedAtText: "",
    returnMileage: "",
    fuelLevel: "",
    damageNotes: "",
    receivedByName: "",
    destination: "",
    photoUrls: [],
    status: "open",
    createdAt: serverTimestamp(),
  });
}

/**
 * Close the open trip for this VIN.
 * If none is open, write one closed history row from the return.
 * @param {object} close
 * @return {Promise<void>}
 */
export async function closeLoanerTrip(close) {
  const vin = String(close.vin || "").trim();

  if (!vin || !close.dealerId) {
    throw new Error("Loaner return history needs a VIN and dealer.");
  }

  const trips = await dealerTrips(close.dealerId);
  const alreadyClosed = trips.some((row) => sameClosedReturn(row, close));

  if (alreadyClosed) {
    return;
  }

  const returnedAtMs = Number(close.returnedAtMs || Date.now());
  const closeFields = {
    returnedAtMs,
    returnedAtText: close.returnedAtText || "",
    returnMileage: close.returnMileage || "",
    fuelLevel: close.fuelLevel || "",
    damageNotes: close.damageNotes || "",
    receivedByName: close.receivedByName || "",
    destination: close.destination || "",
    photoUrls: Array.isArray(close.photoUrls) ? close.photoUrls : [],
    assignedRo: close.assignedRo || "",
    customerName: close.customerName || "",
    status: "closed",
    updatedAt: serverTimestamp(),
  };
  const openTrips = trips.filter((row) => {
    return row.vin === vin && row.status === "open";
  });

  if (openTrips.length) {
    const sameRo = close.assignedRo
      ? openTrips.filter((row) => row.assignedRo === close.assignedRo)
      : [];
    const pool = sameRo.length ? sameRo : openTrips;

    pool.sort((a, b) => Number(b.outAtMs || 0) - Number(a.outAtMs || 0));

    const primary = pool[0];

    await setDoc(primary.ref, {
      ...closeFields,
      assignedRo: close.assignedRo || primary.assignedRo || "",
      customerName: close.customerName || primary.customerName || "",
    }, {merge: true});

    return;
  }

  await setDoc(doc(db, "loanerTrips", `${vin}-return-${returnedAtMs}`), {
    dealerId: close.dealerId,
    vin,
    unitNumber: close.unitNumber || "",
    year: close.year || "",
    make: close.make || "",
    model: close.model || "",
    plate: close.plate || "",
    advisorId: close.advisorId || "",
    advisorName: close.advisorName || "",
    outAtMs: Number(close.outAtMs || 0),
    outAtText: close.outAtText || "",
    outMileage: close.outMileage || "",
    ...closeFields,
    createdAt: serverTimestamp(),
  });
}

/**
 * File old loanerReturns that never got a loanerTrips row.
 * Does not close a car that is still Out on that same RO.
 * @param {string} dealerId
 * @return {Promise<number>}
 */
export async function recoverMissingReturnTrips(dealerId) {
  if (!dealerId) {
    return 0;
  }

  const [returnSnap, tripSnap, fleetSnap] = await Promise.all([
    getDocs(query(collection(db, "loanerReturns"), where("dealerId", "==", dealerId))),
    getDocs(query(collection(db, "loanerTrips"), where("dealerId", "==", dealerId))),
    getDocs(query(collection(db, "loanerFleet"), where("dealerId", "==", dealerId))),
  ]);
  const trips = tripSnap.docs.map((tripDoc) => tripDoc.data() || {});
  const fleetByVin = new Map();

  fleetSnap.docs.forEach((fleetDoc) => {
    const data = fleetDoc.data() || {};
    const vin = String(data.vin || fleetDoc.id || "").trim();

    if (vin) {
      fleetByVin.set(vin, data);
    }
  });

  let wrote = 0;

  for (const returnDoc of returnSnap.docs) {
    const row = returnDoc.data() || {};
    const vin = String(row.vin || "").trim();

    if (!vin) {
      continue;
    }

    if (trips.some((trip) => sameClosedReturn(trip, row))) {
      continue;
    }

    const fleet = fleetByVin.get(vin) || {};
    const stillOut = String(fleet.status || "").toUpperCase() === "OUT" &&
      String(fleet.assignedRo || "") === String(row.assignedRo || "");

    if (stillOut) {
      continue;
    }

    const returnedAtMs = stampMs(row.createdAt) || stampMs(row.returnedAtText) || Date.now();

    await setDoc(doc(db, "loanerTrips", `${vin}-return-${returnedAtMs}`), {
      dealerId,
      vin,
      unitNumber: fleet.unitNumber || "",
      year: row.year || fleet.year || "",
      make: fleet.make || "",
      model: row.model || fleet.model || "",
      plate: fleet.plate || "",
      assignedRo: row.assignedRo || "",
      customerName: "",
      advisorId: "",
      advisorName: "",
      outAtMs: 0,
      outAtText: "",
      outMileage: row.checkoutMileage || "",
      returnedAtMs,
      returnedAtText: row.returnedAtText || "",
      returnMileage: row.mileage || "",
      fuelLevel: row.fuelLevel || "",
      damageNotes: row.damageNotes || "",
      receivedByName: row.receivedByName || "",
      destination: "",
      photoUrls: [],
      status: "closed",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, {merge: true});

    trips.push({
      vin,
      status: "closed",
      returnedAtText: row.returnedAtText || "",
      returnMileage: row.mileage || "",
    });
    wrote += 1;
  }

  return wrote;
}