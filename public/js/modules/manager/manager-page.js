// FILE: /public/js/modules/manager/manager-page.js
// Report Center. Printable snapshot with drill-down lists.

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let session = null;
let rosRows = [];
let requestRows = [];
let activeFilter = "open";
let activeValet = "";

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["manager"] });
  renderAppHeader();
  session = await waitForSession();

  $("reportDealer").textContent = session.dealerName || session.dealerId || "";
  $("reportDate").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  $("reportPrepared").textContent = session.displayName || session.email || "";

  $("printReportBtn").addEventListener("click", () => window.print());
  $("clearDrillBtn").addEventListener("click", () => {
    activeFilter = "open";
    activeValet = "";
    render();
  });

  $("reportKpiBody").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-filter]");
    if (!row) return;
    activeFilter = row.dataset.filter;
    activeValet = "";
    render();
  });

  $("valetTableBody").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-valet]");
    if (!row) return;
    activeValet = row.dataset.valet;
    activeFilter = "valet";
    render();
  });

  listenRos(session.dealerId);
  listenRequests(session.dealerId);
});

function isArchived(ro) {
  return (
    String(ro.status || "").toLowerCase() === "archived" ||
    Boolean(ro.archivedAtMs) ||
    Boolean(ro.archivedAt)
  );
}

function isPickedUp(ro) {
  return Boolean(
    ro.pickedUp === true ||
      ro.pickedUpAtMs ||
      String(ro.pickupStatus || "").toLowerCase() === "picked_up",
  );
}

function isOpen(ro) {
  return !isArchived(ro) && !isPickedUp(ro);
}

function qcPending(ro) {
  const status = String(ro.qcStatus || "").toLowerCase();
  return ro.qcRequired === true && (status === "requested" || status === "working");
}

function isToday(ms) {
  if (!ms) return false;
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function needByMs(ro) {
  return Number(ro.needByAtMs || ro.washNeedByAtMs || 0);
}

function projectedMs(ro) {
  return Number(ro.projectedFinishAtMs || ro.washProjectedAtMs || 0);
}

function isLateNeedBy(ro) {
  const need = needByMs(ro);
  if (!need) return false;
  return (projectedMs(ro) || Date.now()) > need;
}

function vehicle(ro) {
  return [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
}

function requestKey(row) {
  return `${row.requestType || ""} ${row.type || ""} ${row.title || ""}`.toLowerCase();
}

function isMoveRequest(row) {
  const key = requestKey(row);
  return key.includes("move") || key.includes("locate") || key.includes("bring");
}

function isPickupRequest(row) {
  return requestKey(row).includes("pickup");
}

function valetNameFromRequest(row) {
  return row.openedByName || row.resolvedByName || row.completedByName || row.updatedByName || "";
}

function fmt(ms) {
  if (!ms) return "";
  return new Date(Number(ms)).toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function listenRos(dealerId) {
  const q = query(collection(db, "ros"), where("dealerId", "==", dealerId));
  onSnapshot(q, (snapshot) => {
    rosRows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  });
}

function listenRequests(dealerId) {
  const q = query(collection(db, "notificationRequests"), where("dealerId", "==", dealerId));
  onSnapshot(q, (snapshot) => {
    requestRows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  });
}

const FILTERS = [
  { key: "open", label: "Open repair orders" },
  { key: "waiters", label: "Customer waiters" },
  { key: "techDone", label: "Technician complete" },
  { key: "qc", label: "QC pending" },
  { key: "ready", label: "Ready, not picked up" },
  { key: "wash", label: "In wash" },
  { key: "washedToday", label: "Washed today" },
  { key: "late", label: "Late versus Need By" },
  { key: "pickupsToday", label: "Pickups completed today" },
];

function matchFilter(ro, key) {
  if (key === "open") return isOpen(ro);
  if (key === "waiters") return isOpen(ro) && (ro.isWaiter === true || ro.customerWaiting === true);
  if (key === "techDone") return isOpen(ro) && String(ro.techStatus || "").toLowerCase() === "completed";
  if (key === "qc") return isOpen(ro) && qcPending(ro);
  if (key === "ready") return isOpen(ro) && ro.readyCalled === true;
  if (key === "wash") return isOpen(ro) && ["pending", "washing", "rewash_requested"].includes(String(ro.washStatus || "").toLowerCase());
  if (key === "washedToday") return isToday(ro.washedAtMs);
  if (key === "late") return isOpen(ro) && isLateNeedBy(ro);
  if (key === "pickupsToday") return isToday(ro.pickedUpAtMs);
  return false;
}

function filterCount(key) {
  return rosRows.filter((ro) => matchFilter(ro, key)).length;
}

function valetSummary() {
  const byName = new Map();
  function bump(name, field) {
    const key = String(name || "").trim() || "Unassigned";
    if (!byName.has(key)) byName.set(key, { name: key, moves: 0, pickups: 0 });
    byName.get(key)[field] += 1;
  }
  rosRows.forEach((ro) => {
    if (isToday(ro.pickedUpAtMs) && ro.pickedUpByName) bump(ro.pickedUpByName, "pickups");
  });
  requestRows.forEach((row) => {
    const doneMs = row.resolvedAtMs || row.completedAtMs || row.updatedAtMs;
    if (!isToday(doneMs)) return;
    const status = String(row.status || "").toLowerCase();
    if (status && status !== "resolved" && status !== "completed") return;
    const name = valetNameFromRequest(row);
    if (isPickupRequest(row)) bump(name, "pickups");
    else if (isMoveRequest(row)) bump(name, "moves");
  });
  return [...byName.values()].sort((a, b) => b.moves + b.pickups - (a.moves + a.pickups) || a.name.localeCompare(b.name));
}

function drillRows() {
  if (activeFilter === "valet" && activeValet) {
    const name = activeValet;
    const fromRos = rosRows
      .filter((ro) => isToday(ro.pickedUpAtMs) && String(ro.pickedUpByName || "") === name)
      .map((ro) => ({
        tag: ro.tagNumber,
        ro: ro.roNumber,
        vehicle: vehicle(ro),
        advisor: ro.advisorName,
        kind: "Pickup",
        who: ro.pickedUpByName,
        when: fmt(ro.pickedUpAtMs),
      }));
    const fromReq = requestRows
      .filter((row) => {
        const doneMs = row.resolvedAtMs || row.completedAtMs || row.updatedAtMs;
        if (!isToday(doneMs)) return false;
        const status = String(row.status || "").toLowerCase();
        if (status && status !== "resolved" && status !== "completed") return false;
        return valetNameFromRequest(row) === name;
      })
      .map((row) => ({
        tag: row.relatedTagNumber || "",
        ro: row.relatedRoNumber || "",
        vehicle: "",
        advisor: "",
        kind: row.title || row.requestType || "Request",
        who: valetNameFromRequest(row),
        when: fmt(row.resolvedAtMs || row.completedAtMs || row.updatedAtMs),
      }));
    return [...fromRos, ...fromReq];
  }

  return rosRows
    .filter((ro) => matchFilter(ro, activeFilter))
    .map((ro) => ({
      tag: ro.tagNumber,
      ro: ro.roNumber,
      vehicle: vehicle(ro),
      advisor: ro.advisorName,
      kind: statusLine(ro),
      who: ro.techName || ro.pickedUpByName || "",
      when: fmt(ro.updatedAtMs || ro.washedAtMs || ro.pickedUpAtMs),
    }));
}

function statusLine(ro) {
  const parts = [];
  if (ro.techStatus) parts.push(`Tech ${ro.techStatus}`);
  if (ro.washStatus) parts.push(`Wash ${ro.washStatus}`);
  if (ro.qcStatus) parts.push(`QC ${ro.qcStatus}`);
  if (ro.readyCalled) parts.push("Ready");
  return parts.join(" · ") || ro.status || "";
}

function renderKpi() {
  $("reportKpiBody").innerHTML = FILTERS.map((item) => {
    const active = activeFilter === item.key && !activeValet ? "active" : "";
    return `<tr class="${active}" data-filter="${item.key}">
      <td class="label">${item.label}</td>
      <td class="num">${filterCount(item.key)}</td>
    </tr>`;
  }).join("");
}

function renderValetTable() {
  const rows = valetSummary();
  if (!rows.length) {
    $("valetTableBody").innerHTML = `<tr><td colspan="4">No valet production recorded today.</td></tr>`;
    return;
  }
  $("valetTableBody").innerHTML = rows
    .map((row) => {
      const active = activeValet === row.name ? "active" : "";
      return `<tr class="${active}" data-valet="${escapeHtml(row.name)}">
        <td>${escapeHtml(row.name)}</td>
        <td class="num">${row.moves}</td>
        <td class="num">${row.pickups}</td>
        <td class="num"><b>${row.moves + row.pickups}</b></td>
      </tr>`;
    })
    .join("");
}

function renderDrill() {
  const filter = FILTERS.find((item) => item.key === activeFilter);
  const title = activeValet ? `Valet — ${activeValet}` : filter?.label || "Detail";
  $("drillTitle").textContent = title;
  $("drillNote").textContent = "Use this list to see who is loaded, late, or idle before you add or cut people.";

  const rows = drillRows();
  if (!rows.length) {
    $("drillBody").innerHTML = `<tr><td colspan="7">No rows in this view.</td></tr>`;
    return;
  }
  $("drillBody").innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.tag)}</td>
        <td>${escapeHtml(row.ro)}</td>
        <td>${escapeHtml(row.vehicle)}</td>
        <td>${escapeHtml(row.advisor)}</td>
        <td>${escapeHtml(row.kind)}</td>
        <td>${escapeHtml(row.who)}</td>
        <td>${escapeHtml(row.when)}</td>
      </tr>`,
    )
    .join("");
}

function render() {
  renderKpi();
  renderValetTable();
  renderDrill();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
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
