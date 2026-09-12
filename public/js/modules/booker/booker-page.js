// ======================================================
// FILE: /public/js/modules/booker/booker-page.js
// MODULE: Booker
// PURPOSE:
// DEXP Booker page.
// Shows washed vehicles and allows booking/QC workflow
// actions: CP booked, warranty booked, request QC,
// and no QC required.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  markCpBooked,
  markWarrantyBooked,
  clearCpBooked,
  clearWarrantyBooked,
} from "/js/modules/shared/booking-actions-service.js";
import {
  requestQc,
  markNoQcRequired,
} from "/js/modules/shared/qc-actions-service.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let session = null;
let rows = [];
let searchText = "";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["booker"] });
  renderAppHeader();
  session = await waitForSession();

  $("bookerTableBody").addEventListener("click", onTableClick);
  $("bookerSearchInput").addEventListener("input", (event) => {
    searchText = String(event.target.value || "").trim().toLowerCase();
    render();
  });

  listenToDoneRos();
});

function listenToDoneRos() {
  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
    where("techStatus", "==", "completed"),
  );

  onSnapshot(q, (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    render();
  });
}

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

function qcStatus(ro) {
  return String(ro.qcStatus || "").toLowerCase();
}

function qcLabel(ro) {
  const status = qcStatus(ro);
  if (status === "requested") return "Requested";
  if (status === "working") return "Working";
  if (status === "complete") return "Done";
  if (status === "not_required") return "No QC";
  return "";
}

function qcLocked(ro) {
  const status = qcStatus(ro);
  return (
    status === "requested" ||
    status === "working" ||
    status === "complete" ||
    status === "not_required"
  );
}

function isCpBooked(ro) {
  return Boolean(ro.cpBookedAtMs || ro.cpBookedAt);
}

function isWtyBooked(ro) {
  return Boolean(ro.wtyBookedAtMs || ro.wtyBookedAt);
}

function isBooked(ro) {
  return isCpBooked(ro) || isWtyBooked(ro);
}

function matchesSearch(ro) {
  if (!searchText) return true;
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const hay = [ro.tagNumber, ro.roNumber, vehicle, ro.advisorName, ro.techName]
    .join(" ")
    .toLowerCase();
  return hay.includes(searchText);
}

function liveRows() {
  return rows.filter((ro) => !isArchived(ro) && !isPickedUp(ro) && matchesSearch(ro));
}

function setMsg(text) {
  const el = $("msg");
  if (el) el.textContent = text || "";
}

function updateCounts(list) {
  const tabs = $("bookerTabs");
  if (!tabs) return;

  const counts = {
    open: list.length,
    qc: list.filter((ro) => {
      const status = qcStatus(ro);
      return status === "requested" || status === "working";
    }).length,
    booked: list.filter(isBooked).length,
  };

  const labels = { open: "Tech Done", qc: "QC pending", booked: "Booked" };

  tabs.querySelectorAll("button[data-tab]").forEach((tab) => {
    const key = tab.dataset.tab;
    const count = counts[key] || 0;
    tab.textContent = `${labels[key]} (${count})`;
    tab.disabled = true;
    tab.classList.toggle("has-rows", count > 0);
    tab.classList.toggle("active", count > 0);
  });
}

function bookingCell(booked, bookAction, unbookAction, label) {
  if (booked) {
    return `
      <span>Booked</span>
      <button type="button" class="small-button" data-action="${unbookAction}">Clear ${label}</button>
    `;
  }

  return `
    <button type="button" class="small-button" data-action="${bookAction}">Book ${label}</button>
  `;
}

function renderQcActions(ro) {
  const locked = qcLocked(ro);
  return `
    <button type="button" class="small-button" data-action="requestQc" ${locked ? "disabled" : ""}>Request QC</button>
    <button type="button" class="small-button" data-action="noQc" ${locked ? "disabled" : ""}>No QC needed</button>
  `;
}

function render() {
  const body = $("bookerTableBody");
  if (!body) return;

  const list = liveRows().sort(
    (a, b) => Number(b.techCompletedAtMs || 0) - Number(a.techCompletedAtMs || 0),
  );
  updateCounts(list);

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="9">No Tech Done repair orders.</td></tr>`;
    return;
  }

  body.innerHTML = list
    .map((ro) => {
      const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
      return `
        <tr data-ro-id="${escapeHtml(ro.id)}">
          <td><b>${escapeHtml(ro.tagNumber || "")}</b></td>
          <td>${escapeHtml(ro.roNumber || "")}</td>
          <td>${escapeHtml(vehicle)}</td>
          <td>${escapeHtml(ro.advisorName || "")}</td>
          <td>${escapeHtml(ro.techName || "")}</td>
          <td>${escapeHtml(qcLabel(ro))}</td>
          <td class="action-cell">${bookingCell(isCpBooked(ro), "cp", "unbookCp", "CP")}</td>
          <td class="action-cell">${bookingCell(isWtyBooked(ro), "wty", "unbookWty", "WTY")}</td>
          <td class="action-cell">${renderQcActions(ro)}</td>
        </tr>`;
    })
    .join("");
}

async function onTableClick(event) {
  const button = event.target.closest("button[data-action]");
  const row = event.target.closest("tr[data-ro-id]");
  if (!button || !row) return;

  const roId = row.dataset.roId;
  const action = button.dataset.action;

  try {
    if (action === "cp") {
      await markCpBooked(roId);
      setMsg("CP booked.");
    }
    if (action === "unbookCp") {
      await clearCpBooked(roId);
      setMsg("CP unbooked.");
    }
    if (action === "wty") {
      await markWarrantyBooked(roId);
      setMsg("Warranty booked.");
    }
    if (action === "unbookWty") {
      await clearWarrantyBooked(roId);
      setMsg("Warranty unbooked.");
    }
    if (action === "requestQc") {
      await requestQc(roId);
      setMsg("QC requested. Wash can still take the car if QC is backed up.");
    }
    if (action === "noQc") {
      await markNoQcRequired(roId);
      setMsg("No QC required.");
    }
  } catch (error) {
    console.error(error);
    setMsg(error?.message || "Action failed.");
  }
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
