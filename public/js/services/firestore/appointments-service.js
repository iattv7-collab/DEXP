// public/js/services/firestore/appointments-service.js

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { getSession } from "/js/core/session.js";

export const APPOINTMENTS_COLLECTION = "appointments";

export const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  ARRIVED: "arrived",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

export const TRANSPORT_TYPE = {
  LOANER: "loaner",
  WAITER: "waiter",
  VALET: "valet",
  NONE: "none",
};

function requireDealerSession() {
  const session = getSession();
  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }
  return session;
}

export function normalizeVin(vin = "") {
  return String(vin || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function appointmentDocId({
  dealerId,
  appointmentDate,
  vin,
  appointmentTime,
  customerName,
}) {
  const dateKey = String(appointmentDate || "").replace(/\//g, "-");
  const vinKey = normalizeVin(vin);
  if (vinKey.length >= 8) {
    return `${dealerId}_${dateKey}_${vinKey}`;
  }
  const slug = `${appointmentTime || ""}-${customerName || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${dealerId}_${dateKey}_${slug || crypto.randomUUID()}`;
}

function buildPayload(row = {}, session) {
  const vin = normalizeVin(row.vin);
  const transportationType = String(row.transportationType || TRANSPORT_TYPE.NONE)
    .toLowerCase()
    .trim();
  const loanerRequired = transportationType === TRANSPORT_TYPE.LOANER;

  return {
    dealerId: session.dealerId,
    appointmentDate: String(row.appointmentDate || "").trim(),
    appointmentTime: String(row.appointmentTime || "").trim(),
    customerName: String(row.customerName || "").trim(),
    phone: String(row.phone || "").trim(),
    email: String(row.email || "").trim(),
    vin,
    license: String(row.license || "").trim(),
    vehicle: String(row.vehicle || "").trim(),
    advisorCode: String(row.advisorCode || "").trim(),
    advisorId: String(row.advisorId || "").trim(),
    advisorName: String(row.advisorName || "").trim(),
    concern: String(row.concern || "").trim(),
    transportationType,
    loanerRequired,
    status: row.status || APPOINTMENT_STATUS.SCHEDULED,
    roId: row.roId || "",
    roNumber: row.roNumber || "",
    arrivedAtMs: row.arrivedAtMs || null,
    waitingForLoaner: Boolean(row.waitingForLoaner),
    source: row.source || "sheet-upload",
    rawLine: row.rawLine || "",
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid || "",
    updatedByName: session.displayName || session.email || "",
  };
}

export async function upsertAppointmentsForDate(appointmentDate, rows = [], options = {}) {
  const session = requireDealerSession();
  const date = String(appointmentDate || "").trim();
  if (!date) {
    throw new Error("Appointment date is required.");
  }
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("No appointment rows to save.");
  }

  const existing = await listAppointmentsForDate(date);
  const existingById = new Map(existing.map((row) => [row.id, row]));

  let saved = 0;
  let skippedProtected = 0;

  for (const row of rows) {
    const payload = buildPayload({ ...row, appointmentDate: date }, session);
    const id = appointmentDocId({
      dealerId: session.dealerId,
      appointmentDate: date,
      vin: payload.vin,
      appointmentTime: payload.appointmentTime,
      customerName: payload.customerName,
    });
    const prev = existingById.get(id);
    if (
      prev &&
      (prev.status === APPOINTMENT_STATUS.ARRIVED ||
        prev.status === APPOINTMENT_STATUS.CANCELLED ||
        prev.status === APPOINTMENT_STATUS.NO_SHOW ||
        prev.roId)
    ) {
      skippedProtected += 1;
      continue;
    }

    const ref = doc(db, APPOINTMENTS_COLLECTION, id);
    const next = {
      ...payload,
      id,
    };
    if (!prev) {
      next.createdAt = serverTimestamp();
      next.createdAtMs = Date.now();
      next.createdBy = session.uid || "";
      next.createdByName = session.displayName || session.email || "";
    }
    await setDoc(ref, next, { merge: true });
    saved += 1;
  }

  return { saved, skippedProtected, date };
}

export async function listAppointmentsForDate(appointmentDate) {
  const session = requireDealerSession();
  const q = query(
    collection(db, APPOINTMENTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("appointmentDate", "==", String(appointmentDate || "").trim()),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
}

export function watchAppointmentsForDate(appointmentDate, callback) {
  const session = getSession();
  if (!session?.dealerId || !appointmentDate) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, APPOINTMENTS_COLLECTION),
    where("dealerId", "==", session.dealerId),
    where("appointmentDate", "==", String(appointmentDate).trim()),
  );

  return onSnapshot(q, (snapshot) => {
    const rows = snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
    rows.sort(compareAppointmentRows);
    callback(rows);
  });
}

export async function updateAppointment(appointmentId, updates = {}) {
  const session = requireDealerSession();
  if (!appointmentId) {
    throw new Error("Missing appointment id.");
  }
  const ref = doc(db, APPOINTMENTS_COLLECTION, appointmentId);
  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session.uid || "",
    updatedByName: session.displayName || session.email || "",
  });
}

export async function markAppointmentArrived(appointmentId) {
  const session = requireDealerSession();
  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.ARRIVED,
    arrivedAtMs: Date.now(),
    arrivedBy: session.uid || "",
    arrivedByName: session.displayName || session.email || "",
  });
}

export async function markAppointmentNoShow(appointmentId) {
  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.NO_SHOW,
  });
}

export async function markAppointmentCancelled(appointmentId) {
  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.CANCELLED,
  });
}

export async function linkAppointmentToRO(appointmentId, ro = {}) {
  await updateAppointment(appointmentId, {
    roId: ro.id || ro.roNumber || "",
    roNumber: ro.roNumber || "",
  });
}

export function compareAppointmentRows(a, b) {
  const ta = parseTimeToMinutes(a.appointmentTime);
  const tb = parseTimeToMinutes(b.appointmentTime);
  if (ta !== tb) return ta - tb;
  return String(a.customerName || "").localeCompare(String(b.customerName || ""));
}

export function parseTimeToMinutes(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 99 * 60;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const mer = String(match[3] || "").toUpperCase();
  if (mer === "PM" && hour < 12) hour += 12;
  if (mer === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

export function formatAppointmentDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

export function shiftAppointmentDate(dateStr, days) {
  const [month, day, year] = String(dateStr || "")
    .split("/")
    .map((part) => Number(part));
  if (!month || !day || !year) {
    return formatAppointmentDate(new Date());
  }
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(fullYear, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatAppointmentDate(date);
}