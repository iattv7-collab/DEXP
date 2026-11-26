// public/pages/dispatch/dispatch-page.js
// New Dispatch module. Does not touch existing Operations.

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { MODULES } from "/js/config/modules.js";
import {
  REQUEST_STATUS,
  watchDealerRequests,
} from "/js/services/firestore/requests-service.js";
import { watchDealerNotifications } from "/js/services/firestore/notification-requests-service.js";
import { watchDealerROs } from "/js/services/firestore/ros-service.js";
import {
  initAppointmentsTab,
  syncAppointmentsTabContext,
} from "/js/modules/appointments/appointments-tab.js?v=5";

import {
  completeRequest,
  cancelRequest,
} from "/js/services/firestore/requests-service.js";
import {
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/services/firebase/firestore.js";

import { createNotificationRequest } from "/js/services/firestore/notification-requests-service.js";
import { pickDateTimeMs } from "/js/shared/date-time-picker.js";

protectRoute({
  allowedModules: [MODULES.OPERATIONS, MODULES.APPOINTMENTS, MODULES.DISPATCH],
});

const liveTabButton = document.getElementById("dispatchLiveTabButton");
const historyTabButton = document.getElementById("dispatchHistoryTabButton");
const appointmentsTabButton = document.getElementById("dispatchAppointmentsTabButton");

const liveSection = document.getElementById("dispatchLiveSection");
const historySection = document.getElementById("dispatchHistorySection");
const appointmentsSection = document.getElementById("operationsAppointmentsSection");

const liveTableBody = document.getElementById("dispatchLiveTableBody");
const historyTableBody = document.getElementById("dispatchHistoryTableBody");

const historyDayBtn = document.getElementById("dispatchHistoryDayBtn");
const historyDayLabel = document.getElementById("dispatchHistoryDayLabel");
const historyDayInput = document.getElementById("dispatchHistoryDayInput");

let historyDayMs = startOfToday();

let currentTab = "live";
let currentFilter = "all";

let dealerRequests = [];
let dealerNotifications = [];
let dealerROs = [];
let expandedRequestId = "";

window.addEventListener("dexp-session-ready", () => {
  initializeDispatchPage();
});

async function initializeDispatchPage() {
  renderAppHeader({
    title: "Dispatch",
    showHome: true,
  });

  wireTabs();
  wireFilters();

  watchDealerNotifications((notifications) => {
    dealerNotifications = notifications || [];
    render();
  });

  watchDealerRequests((requests) => {
    dealerRequests = requests || [];
    render();
  });

  watchDealerROs((rows) => {
    dealerROs = Array.isArray(rows) ? rows : [];
    render();
  });

  liveTableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    if (event.target.closest("button")) return;

    const id = row.dataset.id;
    expandedRequestId = expandedRequestId === id ? "" : id;
    renderLive();
  });

  liveTableBody.addEventListener("click", async (event) => {
    const finishBtn = event.target.closest(".js-force-finish");
    const cancelBtn = event.target.closest(".js-cancel");

    if (finishBtn) {
      event.stopPropagation();
      const id = finishBtn.dataset.id;
      if (!confirm("Force finish this request?")) return;
    try {
      await completeRequest(id);
      const session = getSession();
      await updateDoc(doc(db, "requests", id), {
        forceFinished: true,
        forceFinishedBy: session?.uid || "",
        forceFinishedByName: session?.displayName || session?.email || "",
        forceFinishedAtMs: Date.now(),
      });
    } catch (err) {
      alert(err?.message || "Could not finish.");
    }
      return;
    }

    if (cancelBtn) {
      event.stopPropagation();
      const id = cancelBtn.dataset.id;
      const request = dealerRequests.find((r) => r.id === id);
      if (!request) return;
      if (!confirm("Cancel this request?")) return;
      try {
        await cancelRequest(request);
      } catch (err) {
        alert(err?.message || "Could not cancel.");
      }
      return;
    }

  });

  historyTableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;

    const id = row.dataset.id;
    expandedRequestId = expandedRequestId === id ? "" : id;
    renderHistory();
  });

  historyDayBtn?.addEventListener("click", () => {
    if (!historyDayInput) return;
    const d = new Date(historyDayMs);
    historyDayInput.value =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    historyDayInput.showPicker?.();
  });

  historyDayInput?.addEventListener("change", () => {
    if (!historyDayInput.value) return;
    const [y, m, day] = historyDayInput.value.split("-").map(Number);
    historyDayMs = new Date(y, m - 1, day).getTime();
    updateHistoryDayButton();
    renderHistory();
  });

  updateHistoryDayButton();

  initAppointmentsTab({
    getDealerROs: () => dealerROs,
    getNotificationGroups: () => [],
  });
}

function wireTabs() {
  liveTabButton.addEventListener("click", () => {
    currentTab = "live";
    renderTabs();
  });

  historyTabButton.addEventListener("click", () => {
    currentTab = "history";
    renderTabs();
  });

  appointmentsTabButton.addEventListener("click", () => {
    currentTab = "appointments";
    renderTabs();
  });

  renderTabs();
}

function wireFilters() {
  document.querySelectorAll(".js-filter").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";
      document.querySelectorAll(".js-filter").forEach((b) => {
        b.classList.toggle("secondary", b !== button);
      });
      render();
    });
  });
}

function renderTabs() {
  liveTabButton.classList.toggle("secondary", currentTab !== "live");
  historyTabButton.classList.toggle("secondary", currentTab !== "history");
  appointmentsTabButton.classList.toggle("secondary", currentTab !== "appointments");

  liveSection.classList.toggle("hidden", currentTab !== "live");
  historySection.classList.toggle("hidden", currentTab !== "history");
  appointmentsSection.classList.toggle("hidden", currentTab !== "appointments");

  if (currentTab === "appointments") {
    syncAppointmentsTabContext({
      ros: dealerROs,
      groups: [],
    });
  }

  render();
}

function render() {
  if (currentTab === "live") {
    renderLive();
  } else if (currentTab === "history") {
    renderHistory();
  }
}


function renderLive() {
  let rows = dealerRequests.filter(isOpenLive);

  if (currentFilter === "unclaimed") {
    rows = rows.filter((r) => !getOwner(r));
  } else if (currentFilter === "overdue") {
    rows = rows.filter(isOverdue);
  }

  if (!rows.length) {
    liveTableBody.innerHTML = `<tr><td colspan="6">No live requests.</td></tr>`;
    return;
  }

  liveTableBody.innerHTML = rows.map(renderLiveRow).join("");
}

function renderLiveRow(request) {
  const owner = getOwner(request);
  const overdue = isOverdue(request);
  const rowClass = overdue
    ? "dispatch-row-overdue"
    : owner
    ? "dispatch-row-progress"
    : "dispatch-row-unclaimed";

  const expanded = expandedRequestId === request.id;
  const historyHtml = expanded ? renderRequestHistory(request) : "";

  return `
    <tr class="${rowClass}" data-id="${escapeHtml(request.id)}">
      <td>${escapeHtml(request.tagNumber || "")}<br><small>${escapeHtml(request.roNumber || "")}</small></td>
      <td>${escapeHtml(request.title || request.requestType || "")}</td>
      <td>${escapeHtml(request.requestedByName || "")}</td>
      <td>${escapeHtml(owner || "Unclaimed")}</td>
      <td>${escapeHtml(formatAge(request.createdAtMs))}</td>
      <td>${escapeHtml(overdue ? "Overdue" : owner ? "In Progress" : "Waiting")}</td>
      <td>
        <button type="button" class="small-button js-force-finish" data-id="${escapeHtml(request.id)}">Force Finish</button>
        <button type="button" class="small-button secondary js-cancel" data-id="${escapeHtml(request.id)}">Cancel</button>
      </td>
    </tr>
    ${historyHtml}
  `;
}

function renderRequestHistory(request) {
  const steps = [];

  if (request.createdAtMs) {
    steps.push(
      "Created by " +
        escapeHtml(request.requestedByName || "someone") +
        " at " +
        escapeHtml(formatDateTime(request.createdAtMs)),
    );
  }
  if (request.openedAtMs || request.openedByName) {
    steps.push(
      "Opened by " +
        escapeHtml(request.openedByName || "") +
        " at " +
        escapeHtml(formatDateTime(request.openedAtMs)),
    );
  }
  if (request.startedAtMs || request.startedByName) {
    steps.push(
      "Started by " +
        escapeHtml(request.startedByName || "") +
        " at " +
        escapeHtml(formatDateTime(request.startedAtMs)),
    );
  }
  if (request.completedAtMs || request.completedByName) {
    if (request.forceFinished) {
      steps.push(
        "Force finished by " +
          escapeHtml(request.forceFinishedByName || request.completedByName || "") +
          " at " +
          escapeHtml(formatDateTime(request.forceFinishedAtMs || request.completedAtMs)),
      );
    } else {
      steps.push(
        "Completed by " +
          escapeHtml(request.completedByName || "") +
          " at " +
          escapeHtml(formatDateTime(request.completedAtMs)),
      );
    }
  }
  if (request.cancelledAtMs || request.cancelledByName) {
    steps.push(
      "Cancelled by " +
        escapeHtml(request.cancelledByName || "") +
        " at " +
        escapeHtml(formatDateTime(request.cancelledAtMs)),
    );
  }
if (request.reopenedAtMs || request.reopenedByName) {
  steps.push(
    "Sent to valets by " +
      escapeHtml(request.reopenedByName || "Dispatch") +
      " at " +
      escapeHtml(formatDateTime(request.reopenedAtMs)) +
      " (marked overdue)",
  );
}

  if (!steps.length) {
    steps.push("No history yet.");
  }

  return (
    '<tr class="dispatch-history-row">' +
    '<td colspan="6" class="dispatch-history-panel">' +
    steps.map((s) => '<div class="step">' + s + "</div>").join("") +
    "</td></tr>"
  );
}

function renderHistory() {
  let rows = dealerRequests.filter(
    (r) =>
      r.status === REQUEST_STATUS.COMPLETED ||
      r.status === REQUEST_STATUS.CANCELLED,
  );

  const start = historyDayMs;
  const end = historyDayMs + 24 * 60 * 60 * 1000 - 1;

  rows = rows.filter((r) => {
    const t = r.completedAtMs || r.cancelledAtMs || r.createdAtMs || 0;
    return t >= start && t <= end;
  });

  if (!rows.length) {
    historyTableBody.innerHTML = `<tr><td colspan="7">No history for this day.</td></tr>`;
    return;
  }

  historyTableBody.innerHTML = rows.map(renderHistoryRow).join("");
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function updateHistoryDayButton() {
  if (!historyDayLabel) return;
  const today = startOfToday();
  historyDayLabel.textContent =
    historyDayMs === today ? "Today" : formatDateOnly(historyDayMs);
}

function formatDateOnly(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.getMonth() + 1 + "/" + d.getDate() + "/" + d.getFullYear();
}

function renderHistoryRow(request) {
  const expanded = expandedRequestId === request.id;
  const historyHtml = expanded ? renderRequestHistory(request) : "";

  return `
    <tr data-id="${escapeHtml(request.id)}">
      <td>${escapeHtml(request.tagNumber || "")}<br><small>${escapeHtml(request.roNumber || "")}</small></td>
      <td>${escapeHtml(request.title || request.requestType || "")}</td>
      <td>${escapeHtml(request.requestedByName || "")}</td>
      <td>${escapeHtml(request.completedByName || request.cancelledByName || "")}</td>
      <td>${escapeHtml(formatDateTime(request.completedAtMs || request.cancelledAtMs))}</td>
      <td>${escapeHtml(request.status || "")}</td>
      <td>
        <button type="button" class="small-button secondary js-unfinish" data-id="${escapeHtml(request.id)}">Send to Valets</button>
      </td>
    </tr>
    ${historyHtml}
  `;
}

function isOpenLive(request = {}) {
  if (request.status === REQUEST_STATUS.CANCELLED) return false;
  if (request.status === REQUEST_STATUS.COMPLETED) return false;
  const type = String(request.requestType || "").toLowerCase();
  if (type === "waiting_for_loaner") return false;
  return true;
}

function getOwner(request = {}) {
  return request.openedByName || request.startedByName || "";
}

function isAdvisorRequest(request = {}) {
  const by = String(request.requestedByRole || request.requestedByName || "").toLowerCase();
  return by.includes("advisor");
}

function isOverdue(request = {}) {
  return Boolean(request.overdue || request.reopened);
}

function formatAge(ms) {
  if (!ms) return "";
  const minutes = Math.floor((Date.now() - Number(ms)) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatDateTime(ms) {
  if (!ms) return "";
  try {
    return new Date(Number(ms)).toLocaleString();
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split('"').join("&quot;");
}