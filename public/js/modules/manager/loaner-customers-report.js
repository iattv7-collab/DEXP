// FILE: /public/js/modules/manager/loaner-customers-report.js
// Customers who returned a loaner. Name and phone only.

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
  $("printReportBtn").addEventListener("click", () => window.print());

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

function render() {
  const day = $("reportDay")?.value || todayKey();
  $("reportDate").textContent = day;
  const rows = selectedRows();
  $("customerBody").innerHTML = rows.length
    ? rows
        .map((row) => {
          const ro = roByNumber[String(row.assignedRo || "").trim()] || {};
          return `<tr>
            <td>${escapeHtml(ro.customerName || "")}</td>
            <td>${escapeHtml(ro.customerPhone || "")}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="2">No returns this day.</td></tr>`;
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