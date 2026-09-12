// ======================================================
// FILE: /public/js/modules/qc/qc-page.js
// MODULE: QC
// PURPOSE:
// DEXP QC work queue.
// Shows active QC tickets, allows QC to start/complete,
// and shows completed QC work for today.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  startQc,
  releaseQc,
  markQcComplete,
  reopenQc,
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
  protectRoute({ allowedModules: ["qc"] });
  renderAppHeader();
  session = await waitForSession();

  $("qcTableBody").addEventListener("click", onTableClick);
  $("qcSearchInput").addEventListener("input", (event) => {
    searchText = String(event.target.value || "").trim().toLowerCase();
    render();
  });

  listenToQcRos();
});

function listenToQcRos() {
  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
    where("qcRequired", "==", true),
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

function statusLabel(ro) {
  const status = qcStatus(ro);
  if (status === "requested") return "Requested";
  if (status === "working") return "Working";
  if (status === "complete") return "Done";
  return status || "";
}

function isToday(ms) {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isActive(ro) {
  const status = qcStatus(ro);
  return status === "requested" || status === "working";
}

function isDoneToday(ro) {
  return qcStatus(ro) === "complete" && isToday(ro.qcDoneAtMs);
}

function matchesSearch(ro) {
  if (!searchText) return true;
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const hay = [ro.tagNumber, ro.roNumber, vehicle, ro.advisorName]
    .join(" ")
    .toLowerCase();
  return hay.includes(searchText);
}

function liveRows() {
  return rows.filter((ro) => {
    if (isArchived(ro) || isPickedUp(ro)) return false;
    if (!isActive(ro) && !isDoneToday(ro)) return false;
    return matchesSearch(ro);
  });
}

function fmtTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString([], {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function setMsg(text) {
  const el = $("msg");
  if (el) el.textContent = text || "";
}

function updateCounts(list) {
  const tabs = $("qcTabs");
  if (!tabs) return;

  const counts = {
    active: list.filter(isActive).length,
    done: list.filter(isDoneToday).length,
  };
  const labels = { active: "Active", done: "Done today" };

  tabs.querySelectorAll("button[data-tab]").forEach((tab) => {
    const key = tab.dataset.tab;
    const count = counts[key] || 0;
    tab.textContent = `${labels[key]} (${count})`;
    tab.disabled = true;
    tab.classList.toggle("has-rows", count > 0);
    tab.classList.toggle("active", count > 0);
  });
}

function renderActions(ro) {
  const status = qcStatus(ro);
  const startOn = status === "requested";
  const workOn = status === "working";
  const reopenOn = status === "complete";

  return `
    <button type="button" class="small-button" data-action="start" ${startOn ? "" : "disabled"}>Start QC</button>
    <button type="button" class="small-button" data-action="release" ${workOn ? "" : "disabled"}>Release</button>
    <button type="button" class="small-button" data-action="complete" ${workOn ? "" : "disabled"}>Complete QC</button>
    <button type="button" class="small-button" data-action="reopen" ${reopenOn ? "" : "disabled"}>Reopen</button>
  `;
}

function sortRows(list) {
  const rank = (ro) => {
    const status = qcStatus(ro);
    if (status === "working") return 0;
    if (status === "requested") return 1;
    return 2;
  };

  return [...list].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;

    if (qcStatus(a) === "complete") {
      return Number(b.qcDoneAtMs || 0) - Number(a.qcDoneAtMs || 0);
    }

    return Number(a.qcRequestedAtMs || 0) - Number(b.qcRequestedAtMs || 0);
  });
}

function render() {
  const body = $("qcTableBody");
  if (!body) return;

  const list = sortRows(liveRows());
  updateCounts(list);

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="9">No QC jobs.</td></tr>`;
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
          <td>${escapeHtml(statusLabel(ro))}</td>
          <td>${escapeHtml(fmtTime(ro.qcRequestedAtMs))}</td>
          <td>${escapeHtml(fmtTime(ro.qcStartedAtMs))}</td>
          <td>${escapeHtml(fmtTime(ro.qcDoneAtMs))}</td>
          <td class="action-cell">${renderActions(ro)}</td>
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
    if (action === "start") {
      await startQc(roId);
      setMsg("QC started.");
    }
    if (action === "release") {
      await releaseQc(roId);
      setMsg("Released back to requested.");
    }
    if (action === "complete") {
      await markQcComplete(roId);
      setMsg("QC complete.");
    }
    if (action === "reopen") {
      await reopenQc(roId);
      setMsg("QC reopened.");
    }
  } catch (error) {
    console.error(error);
    setMsg(error?.message || "QC action failed.");
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

