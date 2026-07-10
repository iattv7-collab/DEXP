// public/pages/ro-tracker/ro-tracker-page.js

import { protectRoute } from "/js/core/router.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  watchDealerROs,
  watchAdvisorROs,
  watchROsByAdvisorId,
} from "/js/services/firestore/ros-service.js";

import { getSession } from "/js/core/session.js";

import {
  setROTrackerViewOwner,
  clearROTrackerViewOwner,
} from "/js/modules/ro-tracker/ro-tracker-view-context.js";

import { RO_TRACKER_COLUMNS } from "/js/modules/ro-tracker/ro-tracker-columns.js";

import { buildROTrackerRow } from "/js/modules/ro-tracker/ro-tracker-render.js";

import {
  getDefaultVisibleColumnKeys,
  getColumnsByKeys,
  loadROTrackerColumnSettings,
  saveROTrackerColumnSettings,
} from "/js/modules/ro-tracker/ro-tracker-settings.js";

import { setupROTrackerActions } from "/js/modules/ro-tracker/ro-tracker-actions.js";

import { openROTrackerSharingModal } from "/js/modules/ro-tracker-sharing/ro-tracker-sharing-ui.js?v=2";

import {
  watchSharedROTrackers,
  watchMyROTrackerSharing,
} from "/js/modules/ro-tracker-sharing/ro-tracker-sharing-service.js";

protectRoute();

const tableHead = document.getElementById("roTrackerTableHead");
const tableBody = document.getElementById("roTrackerTableBody");
const searchInput = document.getElementById("searchActive");
const columnSettingsButton = document.getElementById("btnColumnSettings");

let allRows = [];
let visibleColumnKeys = getDefaultVisibleColumnKeys();
let visibleColumns = getColumnsByKeys(visibleColumnKeys);
let currentTrackerOwnerId = null;
let stopWatchingROs = null;
let trackerViewLabel = null;
let sharingStatusLabel = null;
let shareButton = null;

window.addEventListener("dexp-session-ready", initializeROTracker);

async function initializeROTracker() {
  renderAppHeader({
    title: "RO Tracker",
  });

  visibleColumnKeys = await loadROTrackerColumnSettings();
  visibleColumns = getColumnsByKeys(visibleColumnKeys);

  buildColumns();

  setupROTrackerActions({
    tableBody,
    getROById,
    showMessage,
  });

  const session = getSession();

  currentTrackerOwnerId = session?.uid || null;

  buildTrackerTabs();

  startROTrackerWatch(session?.role === "advisor" ? session.uid : null);

  watchSharedROTrackers((shares) => {
    buildSharedTabs(shares);
  });

  watchMyROTrackerSharing((sharing) => {
    updateSharingStatusLabel(sharing);
  });

  searchInput?.addEventListener("input", handleSearch);
  columnSettingsButton?.addEventListener("click", openColumnSettingsModal);

  document.getElementById("btnArchiveView")?.addEventListener("click", () => {
    window.location.href = "/pages/archive/archive.html";
  });

  document.getElementById("btnFollowUp")?.addEventListener("click", () => {
    window.location.href = "/pages/ro-followup/index.html";
  });

  document.getElementById("btnSettings")?.addEventListener("click", () => {
    window.location.href = "/pages/ro-tracker-settings/index.html";
  });
}

function startROTrackerWatch(advisorId = null) {
  if (typeof stopWatchingROs === "function") {
    stopWatchingROs();
  }

  const session = getSession();

  if (session?.role === "advisor" && advisorId) {
    stopWatchingROs = watchROsByAdvisorId(advisorId, handleRowsSnapshot);
    return;
  }

  stopWatchingROs = watchDealerROs(handleRowsSnapshot);
}

function handleRowsSnapshot(rows) {
  allRows = Array.isArray(rows) ? rows : [];
  renderRows(getCurrentRows());
}

function setTrackerViewLabel(text) {
  if (!trackerViewLabel) {
    return;
  }

  trackerViewLabel.textContent = text;
}

function buildTrackerTabs() {
  const session = getSession();

  const pageTitleRow = document.querySelector(".page-title-row");

  if (!pageTitleRow) {
    return;
  }

  const existingTabs = document.getElementById("roTrackerTabs");

  if (existingTabs) {
    existingTabs.remove();
  }

  const existingLabel = document.getElementById("roTrackerViewLabel");

  if (existingLabel) {
    existingLabel.remove();
  }

  const tabsRow = document.createElement("div");

  tabsRow.id = "roTrackerTabs";
  tabsRow.style.display = "flex";
  tabsRow.style.gap = "10px";
  tabsRow.style.marginTop = "14px";
  tabsRow.style.flexWrap = "wrap";

  const myROsButton = document.createElement("button");

  myROsButton.type = "button";
  myROsButton.textContent = "My ROs";

  myROsButton.addEventListener("click", () => {
    currentTrackerOwnerId = session.uid;

    clearROTrackerViewOwner();

    startROTrackerWatch(session.uid);

    setTrackerViewLabel("");
  });

  tabsRow.appendChild(myROsButton);

  if (session?.role === "advisor") {
    shareButton = document.createElement("button");

    shareButton.type = "button";
    shareButton.textContent = "Share";

    shareButton.addEventListener("click", async () => {
      await openROTrackerSharingModal();
    });

    tabsRow.appendChild(shareButton);
  }

  trackerViewLabel = document.createElement("div");

  trackerViewLabel.id = "roTrackerViewLabel";
  trackerViewLabel.style.marginTop = "10px";
  trackerViewLabel.style.fontWeight = "bold";
  trackerViewLabel.style.color = "#0b3d91";
  trackerViewLabel.textContent = "";

  sharingStatusLabel = document.createElement("div");

  sharingStatusLabel.id = "roTrackerSharingStatusLabel";
  sharingStatusLabel.style.marginTop = "6px";
  sharingStatusLabel.style.fontWeight = "bold";
  sharingStatusLabel.style.color = "#8a5a00";
  sharingStatusLabel.textContent = "";

  pageTitleRow.after(tabsRow);
  tabsRow.after(trackerViewLabel);
  trackerViewLabel.after(sharingStatusLabel);
}

function buildSharedTabs(shares = []) {
  const tabsRow = document.getElementById("roTrackerTabs");

  if (!tabsRow) {
    return;
  }

  tabsRow.querySelectorAll(".shared-tracker-tab").forEach((button) => {
    button.remove();
  });

  shares.forEach((share) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "shared-tracker-tab";
    button.textContent = share.ownerAdvisorName || "Shared Tracker";

    button.addEventListener("click", () => {
      currentTrackerOwnerId = share.ownerAdvisorId;

      setROTrackerViewOwner({
        advisorId: share.ownerAdvisorId,
        advisorName: share.ownerAdvisorName || "",
        isSharedView: true,
      });

      startROTrackerWatch(share.ownerAdvisorId);

      setTrackerViewLabel(
        `Viewing: ${share.ownerAdvisorName || "Shared"} RO Tracker`,
      );
    });

    tabsRow.appendChild(button);
  });
}

function updateSharingStatusLabel(sharing) {
  if (!sharingStatusLabel) {
    return;
  }

  const sharedWithCompanyIds = Array.isArray(sharing?.sharedWithCompanyIds)
    ? sharing.sharedWithCompanyIds
    : [];

  if (sharedWithCompanyIds.length > 0) {
    sharingStatusLabel.textContent = "Sharing RO Tracker";

    if (shareButton) {
      shareButton.textContent = "Shared";
      shareButton.style.background = "#c47f00";
    }

    return;
  }

  sharingStatusLabel.textContent = "";

  if (shareButton) {
    shareButton.textContent = "Share";
    shareButton.style.background = "";
  }
}

function buildColumns() {
  tableHead.innerHTML = "";

  visibleColumns.forEach((column) => {
    const th = document.createElement("th");

    th.textContent = column.label;

    const columnClass = getROTrackerColumnClass(column.key);

    if (columnClass) {
      th.classList.add(columnClass);
    }

    tableHead.appendChild(th);
  });
}

function getROTrackerColumnClass(key) {
  const map = {
    roNumber: "col-ro",
    tagNumber: "col-tag",
    advisorCompanyId: "col-advisor",
    customerName: "col-customer",
    customerPhone: "col-phone",
    roDate: "col-date",
    promiseTime: "col-date",
    model: "col-model",
    concern: "col-concern",
    currentLocation: "col-location",
    readyCalled: "col-ready",
    notes: "col-notes",
    techVideo: "col-video",
    calledTime: "col-called",
    nextUpdateTime: "col-next",
    isWaiter: "col-wait",
    loanerVin: "col-loanerlast6",
    techDone: "col-repairdone",
    textSent: "col-text",
    actions: "col-archive",
  };

  return map[key] || "";
}

function renderRows(rows = []) {
  tableBody.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");

    const td = document.createElement("td");

    td.colSpan = visibleColumns.length || 1;

    td.textContent = "No repair orders found.";

    tr.appendChild(td);

    tableBody.appendChild(tr);

    return;
  }

  rows.forEach((ro) => {
    tableBody.appendChild(buildROTrackerRow(ro, visibleColumns));
  });
}

function handleSearch() {
  renderRows(getCurrentRows());
}

function openColumnSettingsModal() {
  const overlay = document.createElement("div");

  overlay.className = "ro-column-settings-overlay";

  const modal = document.createElement("div");

  modal.className = "ro-column-settings-modal";

  const title = document.createElement("h3");

  title.textContent = "RO Tracker Columns";

  const help = document.createElement("p");

  help.textContent = "Choose which columns you want to see in RO Tracker.";

  const list = document.createElement("div");

  list.className = "ro-column-settings-list";

  const checkboxRefs = [];

  RO_TRACKER_COLUMNS.forEach((column) => {
    const label = document.createElement("label");

    label.className = "ro-column-settings-option";

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";

    checkbox.value = column.key;

    checkbox.checked = visibleColumnKeys.includes(column.key);

    const span = document.createElement("span");

    span.textContent = column.label;

    label.appendChild(checkbox);

    label.appendChild(span);

    list.appendChild(label);

    checkboxRefs.push(checkbox);
  });

  const buttonRow = document.createElement("div");

  buttonRow.className = "ro-column-settings-actions";

  const cancelButton = document.createElement("button");

  cancelButton.type = "button";

  cancelButton.textContent = "Cancel";

  const saveButton = document.createElement("button");

  saveButton.type = "button";

  saveButton.textContent = "Save";

  cancelButton.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  saveButton.addEventListener("click", async () => {
    const selectedKeys = checkboxRefs
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value);

    if (!selectedKeys.length) {
      alert("Select at least one column.");
      return;
    }

    visibleColumnKeys = await saveROTrackerColumnSettings(selectedKeys);
    visibleColumns = getColumnsByKeys(visibleColumnKeys);

    buildColumns();
    renderRows(getCurrentRows());

    document.body.removeChild(overlay);
  });

  buttonRow.appendChild(cancelButton);
  buttonRow.appendChild(saveButton);

  modal.appendChild(title);
  modal.appendChild(help);
  modal.appendChild(list);
  modal.appendChild(buttonRow);

  overlay.appendChild(modal);

  document.body.appendChild(overlay);
}

function getCurrentRows() {
  const value = String(searchInput?.value || "")
    .trim()
    .toLowerCase();

  let rows = allRows;

  if (!value) {
    return rows;
  }

  return rows.filter((ro) => {
    return [
      ro.roNumber,
      ro.tagNumber,
      ro.customerName,
      ro.customerPhone,
      ro.model,
      ro.concern,
      ro.currentLocation,
      ro.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(value);
  });
}

function getROById(roId) {
  return allRows.find((ro) => {
    return ro.id === roId || ro.roNumber === roId;
  });
}

function showMessage(message = "") {
  return;
}
