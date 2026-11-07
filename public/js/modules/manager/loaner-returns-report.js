// FILE: /public/js/modules/manager/loaner-returns-report.js
// Loaner return reports.
// Customers: name and phone only.
// Miles: VIN and miles only.

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let session = null;
let returnRows = [];
let roByNumber = {};

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["manager", "loaner-returns"] });
  renderAppHeader();
  session = await waitForSession();

  $("reportDealer").textContent = session.dealerName || session.dealerId || "";
  const day = $("reportDay");
  day.value = todayKey();
  day.addEventListener("change", render);
  $("exportCustomersBtn").addEventListener("click", exportCustomers);
  $("exportMilesBtn").addEventListener("click", exportMiles);

  listenReturns();
  loadRos();
});

function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function selectedRows() {
  const selected = $("reportDay")?.value || todayKey();
  return returnRows
    .filter((row) => dayKey(row.returnedAtText) === selected)
    .sort((a, b) => new Date(b.returnedAtText || 0) - new Date(a.returnedAtText || 0));
}

function roFor(row) {
  return roByNumber[String(row.assignedRo || "").trim()] || {};
}

function customerRows() {
  return selectedRows().map((row) => {
    const ro = roFor(row);
    return {
      name: ro.customerName || "",
      phone: ro.customerPhone || "",
    };
  });
}

function mileRows() {
  return selectedRows().map((row) => ({
    vin: row.vin || "",
    miles: row.mileage || "",
  }));
}

function render() {
  const day = $("reportDay")?.value || todayKey();
  $("reportDate").textContent = day;

  const customers = customerRows();
  $("customerBody").innerHTML = customers.length
    ? customers
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.phone)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="2">No returns this day.</td></tr>`;

  const miles = mileRows();
  $("milesBody").innerHTML = miles.length
    ? miles
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.vin)}</td>
            <td>${escapeHtml(row.miles)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="2">No returns this day.</td></tr>`;
}

function exportCustomers() {
  const day = $("reportDay")?.value || todayKey();
  downloadCsv(
    `loaner-customers-${day}.csv`,
    ["Name", "Phone"],
    customerRows().map((row) => [row.name, row.phone]),
  );
}

function exportMiles() {
  const day = $("reportDay")?.value || todayKey();
  downloadCsv(
    `loaner-miles-${day}.csv`,
    ["VIN", "Miles"],
    mileRows().map((row) => [row.vin, row.miles]),
  );
}

function downloadCsv(name, headers, rows) {
  const cell = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
  const lines = [headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function listenReturns() {
  const q = query(collection(db, "loanerReturns"), where("dealerId", "==", session.dealerId));
  onSnapshot(q, (snap) => {
    returnRows = snap.docs.map((docSnap) => docSnap.data() || {});
    render();
  });
}

async function loadRos() {
  const q = query(collection(db, "ros"), where("dealerId", "==", session.dealerId));
  const snap = await getDocs(q);
  roByNumber = {};
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const number = String(data.roNumber || data.ro || "").trim();
    if (number) roByNumber[number] = data;
  });
  render();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "\u0026amp;",
    "<": "\u0026lt;",
    ">": "\u0026gt;",
    '"': "\u0026quot;",
    "'": "\u0026#039;",
  })[char]);
}

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();
    if (existing?.dealerId) {
      resolve(existing);
      return;
    }
    window.addEventListener("dexp-session-ready", () => resolve(getSession()), { once: true });
  });
}