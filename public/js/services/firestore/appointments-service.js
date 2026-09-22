// public/js/services/firestore/appointments-service.js

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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

export const APPOINTMENT_ARRIVED_EVENT = "appointment_arrived";

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

export function appointmentArrivedNotificationId(appointmentId = "") {
  return `appt-arrived-${String(appointmentId || "").trim()}`;
}

function normalizeAdvisorCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function nameInitials(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "";
}

function isUsableAdvisorUser(user = {}) {
  if (!user?.id && !user?.uid) return false;
  if (user.active === false) return false;
  const role = String(user.role || "").toLowerCase();
  if (role === "pending" || role === "platform-admin") return false;
  return true;
}

async function listDealerUsers(dealerId) {
  const snapshot = await getDocs(
    query(collection(db, "users"), where("dealerId", "==", dealerId)),
  );
  return snapshot.docs.map((snap) => ({
    id: snap.id,
    uid: snap.id,
    ...snap.data(),
  }));
}

export async function findAdvisorForAppointment(appointment = {}) {
  const session = requireDealerSession();
  const storedId = String(appointment.advisorId || "").trim();
  const code = normalizeAdvisorCode(appointment.advisorCode);

  const users = (await listDealerUsers(session.dealerId)).filter(isUsableAdvisorUser);

  if (storedId) {
    const stored = users.find((user) => user.id === storedId || user.uid === storedId);
    if (stored) {
      return {
        advisorId: stored.id,
        advisorName: stored.displayName || stored.email || "",
        advisorCode: stored.advisorCode || appointment.advisorCode || "",
        match: "advisorId",
      };
    }
  }

  if (!code) {
    return null;
  }

  const byAdvisorCode = users.filter(
    (user) => normalizeAdvisorCode(user.advisorCode) === code,
  );
  if (byAdvisorCode.length === 1) {
    const user = byAdvisorCode[0];
    return {
      advisorId: user.id,
      advisorName: user.displayName || user.email || "",
      advisorCode: user.advisorCode || appointment.advisorCode || "",
      match: "advisorCode",
    };
  }

  const byEmployeeNumber = users.filter(
    (user) => normalizeAdvisorCode(user.companyId) === code,
  );
  if (byEmployeeNumber.length === 1) {
    const user = byEmployeeNumber[0];
    return {
      advisorId: user.id,
      advisorName: user.displayName || user.email || "",
      advisorCode: appointment.advisorCode || user.companyId || "",
      match: "companyId",
    };
  }

  const byInitials = users.filter((user) => nameInitials(user.displayName) === code);
  if (byInitials.length === 1) {
    const user = byInitials[0];
    return {
      advisorId: user.id,
      advisorName: user.displayName || user.email || "",
      advisorCode: appointment.advisorCode || "",
      match: "initials",
    };
  }

  return null;
}

function buildArrivedMessage(appointment = {}) {
  return [
    appointment.customerName,
    appointment.vehicle,
    appointment.appointmentTime,
    appointment.transportationType && appointment.transportationType !== "none"
      ? appointment.transportationType
      : "",
    appointment.vin ? `VIN ${String(appointment.vin).slice(-8)}` : "",
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");
}

async function createAppointmentArrivedNotification(appointment = {}, advisor) {
  const session = requireDealerSession();
  const appointmentId = String(appointment.id || "").trim();
  if (!appointmentId || !advisor?.advisorId) {
    return null;
  }

  const notificationId = appointmentArrivedNotificationId(appointmentId);
  const notificationRef = doc(db, "notificationRequests", notificationId);
  const existing = await getDoc(notificationRef);
  if (existing.exists()) {
    const data = existing.data() || {};
    if (String(data.status || "") !== "resolved") {
      return { id: notificationId, alreadyExisted: true };
    }
  }

  const now = Date.now();
  const message = buildArrivedMessage(appointment) || "A customer has arrived.";

  await setDoc(notificationRef, {
    id: notificationId,
    dealerId: session.dealerId,
    module: "appointments",
    eventType: APPOINTMENT_ARRIVED_EVENT,
    title: "Customer arrived",
    message,
    status: "active",
    targetType: "user",
    targetUserId: advisor.advisorId,
    targetUserName: advisor.advisorName || "",
    targetGroupId: "",
    route: "/pages/operations/operations.html",
    routeParams: {
      tab: "appointments",
      appointmentId,
      notificationId,
    },
    sourceType: "appointment",
    sourceId: appointmentId,
    relatedRoId: appointment.roId || "",
    relatedRoNumber: appointment.roNumber || "",
    relatedTagNumber: "",
    relatedAppointmentId: appointmentId,
    openedBy: "",
    openedByName: "",
    openedAtMs: null,
    dismissedBy: {},
    resolvedAt: null,
    resolvedAtMs: null,
    resolvedBy: "",
    createdAt: serverTimestamp(),
    createdAtMs: now,
    createdBy: session.uid || "",
    createdByName: session.displayName || session.email || "",
    updatedAt: serverTimestamp(),
    updatedAtMs: now,
    updatedBy: session.uid || "",
  });

  return { id: notificationId, alreadyExisted: false };
}

export async function resolveAppointmentArrivedAlert(appointmentId = "") {
  const session = getSession();
  const safeId = String(appointmentId || "").trim();
  if (!safeId) return;

  const notificationId = appointmentArrivedNotificationId(safeId);
  const notificationRef = doc(db, "notificationRequests", notificationId);
  const snapshot = await getDoc(notificationRef);
  if (!snapshot.exists()) return;

  const data = snapshot.data() || {};
  if (String(data.status || "") === "resolved") return;

  await updateDoc(notificationRef, {
    status: "resolved",
    resolvedAt: serverTimestamp(),
    resolvedAtMs: Date.now(),
    resolvedBy: session?.uid || "appointments",
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    updatedBy: session?.uid || "",
  });
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

export async function getAppointment(appointmentId) {
  if (!appointmentId) {
    throw new Error("Missing appointment id.");
  }
  const snapshot = await getDoc(doc(db, APPOINTMENTS_COLLECTION, appointmentId));
  if (!snapshot.exists()) {
    throw new Error("Appointment not found.");
  }
  return { id: snapshot.id, ...snapshot.data() };
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
  const appointment = await getAppointment(appointmentId);
  const advisor = await findAdvisorForAppointment(appointment);
  const now = Date.now();

  const updates = {
    status: APPOINTMENT_STATUS.ARRIVED,
    arrivedAtMs: appointment.arrivedAtMs || now,
    arrivedBy: appointment.arrivedBy || session.uid || "",
    arrivedByName: appointment.arrivedByName || session.displayName || session.email || "",
    arrivedNotifyActive: Boolean(advisor?.advisorId),
    arrivedAcknowledgedAtMs: appointment.arrivedAcknowledgedAtMs || null,
  };

  if (advisor?.advisorId) {
    updates.advisorId = advisor.advisorId;
    updates.advisorName = advisor.advisorName || "";
    updates.arrivedNotifyUserId = advisor.advisorId;
    updates.arrivedNotifyError = "";
  } else {
    updates.arrivedNotifyUserId = "";
    updates.arrivedNotifyError = appointment.advisorCode
      ? `no_advisor_mapped:${appointment.advisorCode}`
      : "no_advisor_code";
  }

  await updateAppointment(appointmentId, updates);

  if (!advisor?.advisorId) {
    return { notified: false, reason: updates.arrivedNotifyError };
  }

  const notification = await createAppointmentArrivedNotification(
    { ...appointment, ...updates, id: appointmentId },
    advisor,
  );

  if (notification?.id) {
    await updateAppointment(appointmentId, {
      arrivedNotificationId: notification.id,
    });
  }

  return {
    notified: Boolean(notification?.id),
    alreadyExisted: Boolean(notification?.alreadyExisted),
    advisor,
  };
}

export async function undoAppointmentArrived(appointmentId) {
  const appointment = await getAppointment(appointmentId);
  if (String(appointment.status || "") !== APPOINTMENT_STATUS.ARRIVED) {
    throw new Error("This appointment is not marked arrived.");
  }
  if (appointment.roId || appointment.roNumber) {
    throw new Error("RO already linked. Undo is only for a mistaken Arrived tap.");
  }

  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.SCHEDULED,
    arrivedAtMs: null,
    arrivedBy: "",
    arrivedByName: "",
    arrivedNotifyActive: false,
    arrivedNotificationId: "",
    arrivedNotifyError: "",
    arrivedAcknowledgedAtMs: null,
    arrivedAcknowledgedBy: "",
    arrivedAcknowledgedByName: "",
  });

  const notificationId = appointmentArrivedNotificationId(appointmentId);
  const notificationRef = doc(db, "notificationRequests", notificationId);
  const snapshot = await getDoc(notificationRef);
  if (snapshot.exists()) {
    await deleteDoc(notificationRef);
  }
}

export async function acknowledgeAppointmentArrived(appointmentId) {
  const session = requireDealerSession();
  await updateAppointment(appointmentId, {
    arrivedNotifyActive: false,
    arrivedAcknowledgedAtMs: Date.now(),
    arrivedAcknowledgedBy: session.uid || "",
    arrivedAcknowledgedByName: session.displayName || session.email || "",
  });
  await resolveAppointmentArrivedAlert(appointmentId);
}

export async function markAppointmentNoShow(appointmentId) {
  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.NO_SHOW,
    arrivedNotifyActive: false,
  });
  await resolveAppointmentArrivedAlert(appointmentId);
}

export async function markAppointmentCancelled(appointmentId) {
  await updateAppointment(appointmentId, {
    status: APPOINTMENT_STATUS.CANCELLED,
    arrivedNotifyActive: false,
  });
  await resolveAppointmentArrivedAlert(appointmentId);
}

export async function linkAppointmentToRO(appointmentId, ro = {}) {
  await updateAppointment(appointmentId, {
    roId: ro.id || ro.roNumber || "",
    roNumber: ro.roNumber || "",
    arrivedNotifyActive: false,
  });
  await resolveAppointmentArrivedAlert(appointmentId);
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
