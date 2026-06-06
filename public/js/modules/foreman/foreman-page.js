// ======================================================
// FILE: /public/js/modules/foreman/foreman-page.js
// MODULE: Foreman
// PURPOSE:
// DEXP Shop Foreman page.
// Dispatch board for assigning techs and monitoring shop work.
// Reads from Master ROS.
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

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["foreman"] });

  renderAppHeader();

  session = await waitForSession();

  initializeTabs();
  initializeActions();
  listenToRos();

  try {
    await loadTechUsers();
  } catch (error) {
    console.error("Failed to load tech users:", error);
    techUsers = [];
  }
});

function initializeTabs() {
  const tabs = document.querySelectorAll(".foreman-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");

      const label = tab.textContent.toLowerCase();

      const cleanLabel = label.replace(/\(\d+\)/, "").trim();

      if (cleanLabel === "unassigned") activeTab = "unassigned";
      if (cleanLabel === "assigned") activeTab = "assigned";
      if (cleanLabel === "working") activeTab = "working";
      if (cleanLabel === "hold") activeTab = "hold";
      if (cleanLabel === "done") activeTab = "completed";

      render();
    });
  });
}

function listenToRos() {
  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
  );

  onSnapshot(q, (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    render();
  });
}

function render() {
  const body = document.getElementById("foremanTableBody");

  const filtered = rows
    .filter((ro) => getForemanStatus(ro) === activeTab)
    .sort(sortRows);

  body.innerHTML = filtered.length
    ? filtered.map(renderRow).join("")
    : `
      <tr>
        <td colspan="11">No vehicles in this view.</td>
      </tr>
    `;

  updateTabCounts();
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
      <td>${escapeHtml(ro.foremanNotes || "")}</td>
      <td>${renderAction(status)}</td>
    </tr>
  `;
}

function renderPriority(ro) {
  if (ro.isWaiter) {
    return `<span class="priority-badge waiter">WAITER</span>`;
  }

  if (isPastDue(ro)) {
    return `<span class="priority-badge waiter">PAST DUE</span>`;
  }

  if (isDueSoon(ro)) {
    return `<span class="priority-badge due">DUE SOON</span>`;
  }

  if (getForemanStatus(ro) === "hold") {
    return `<span class="priority-badge waiting">HOLD</span>`;
  }

  return "";
}

function renderAction(status) {
  if (status === "unassigned") {
    return `
      <button class="small-button" data-action="assignTech">
        Assign Tech
      </button>
    `;
  }

  if (status === "assigned" || status === "working") {
    return `
      <button class="small-button" data-action="reassignTech">
        Reassign
      </button>
    `;
  }

  if (status === "hold") {
    return `
      <button class="small-button" data-action="updateStatus">
        Update Status
      </button>
    `;
  }

  return "";
}

function getForemanStatus(ro) {
  const techStatus = String(ro.techStatus || "").toLowerCase();

  if (!ro.techId) {
    return "unassigned";
  }

  if (techStatus === "working") return "working";
  if (techStatus === "hold") return "hold";
  if (techStatus === "completed") return "completed";

  return "assigned";
}

function statusLabel(status) {
  if (status === "unassigned") return "Unassigned";
  if (status === "assigned") return "Assigned";
  if (status === "working") return "Working";
  if (status === "hold") return "Hold";
  if (status === "completed") return "Done";

  return status;
}

function sortRows(a, b) {
  if (!!b.isWaiter !== !!a.isWaiter) {
    return Number(!!b.isWaiter) - Number(!!a.isWaiter);
  }

  if (a.isWaiter && b.isWaiter) {
  const waiterDiff =
    getWaiterMs(a) - getWaiterMs(b);

  if (waiterDiff !== 0) {
    return waiterDiff;
  }
}

  const arrivalDiff = getArrivalMs(a) - getArrivalMs(b);

  if (arrivalDiff !== 0) {
    return arrivalDiff;
  }

  return getRoNumber(a) - getRoNumber(b);
}

function getWaiterMs(ro) {
  return Number(
    ro.waiterAtMs ||
      ro.waiterMarkedAtMs ||
      ro.arrivedAtMs ||
      ro.createdAtMs ||
      9999999999999,
  );
}

function getArrivalMs(ro) {
  return Number(
    ro.arrivedAtMs ||
      ro.createdAtMs ||
      ro.scannedAtMs ||
      ro.openedAtMs ||
      9999999999999,
  );
}

function getRoNumber(ro) {
  return Number(ro.roNumber || ro.ro || 999999999);
}

function getDueMs(ro) {
  return Number(
    ro.dueTimeMs || ro.promiseTimeMs || ro.nextUpdateTimeMs || 9999999999999,
  );
}

function formatDue(ro) {
  const ms = getDueMs(ro);

  if (ms === 9999999999999) {
    return "";
  }

  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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

function updateTabCounts() {
  const counts = {
    unassigned: 0,
    assigned: 0,
    working: 0,
    hold: 0,
    completed: 0,
  };

  rows.forEach((ro) => {
    const status = getForemanStatus(ro);

    if (counts[status] !== undefined) {
      counts[status] += 1;
    }
  });

  setTabText("unassigned", `Unassigned (${counts.unassigned})`);
  setTabText("assigned", `Assigned (${counts.assigned})`);
  setTabText("working", `Working (${counts.working})`);
  setTabText("hold", `Hold (${counts.hold})`);
  setTabText("done", `Done (${counts.completed})`);
}

function setTabText(match, text) {
  const tabs = Array.from(document.querySelectorAll(".foreman-tab"));

  const tab = tabs.find((item) => {
    const label = item.textContent
      .toLowerCase()
      .replace(/\(\d+\)/, "")
      .trim();

    return label === match;
  });

  if (tab) {
    tab.textContent = text;
  }
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

async function loadTechUsers() {
  const groups = await getAdminUserGroups();

  techUsers = groups.activeUsers.filter(
    (user) => user.role === "tech" && user.dealerId === session.dealerId,
  );

  console.log("Tech users loaded:", techUsers);
}

function initializeActions() {
  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    const row = event.target.closest("tr[data-ro-id]");

    if (!button || !row) return;

    const roId = row.dataset.roId;
    const action = button.dataset.action;

    if (action === "assignTech" || action === "reassignTech") {
      await assignTech(roId);
    }
  });
}

async function assignTech(roId) {
  if (!techUsers.length) {
    alert("No active tech users found for this dealer.");
    return;
  }

  const techList = techUsers
    .map((tech, index) => {
      const name = tech.displayName || tech.email || tech.id;
      return `${index + 1}. ${name}`;
    })
    .join("\n");

  const selected = prompt(`Select tech number:\n\n${techList}`);

  const index = Number(selected) - 1;
  const tech = techUsers[index];

  if (!tech) {
    alert("Invalid tech selection.");
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
}

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();

    if (existing?.dealerId) {
      resolve(existing);
      return;
    }

    window.addEventListener("dexp-session-ready", () => resolve(getSession()), {
      once: true,
    });
  });
}
