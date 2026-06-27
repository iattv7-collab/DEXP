// public/pages/operations/operations-page.js
// Dealer Operations dashboard with group-filtered live operations.

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { MODULES } from "/js/config/modules.js";
import { REQUEST_STATUS, watchDealerRequests } from "/js/services/firestore/requests-service.js";
import { getNotificationGroups } from "/js/services/firestore/notification-groups-service.js";
import { watchDealerNotifications } from "/js/services/firestore/notification-requests-service.js";

protectRoute({
  allowedModules: [MODULES.OPERATIONS],
});

const liveOperationsTabButton = document.getElementById(
  "liveOperationsTabButton",
);

const operationsHistoryTabButton = document.getElementById(
  "operationsHistoryTabButton",
);

const operationsGroupFilterRow = document.getElementById(
  "operationsGroupFilterRow",
);

const operationsSearchInput = document.getElementById(
  "operationsSearchInput",
);

const liveOperationsSection = document.getElementById("liveOperationsSection");

const operationsHistorySection = document.getElementById(
  "operationsHistorySection",
);

const liveOperationsTableBody = document.getElementById(
  "liveOperationsTableBody",
);

const operationsHistoryTableBody = document.getElementById(
  "operationsHistoryTableBody",
);

const LIVE_COMPLETED_WINDOW_MS = 2 * 60 * 60 * 1000;

let currentTab = "live";
let selectedGroupId = "all";

let notificationGroups = [];
let dealerRequests = [];
let dealerNotifications = [];
let searchText = "";

window.addEventListener("dexp-session-ready", () => {
  initializeOperationsPage();
});

async function initializeOperationsPage() {
  renderAppHeader({
    title: "Operations",
    showHome: true,
  });

  wireTabs();

  notificationGroups = await getNotificationGroups();

  selectedGroupId = getDefaultGroupId();

  renderGroupFilters();

  operationsSearchInput?.addEventListener("input", (event) => {
  searchText = event.target.value.trim().toLowerCase();

  renderOperations();
});

  watchDealerNotifications((notifications) => {
    dealerNotifications = notifications;
    renderOperations();
  });

  watchDealerRequests((requests) => {
    dealerRequests = requests;
    renderOperations();
  });
}

function wireTabs() {
  liveOperationsTabButton.addEventListener("click", () => {
    currentTab = "live";
    renderTabs();
  });

  operationsHistoryTabButton.addEventListener("click", () => {
    currentTab = "history";
    renderTabs();
  });

  renderTabs();
}

function renderTabs() {
  liveOperationsTabButton.classList.toggle("secondary", currentTab !== "live");

  operationsHistoryTabButton.classList.toggle(
    "secondary",
    currentTab !== "history",
  );

  liveOperationsSection.classList.toggle("hidden", currentTab !== "live");
  operationsHistorySection.classList.toggle("hidden", currentTab !== "history");

  renderOperations();
}

function getDefaultGroupId() {
  const session = getSession();

  if (session?.role === "platform-admin" || session?.role === "admin") {
    return "all";
  }

  const assignedGroup = notificationGroups.find((group) => {
    const memberUids = Array.isArray(group.memberUids) ? group.memberUids : [];

    return memberUids.includes(session?.uid);
  });

  return assignedGroup?.id || "all";
}

function canViewAllGroups() {
  const session = getSession();

  return session?.role === "platform-admin" || session?.role === "admin";
}

function renderGroupFilters() {
  const visibleGroups = getVisibleGroups();

  const allButton = canViewAllGroups()
    ? `
      <button
        type="button"
        class="small-button ${selectedGroupId === "all" ? "" : "secondary"} js-group-filter"
        data-group-id="all"
      >
        All
      </button>
    `
    : "";

  const groupButtons = visibleGroups
    .map((group) => {
      return `
        <button
          type="button"
          class="small-button ${selectedGroupId === group.id ? "" : "secondary"} js-group-filter"
          data-group-id="${escapeHtml(group.id)}"
        >
          ${escapeHtml(group.name || "Group")}
        </button>
      `;
    })
    .join("");

  operationsGroupFilterRow.innerHTML = `
    ${allButton}
    ${groupButtons}
  `;

  operationsGroupFilterRow
    .querySelectorAll(".js-group-filter")
    .forEach((button) => {
      button.addEventListener("click", () => {
        selectedGroupId = button.dataset.groupId || "all";

        renderGroupFilters();
        renderOperations();
      });
    });
}

function getVisibleGroups() {
  const session = getSession();

  if (canViewAllGroups()) {
    return notificationGroups;
  }

  return notificationGroups.filter((group) => {
    const memberUids = Array.isArray(group.memberUids) ? group.memberUids : [];

    return memberUids.includes(session?.uid);
  });
}

function renderOperations() {
  renderLiveOperations();
  renderHistoryOperations();
}

function renderLiveOperations() {
  const rows = getFilteredRequests().filter((request) => {
    if (request.status !== REQUEST_STATUS.COMPLETED) {
      return request.status !== REQUEST_STATUS.CANCELLED;
    }

    return isRecentlyCompleted(request);
  });

  if (!rows.length) {
    liveOperationsTableBody.innerHTML = `
      <tr>
        <td colspan="7">No live operations.</td>
      </tr>
    `;

    return;
  }

  liveOperationsTableBody.innerHTML = rows.map(renderLiveOperationRow).join("");
}

function renderHistoryOperations() {
  const rows = getFilteredRequests().filter((request) => {
    return (
      request.status === REQUEST_STATUS.COMPLETED &&
      !isRecentlyCompleted(request)
    );
  });

  if (!rows.length) {
    operationsHistoryTableBody.innerHTML = `
      <tr>
        <td colspan="6">No history for this view yet.</td>
      </tr>
    `;

    return;
  }

  operationsHistoryTableBody.innerHTML = rows.map(renderHistoryRow).join("");
}

function getFilteredRequests() {
  let rows =
    selectedGroupId === "all"
      ? [...dealerRequests]
      : dealerRequests.filter((request) => {
          return request.targetGroupId === selectedGroupId;
        });

  if (!searchText) {
    return rows;
  }

  return rows.filter((request) => {
    return (
      String(request.roNumber || "")
        .toLowerCase()
        .includes(searchText) ||
      String(request.tagNumber || "")
        .toLowerCase()
        .includes(searchText)
    );
  });
}

function renderLiveOperationRow(request) {
  const notification = getNotificationForRequest(request);

  return `
    <tr>
      <td data-label="Vehicle">${escapeHtml(formatVehicle(request))}</td>
      <td data-label="Operation">${escapeHtml(formatOperation(request))}</td>
      <td data-label="Status">${escapeHtml(formatStatus(request, notification))}</td>
      <td data-label="Target Group">${escapeHtml(
        request.targetGroupName || getGroupName(request.targetGroupId),
      )}</td>
      <td data-label="Opened By">${escapeHtml(notification?.openedByName || "")}</td>
      <td data-label="Started By">${escapeHtml(request.startedByName || "")}</td>
      <td data-label="Elapsed">${escapeHtml(formatElapsed(request))}</td>
    </tr>
  `;
}

function renderHistoryRow(request) {
  return `
    <tr>
      <td data-label="Vehicle">${escapeHtml(formatVehicle(request))}</td>
      <td data-label="Operation">${escapeHtml(formatOperation(request))}</td>
      <td data-label="Status">${escapeHtml(formatStatus(request))}</td>
      <td data-label="Target Group">${escapeHtml(
        request.targetGroupName || getGroupName(request.targetGroupId),
      )}</td>
      <td data-label="Completed By">${escapeHtml(
        request.completedByName || request.cancelledByName || "",
      )}</td>
      <td data-label="Completed At">${escapeHtml(
        formatDateTime(request.completedAtMs || request.cancelledAtMs),
      )}</td>
    </tr>
  `;
}

function getNotificationForRequest(request = {}) {
  if (!request.notificationRequestId) {
    return null;
  }

  return (
    dealerNotifications.find((notification) => {
      return notification.id === request.notificationRequestId;
    }) || null
  );
}

function isRecentlyCompleted(request = {}) {
  const completedAtMs = Number(request.completedAtMs || 0);

  if (!completedAtMs) {
    return false;
  }

  return Date.now() - completedAtMs < LIVE_COMPLETED_WINDOW_MS;
}

function formatVehicle(request = {}) {
  const tag = request.tagNumber ? `Tag ${request.tagNumber}` : "";
  const ro = request.roNumber ? `RO ${request.roNumber}` : "";

  return [tag, ro].filter(Boolean).join(" / ");
}

function formatOperation(request = {}) {
  return String(request.title || request.requestType || "")
    .replace(/\bRequest\b/gi, "")
    .replace(/_/g, " ")
    .trim();
}

function formatStatus(request = {}, notification = null) {
  if (request.status === REQUEST_STATUS.COMPLETED) {
    return "Completed";
  }

  if (request.status === REQUEST_STATUS.IN_PROGRESS) {
    return "In Progress";
  }

  if (notification?.openedBy) {
    return "Opened";
  }

  return "Waiting";
}

function formatElapsed(request = {}) {
  const startMs =
    request.startedAtMs ||
    request.createdAtMs ||
    request.completedAtMs ||
    request.cancelledAtMs;

  if (!startMs) {
    return "";
  }

  const elapsedMs = Math.max(Date.now() - Number(startMs), 0);
  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 1) {
    return "Now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getGroupName(groupId = "") {
  const group = notificationGroups.find((item) => item.id === groupId);

  return group?.name || groupId || "";
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}