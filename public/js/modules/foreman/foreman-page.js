// ======================================================
// FILE: /public/js/modules/foreman/foreman-page.js
// MODULE: Foreman
// PURPOSE: Dispatch board — assign techs, watch shop work.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { getAdminUserGroups } from "/js/services/firestore/users-service.js";
import { db } from "/js/services/firebase/firestore.js";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let session = null;
let rows = [];
let techUsers = [];
let activeTab = "unassigned";
let searchText = "";
let extraFilter = "";

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["foreman"] });
  renderAppHeader();
  session = await waitForSession();

  initializeTabs();
  initializeFilters();
  initializeActions();
  listenToRos();

  try {
    await loadTechUsers();
  } catch (error) {
    console.error("Failed to load tech users:", error);
    techUsers = [];
    setMsg("Could not load tech users.");
  }
});

function initializeTabs() {
  document.getElementById("foremanTabs").addEventListener("click", (event) => {
    const tab = event.target.closest("button[data-tab]");
    if (!tab) return;

    activeTab = tab.dataset.tab;
    document
      .querySelectorAll("#foremanTabs button[data-tab]")
      .forEach((item) => item.classList.toggle("active", item.dataset.tab === activeTab));
    render();
  });
}

function initializeFilters() {
  document.getElementById("foremanSearchInput").addEventListener("input", (event) => {
    searchText = String(event.target.value || "").trim().toLowerCase();
    render();
  });

  ["waitersFilterBtn", "pastDueFilterBtn", "dueSoonFilterBtn"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (event) => {
      const next = event.currentTarget.dataset.filter;
      extraFilter = extraFilter === next ? "" : next;
      ["waitersFilterBtn", "pastDueFilterBtn", "dueSoonFilterBtn"].forEach((btnId) => {
        document.getElementById(btnId).classList.toggle("active", extraFilter === document.getElementById(btnId).dataset.filter);
      });
      render();
    });
  });
}

function listenToRos() {
  const q = query(collection(db, "ros"), where("dealerId", "==", session.dealerId));

  onSnapshot(q, (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    render();
  });
}

function isPickedUp(ro) {
  return Boolean(
    ro.pickedUp === true ||
      ro.pickedUpAtMs ||
      String(ro.pickupStatus || "").toLowerCase() === "picked_up",
  );
}

function matchesSearch(ro) {
  if (!searchText) return true;
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const hay = [ro.tagNumber, ro.roNumber, vehicle, ro.advisorName, ro.techName]
    .join(" ")
    .toLowerCase();
  return hay.includes(searchText);
}

function matchesExtraFilter(ro) {
  if (!extraFilter) return true;
  if (extraFilter === "waiters") return Boolean(ro.isWaiter);
  if (extraFilter === "pastDue") return isPastDue(ro);
  if (extraFilter === "dueSoon") return isDueSoon(ro);
  return true;
}

function render() {
  const body = document.getElementById("foremanTableBody");

  const counts = {
    unassigned: 0,
    assigned: 0,
    working: 0,
    hold: 0,
    parked: 0,
    completed: 0,
  };

  rows.forEach((ro) => {
    const status = getForemanStatus(ro);
    if (status !== "completed" && isPickedUp(ro)) return;
    if (counts[status] !== undefined) counts[status] += 1;
  });

  setTabText("unassigned", `Unassigned (${counts.unassigned})`);
  setTabText("assigned", `Assigned (${counts.assigned})`);
  setTabText("working", `Working (${counts.working})`);
  setTabText("hold", `Hold (${counts.hold})`);
  setTabText("parked", `Parked (${counts.parked})`);
  setTabText("completed", `Done (${counts.completed})`);

  const filtered = rows
    .filter((ro) => getForemanStatus(ro) === activeTab)
    .filter((ro) => activeTab === "completed" || !isPickedUp(ro))
    .filter(matchesSearch)
    .filter(matchesExtraFilter)
    .sort(sortRows);

  body.innerHTML = filtered.length
    ? filtered.map(renderRow).join("")
    : `<tr><td colspan="10">No vehicles in this view.</td></tr>`;
}

function renderRow(ro) {
  const status = getForemanStatus(ro);
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");

  return `
    <tr data-ro-id="${escapeHtml(ro.id)}">
      <td>${renderPriority(ro)}</td>
      <td>${escapeHtml(formatDue(ro))}</td>
      <td>${escapeHtml(ro.roNumber || "")}</td>
      <td>${escapeHtml(ro.tagNumber || "")}</td>
      <td>${escapeHtml(vehicle)}</td>
      <td>${escapeHtml(ro.advisorName || "")}</td>
      <td>${escapeHtml(ro.techName || "Unassigned")}</td>
      <td>${escapeHtml(statusLabel(status))}</td>
      <td>${escapeHtml(ro.techNotes || "")}</td>
      <td>${renderAction(ro, status)}</td>
    </tr>
  `;
}

function renderPriority(ro) {
  if (ro.isWaiter) return `<span class="priority-badge waiter">WAITER</span>`;
  if (isPastDue(ro)) return `<span class="priority-badge waiter">PAST DUE</span>`;
  if (isDueSoon(ro)) return `<span class="priority-badge due">DUE SOON</span>`;
  return "";
}

function renderAction(ro, status) {
  if (status === "completed") return "";

  const options = [
    `<option value="">Select tech</option>`,
    ...techUsers.map((tech) => {
      const id = tech.uid || tech.id;
      const name = tech.displayName || tech.email || id;
      const selected = String(ro.techId || "") === String(id) ? "selected" : "";
      return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(name)}</option>`;
    }),
  ].join("");

  const label = ro.techId ? "Reassign" : "Assign";

  return `
    <select data-role="techSelect">${options}</select>
    <button type="button" class="small-button" data-action="assignTech">${label}</button>
  `;
}

function getForemanStatus(ro) {
  const techStatus = String(ro.techStatus || "").toLowerCase();

  if (!ro.techId) return "unassigned";
  if (techStatus === "working") return "working";
  if (techStatus === "hold") return "hold";
  if (techStatus === "parked") return "parked";
  if (techStatus === "completed") return "completed";
  return "assigned";
}

function statusLabel(status) {
  if (status === "unassigned") return "Unassigned";
  if (status === "assigned") return "Assigned";
  if (status === "working") return "Working";
  if (status === "hold") return "Hold";
  if (status === "parked") return "Parked";
  if (status === "completed") return "Done";
  return status;
}

function sortRows(a, b) {
  if (!!b.isWaiter !== !!a.isWaiter) {
    return Number(!!b.isWaiter) - Number(!!a.isWaiter);
  }

  if (a.isWaiter && b.isWaiter) {
    const waiterDiff = getWaiterMs(a) - getWaiterMs(b);
    if (waiterDiff !== 0) return waiterDiff;
  }

  const arrivalDiff = getArrivalMs(a) - getArrivalMs(b);
  if (arrivalDiff !== 0) return arrivalDiff;
  return getRoNumber(a) - getRoNumber(b);
}

function getWaiterMs(ro) {
  return Number(ro.waiterAtMs || ro.waiterMarkedAtMs || ro.arrivedAtMs || ro.createdAtMs || 9999999999999);
}

function getArrivalMs(ro) {
  return Number(ro.arrivedAtMs || ro.createdAtMs || ro.scannedAtMs || ro.openedAtMs || 9999999999999);
}

function getRoNumber(ro) {
  return Number(ro.roNumber || ro.ro || 999999999);
}

function getDueMs(ro) {
  return Number(ro.dueTimeMs || ro.promiseTimeMs || ro.nextUpdateTimeMs || 9999999999999);
}

function formatDue(ro) {
  const ms = getDueMs(ro);
  if (ms === 9999999999999) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isPastDue(ro) {
  const ms = getDueMs(ro);
  return ms !== 9999999999999 && ms < Date.now();
}

function isDueSoon(ro) {
  const ms = getDueMs(ro);
  const oneHour = 60 * 60 * 1000;
  return ms !== 9999999999999 && ms >= Date.now() && ms <= Date.now() + oneHour;
}

function setTabText(match, text) {
  const tab = document.querySelector(`#foremanTabs button[data-tab="${match}"]`);
  if (tab) tab.textContent = text;
}

function setMsg(text) {
  const el = document.getElementById("msg");
  if (el) el.textContent = text || "";
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

async function loadTechUsers() {
  const groups = await getAdminUserGroups();
  techUsers = groups.activeUsers.filter(
    (user) => user.role === "tech" && user.dealerId === session.dealerId,
  );
}

function initializeActions() {
  document.getElementById("foremanTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    const row = event.target.closest("tr[data-ro-id]");
    if (!button || !row) return;

    if (button.dataset.action === "assignTech") {
      const select = row.querySelector("select[data-role='techSelect']");
      await assignTech(row.dataset.roId, select?.value);
    }
  });
}

async function assignTech(roId, techId) {
  if (!techUsers.length) {
    setMsg("No active tech users found for this dealer.");
    return;
  }

  const tech = techUsers.find((item) => String(item.uid || item.id) === String(techId));
  if (!tech) {
    setMsg("Select a tech first.");
    return;
  }

  await updateDoc(doc(db, "ros", roId), {
    techId: tech.uid || tech.id,
    techName: tech.displayName || tech.email || "",
    techStatus: "assigned",
    assignedTechAtMs: Date.now(),
    assignedTechBy: session.uid,
    assignedTechByName: session.displayName || session.email || "",
    updatedAt: serverTimestamp(),
    updatedBy: session.uid,
  });

  await addDoc(collection(db, "ros", roId, "activityLog"), {
    type: "tech_assigned",
    module: "foreman",
    techId: tech.uid || tech.id,
    techName: tech.displayName || tech.email || "",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    createdBy: session.uid,
    createdByName: session.displayName || session.email || "",
  });

  setMsg(`Assigned to ${tech.displayName || tech.email || "tech"}.`);
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
