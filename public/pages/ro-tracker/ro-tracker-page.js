// public/pages/ro-tracker/ro-tracker-page.js

import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  watchDealerROs,
  watchAdvisorROs,
} from "/js/services/firestore/ros-service.js";

import { getSession } from "/js/core/session.js";

import { RO_TRACKER_COLUMNS } from "/js/modules/ro-tracker/ro-tracker-columns.js";

import { buildROTrackerRow } from "/js/modules/ro-tracker/ro-tracker-render.js";

import {
  getDefaultVisibleColumnKeys,
  getColumnsByKeys,
  loadROTrackerColumnSettings,
  saveROTrackerColumnSettings,
} from "/js/modules/ro-tracker/ro-tracker-settings.js";

import { setupROTrackerActions } from "/js/modules/ro-tracker/ro-tracker-actions.js";

protectRoute();

const tableHead = document.getElementById("roTrackerTableHead");
const tableBody = document.getElementById("roTrackerTableBody");
const searchInput = document.getElementById("searchActive");
const columnSettingsButton = document.getElementById("btnColumnSettings");

let allRows = [];
let visibleColumnKeys = getDefaultVisibleColumnKeys();
let visibleColumns = getColumnsByKeys(visibleColumnKeys);

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

  const watchFunction =
    session?.role === "advisor" ? watchAdvisorROs : watchDealerROs;

  watchFunction((rows) => {
    allRows = Array.isArray(rows) ? rows : [];
    renderRows(getCurrentRows());
  });

  searchInput?.addEventListener("input", handleSearch);
  columnSettingsButton?.addEventListener("click", openColumnSettingsModal);
}

function buildColumns() {
  tableHead.innerHTML = "";

  visibleColumns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.label;
    tableHead.appendChild(th);
  });
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

  if (!value) {
    return allRows;
  }

  return allRows.filter((ro) => {
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
