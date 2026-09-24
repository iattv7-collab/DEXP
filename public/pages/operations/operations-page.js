// public/pages/operations/operations-page.js
// Dealer Operations dashboard with group-filtered live operations.

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { MODULES } from "/js/config/modules.js";
import {
  REQUEST_STATUS,
  watchDealerRequests,
} from "/js/services/firestore/requests-service.js";
import { getNotificationGroups } from "/js/services/firestore/notification-groups-service.js";
import { watchDealerNotifications } from "/js/services/firestore/notification-requests-service.js";
import {
  watchDealerROs,
  updateRO,
} from "/js/services/firestore/ros-service.js";
import {
  initAppointmentsTab,
  syncAppointmentsTabContext,
  hasAppointmentsAccess,
} from "/js/modules/appointments/appointments-tab.js";

protectRoute({
  allowedModules: [MODULES.OPERATIONS, MODULES.APPOINTMENTS],
});

const liveOperationsTabButton = document.getElementById(
  "liveOperationsTabButton",
);

const operationsHistoryTabButton = document.getElementById(
  "operationsHistoryTabButton",
);

const operationsReadyTabButton = document.getElementById(
  "operationsReadyTabButton",
);

const operationsStatusTabButton = document.getElementById(
  "operationsStatusTabButton",
);

const operationsWashTabButton = document.getElementById(
  "operationsWashTabButton",
);

const operationsAppointmentsTabButton = document.getElementById(
  "operationsAppointmentsTabButton",
);

const operationsMoreButton = document.getElementById("operationsMoreButton");
const operationsMoreMenu = document.getElementById("operationsMoreMenu");
const operationsMoreWrap = document.getElementById("operationsMoreWrap");

const HIDDEN_LIVE_REQUEST_TYPES = new Set(["waiting_for_loaner"]);

const operationsGroupFilterRow = document.getElementById(
  "operationsGroupFilterRow",
);

const operationsSearchInput = document.getElementById("operationsSearchInput");

const liveOperationsSection = document.getElementById("liveOperationsSection");

const operationsHistorySection = document.getElementById(
  "operationsHistorySection",
);

const operationsReadySection = document.getElementById(
  "operationsReadySection",
);

const operationsStatusSection = document.getElementById(
  "operationsStatusSection",
);

const operationsWashSection = document.getElementById(
  "operationsWashSection",
);

const operationsAppointmentsSection = document.getElementById(
  "operationsAppointmentsSection",
);

const liveOperationsTableBody = document.getElementById(
  "liveOperationsTableBody",
);

const operationsHistoryTableBody = document.getElementById(
  "operationsHistoryTableBody",
);

const operationsReadyTableBody = document.getElementById(
  "operationsReadyTableBody",
);

const operationsStatusTableBody = document.getElementById(
  "operationsStatusTableBody",
);

const operationsWashTableBody = document.getElementById(
  "operationsWashTableBody",
);

const ACTIVE_WASH_STATUSES = new Set([
  "pending",
  "washing",
  "rewash_requested",
]);

const LIVE_COMPLETED_WINDOW_MS = 2 * 60 * 60 * 1000;

let currentTab = "live";
let selectedGroupId = "all";

let notificationGroups = [];
let dealerRequests = [];
let dealerNotifications = [];
let dealerROs = [];
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

  watchDealerROs((rows) => {
    dealerROs = Array.isArray(rows) ? rows : [];
    renderOperations();
  });

  initAppointmentsTab({
    getDealerROs: () => dealerROs,
    getNotificationGroups: () => notificationGroups,
  });

  if (window.location.hash === "#appointments" || onlyAppointmentsModule()) {
    currentTab = "appointments";
    renderTabs();
  }
}

function wireTabs() {
  liveOperationsTabButton.addEventListener("click", () => {
    currentTab = "live";
    closeMoreMenu();
    renderTabs();
  });

  operationsHistoryTabButton.addEventListener("click", () => {
    currentTab = "history";
    closeMoreMenu();
    renderTabs();
  });

  operationsReadyTabButton.addEventListener("click", () => {
    currentTab = "ready";
    closeMoreMenu();
    renderTabs();
  });

  operationsStatusTabButton.addEventListener("click", () => {
    currentTab = "status";
    closeMoreMenu();
    renderTabs();
  });

  operationsWashTabButton?.addEventListener("click", () => {
    currentTab = "wash";
    closeMoreMenu();
    renderTabs();
  });

  operationsAppointmentsTabButton?.addEventListener("click", () => {
    currentTab = "appointments";
    closeMoreMenu();
    renderTabs();
  });

  operationsMoreButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    operationsMoreMenu?.classList.toggle("hidden");
    operationsMoreButton.classList.toggle(
      "secondary",
      operationsMoreMenu?.classList.contains("hidden") &&
        currentTab !== "history" &&
        currentTab !== "ready" &&
        currentTab !== "status" &&
        currentTab !== "wash",
    );
  });

  document.addEventListener("click", (event) => {
    if (!operationsMoreWrap?.contains(event.target)) {
      closeMoreMenu();
    }
  });

  operationsReadyTableBody?.addEventListener("change", handleReadyPickupChange);

  renderTabs();
}

function renderTabs() {
  liveOperationsTabButton.classList.toggle("secondary", currentTab !== "live");

  operationsHistoryTabButton.classList.toggle(
    "secondary",
    currentTab !== "history",
  );

  operationsReadyTabButton.classList.toggle(
    "secondary",
    currentTab !== "ready",
  );

  operationsStatusTabButton.classList.toggle(
    "secondary",
    currentTab !== "status",
  );

  operationsWashTabButton?.classList.toggle(
    "secondary",
    currentTab !== "wash",
  );

  operationsAppointmentsTabButton?.classList.toggle(
    "secondary",
    currentTab !== "appointments",
  );

  const moreOpen =
    currentTab === "history" ||
    currentTab === "ready" ||
    currentTab === "status" ||
    currentTab === "wash";
  operationsMoreButton?.classList.toggle("secondary", !moreOpen);

  liveOperationsSection.classList.toggle("hidden", currentTab !== "live");
  operationsHistorySection.classList.toggle("hidden", currentTab !== "history");
  operationsReadySection.classList.toggle("hidden", currentTab !== "ready");
  operationsStatusSection.classList.toggle("hidden", currentTab !== "status");
  operationsWashSection?.classList.toggle("hidden", currentTab !== "wash");
  operationsAppointmentsSection?.classList.toggle(
    "hidden",
    currentTab !== "appointments",
  );

  if (operationsGroupFilterRow) {
    operationsGroupFilterRow.style.display =
      currentTab === "ready" ||
      currentTab === "status" ||
      currentTab === "wash" ||
      currentTab === "appointments"
        ? "none"
        : "";
  }

  if (onlyAppointmentsModule()) {
    liveOperationsTabButton?.classList.add("hidden");
    operationsHistoryTabButton?.classList.add("hidden");
    operationsReadyTabButton?.classList.add("hidden");
    operationsStatusTabButton?.classList.add("hidden");
    operationsWashTabButton?.classList.add("hidden");
    operationsMoreWrap?.classList.add("hidden");
  }

  renderOperations();
}

function getDefaultGroupId() {
  return "all";
}

function canViewAllGroups() {
  return true;
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
  renderReadyOperations();
  renderStatusOperations();
  renderWashQueue();
  syncAppointmentsTabContext({
    ros: dealerROs,
    groups: notificationGroups,
  });
}

function renderLiveOperations() {
  const rows = getFilteredRequests().filter((request) => {
    if (!isLiveValetRequest(request)) {
      return false;
    }

    if (request.status !== REQUEST_STATUS.COMPLETED) {
      return request.status !== REQUEST_STATUS.CANCELLED;
    }

    return isRecentlyCompleted(request);
  });

  if (!rows.length) {
    liveOperationsTableBody.innerHTML = `
      <tr>
        <td colspan="9">No live operations.</td>
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

function renderReadyOperations() {
  const rows = getReadyRows();

  if (!rows.length) {
    operationsReadyTableBody.innerHTML = `
      <tr>
        <td colspan="7">No vehicles ready for pickup.</td>
      </tr>
    `;
    return;
  }

  operationsReadyTableBody.innerHTML = rows.map(renderReadyRow).join("");
}

function getReadyRows() {
  let rows = dealerROs.filter((ro) => {
    const readyCalled = Boolean(
      ro.readyCalled ||
      String(ro.status || "").toLowerCase() === "ready called",
    );

    return readyCalled && !ro.pickedUpAtMs;
  });

  if (!searchText) {
    return rows;
  }

  return rows.filter((ro) => {
    return matchesROSearch(ro);
  });
}

function renderReadyRow(ro) {
  const roId = escapeHtml(ro.id || ro.roNumber || "");

  return `
    <tr>
      <td>${escapeHtml(ro.roNumber || "")}</td>
      <td>${escapeHtml(ro.tagNumber || "")}</td>
      <td>${escapeHtml(ro.customerName || "")}</td>
      <td>${escapeHtml(ro.model || "")}</td>
      <td>${escapeHtml(ro.currentLocation || ro.location || "")}</td>
      <td>${escapeHtml(formatDateTime(ro.readyCalledAtMs))}</td>
      <td>
        <label>
          <input
            type="checkbox"
            class="js-ready-picked-up"
            data-ro-id="${roId}"
          />
          Picked up
        </label>
      </td>
    </tr>
  `;
}

function renderStatusOperations() {
  if (!searchText) {
    operationsStatusTableBody.innerHTML = `
      <tr>
        <td colspan="9">Enter an RO or tag to see vehicle status.</td>
      </tr>
    `;
    return;
  }

  const rows = dealerROs.filter((ro) => matchesROSearch(ro));

  if (!rows.length) {
    operationsStatusTableBody.innerHTML = `
      <tr>
        <td colspan="9">No active RO matches that search.</td>
      </tr>
    `;
    return;
  }

  operationsStatusTableBody.innerHTML = rows.map(renderStatusRow).join("");
}

function renderStatusRow(ro) {
  const readyCalled = Boolean(
    ro.readyCalled || String(ro.status || "").toLowerCase() === "ready called",
  );

  const techDone = Boolean(ro.repairCompleted || ro.techDone);

  return `
    <tr>
      <td>${escapeHtml(ro.roNumber || "")}</td>
      <td>${escapeHtml(ro.tagNumber || "")}</td>
      <td>${escapeHtml(ro.customerName || "")}</td>
      <td>${escapeHtml(ro.model || "")}</td>
      <td>${escapeHtml(ro.currentLocation || ro.location || "")}</td>
      <td>${escapeHtml(formatWashStatus(ro))}</td>
      <td>${techDone ? "Yes" : ""}</td>
      <td>${readyCalled
      ? escapeHtml(formatDateTime(ro.readyCalledAtMs) || "Yes")
      : ""
    }</td>
      <td>${ro.pickedUpAtMs ? escapeHtml(formatDateTime(ro.pickedUpAtMs)) : ""
    }</td>
    </tr>
  `;
}

function formatWashStatus(ro = {}) {
  const status = String(ro.washStatus || "")
    .trim()
    .toLowerCase();

  if (!status || status === "none") {
    return "";
  }

  if (status === "pending") {
    return "In queue";
  }

  if (status === "washing") {
    return "Washing";
  }

  if (status === "rewash_requested") {
    return "Rewash";
  }

  if (status === "done" || status === "completed") {
    return "Wash done";
  }

  return ro.washStatus || "";
}

function renderWashQueue() {
  if (!operationsWashTableBody) return;

  const rows = getWashQueueRows();

  if (!rows.length) {
    operationsWashTableBody.innerHTML = `
      <tr>
        <td colspan="9">No cars in wash.</td>
      </tr>
    `;
    return;
  }

  operationsWashTableBody.innerHTML = rows.map(renderWashQueueRow).join("");
}

function getWashQueueRows() {
  let rows = dealerROs.filter((ro) => {
    const status = String(ro.washStatus || "").trim().toLowerCase();
    if (!ACTIVE_WASH_STATUSES.has(status)) return false;
    if (ro.pickedUpAtMs) return false;
    return true;
  });

  if (searchText) {
    rows = rows.filter((ro) => matchesROSearch(ro));
  }

  return rows.sort((a, b) => {
    const aNeed = Number(a.needByAtMs || 0);
    const bNeed = Number(b.needByAtMs || 0);
    if (aNeed && bNeed && aNeed !== bNeed) return aNeed - bNeed;
    if (aNeed && !bNeed) return -1;
    if (!aNeed && bNeed) return 1;
    return String(a.roNumber || "").localeCompare(String(b.roNumber || ""));
  });
}

function renderWashQueueRow(ro = {}) {
  const courtesy = String(ro.sourceType || "").toLowerCase() === "courtesy";
  const waiter = Boolean(ro.advisorWaiter || ro.customerWaiting || ro.isWaiter);
  const needBy = Number(ro.needByAtMs || 0);
  const projected = Number(ro.projectedFinishAtMs || 0);
  const late = Boolean(needBy && projected && projected > needBy);
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ") || ro.model || "";

  return `
    <tr class="${late ? "ops-wash-late" : ""}">
      <td>${escapeHtml(ro.roNumber || "")}</td>
      <td>${escapeHtml(ro.tagNumber || ro.tag || "")}</td>
      <td>${escapeHtml(vehicle)}</td>
      <td>${escapeHtml(ro.advisorName || "")}</td>
      <td>${courtesy ? "Courtesy" : "RO"}</td>
      <td>${escapeHtml(formatWashStatus(ro))}</td>
      <td>${waiter ? "Waiter" : ""}</td>
      <td>${escapeHtml(needBy ? formatDateTime(needBy) : "")}</td>
      <td>${escapeHtml(projected ? formatDateTime(projected) : "")}</td>
    </tr>
  `;
}

function matchesROSearch(ro = {}) {
  if (!searchText) {
    return false;
  }

  return (
    String(ro.roNumber || "")
      .toLowerCase()
      .includes(searchText) ||
    String(ro.tagNumber || "")
      .toLowerCase()
      .includes(searchText)
  );
}

async function handleReadyPickupChange(event) {
  const checkbox = event.target.closest(".js-ready-picked-up");

  if (!checkbox) {
    return;
  }

  const roId = checkbox.dataset.roId;
  const session = getSession();
  const checked = Boolean(checkbox.checked);

  if (!roId) {
    return;
  }

  checkbox.disabled = true;

  try {
    await updateRO(
      roId,
      {
        pickedUpAtMs: checked ? Date.now() : null,
        pickedUpBy: checked ? session?.uid || "" : null,
        pickedUpByName: checked ? session?.displayName || "" : null,
        pickedUpByRole: checked ? session?.role || "" : null,
      },
      {
        module: "operations",
        eventType: "picked_up_updated",
        message: checked ? "Customer picked up" : "Picked up cleared",
      },
    );
  } catch (error) {
    checkbox.checked = !checked;
    alert(error?.message || "Could not update picked up.");
  } finally {
    checkbox.disabled = false;
  }
}

function closeMoreMenu() {
  operationsMoreMenu?.classList.add("hidden");
}

function isLiveValetRequest(request = {}) {
  const type = String(request.requestType || "").toLowerCase();
  const title = String(request.title || "").toLowerCase();
  if (HIDDEN_LIVE_REQUEST_TYPES.has(type)) return false;
  if (title.startsWith("waiting for loaner")) return false;
  return true;
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
  const rowClass = getLiveRowStatusClass(request, notification);

  return `
    <tr class="${rowClass}">
      <td data-label="Vehicle">${escapeHtml(formatVehicle(request))}</td>
      <td data-label="Operation">${escapeHtml(formatOperation(request))}</td>
      <td data-label="Requested By">${escapeHtml(
    formatPersonWithTime(request.requestedByName, request.createdAtMs),
  )}</td>
      <td data-label="Status">${escapeHtml(formatStatus(request, notification))}</td>
      <td data-label="Target Group">${escapeHtml(
    request.targetGroupName || getGroupName(request.targetGroupId),
  )}</td>
      <td data-label="Opened By">${escapeHtml(
    formatPersonWithTime(
      notification?.openedByName,
      notification?.openedAtMs,
    ),
  )}</td>
      <td data-label="Started By">${escapeHtml(
    formatPersonWithTime(request.startedByName, request.startedAtMs),
  )}</td>
      <td data-label="Completed By">${escapeHtml(
    formatPersonWithTime(
      request.completedByName || request.cancelledByName,
      request.completedAtMs || request.cancelledAtMs,
    ),
  )}</td>
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
    formatPersonWithTime(
      request.completedByName || request.cancelledByName,
      request.completedAtMs || request.cancelledAtMs,
    ),
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

function getLiveRowStatusClass(request = {}, notification = null) {
  if (request.status === REQUEST_STATUS.COMPLETED) {
    return "ops-completed";
  }

  if (request.status === REQUEST_STATUS.IN_PROGRESS) {
    return "ops-in-progress";
  }

  if (notification?.openedBy) {
    return "ops-opened";
  }

  return "ops-waiting";
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

  return date.toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPersonWithTime(name, timeMs) {
  if (!name) {
    return "";
  }

  if (!timeMs) {
    return name;
  }

  const date = new Date(timeMs);
  const today = new Date();

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) {
    return `${name} • ${time}`;
  }

  const shortDate = date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });

  return `${name} • ${shortDate}, ${time}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function onlyAppointmentsModule() {
  const session = getSession();
  const modules = Array.isArray(session?.modules) ? session.modules : [];
  return (
    hasAppointmentsAccess() &&
    modules.includes(MODULES.APPOINTMENTS) &&
    !modules.includes(MODULES.OPERATIONS) &&
    session?.role !== "admin" &&
    session?.role !== "platform-admin"
  );
}
