// ======================================================
// FILE: /public/js/modules/loaners/loaner-trips.js
// PURPOSE:
// Open a trip on assign. Close it on return. No day math.
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
 * Write one open trip for this VIN and out time.
 * @param {object} trip
 * @return {Promise<void>}
 */
export async function openLoanerTrip(trip) {
  const vin = String(trip.vin || "").trim();
  const outAtMs = Number(trip.outAtMs || Date.now());

  if (!vin || !trip.dealerId) {
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
    status: "open",
    createdAt: serverTimestamp(),
  });
}

/**
 * Close the open trip for this VIN. No-op if none is open.
 * @param {object} close
 * @return {Promise<void>}
 */
export async function closeLoanerTrip(close) {
  const vin = String(close.vin || "").trim();

  if (!vin || !close.dealerId) {
    return;
  }

  const snap = await getDocs(
      query(
          collection(db, "loanerTrips"),
          where("dealerId", "==", close.dealerId),
      ),
  );
  const openTrip = snap.docs.find((tripDoc) => {
    const data = tripDoc.data() || {};

    return data.vin === vin && data.status === "open";
  });

  if (!openTrip) {
    return;
  }

  const previous = openTrip.data() || {};

  await setDoc(openTrip.ref, {
    returnedAtMs: Number(close.returnedAtMs || Date.now()),
    returnedAtText: close.returnedAtText || "",
    returnMileage: close.returnMileage || "",
    fuelLevel: close.fuelLevel || "",
    damageNotes: close.damageNotes || "",
    receivedByName: close.receivedByName || "",
    destination: close.destination || "",
    assignedRo: close.assignedRo || previous.assignedRo || "",
    customerName: close.customerName || previous.customerName || "",
    status: "closed",
    updatedAt: serverTimestamp(),
  }, {merge: true});
}
