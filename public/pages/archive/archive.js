// public/pages/archive/archive.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";

import {
  watchArchivedROs,
  restoreArchivedRO
} from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";

protectRoute({
  allowedModules: [MODULES.ARCHIVE]
});

const tableHead = document.getElementById("archiveTableHead");
const archiveList = document.getElementById("archiveList");
const archiveSearchInput = document.getElementById("archiveSearchInput");

const ARCHIVE_COLUMNS = [
  { key: "roNumber", label: "RO #" },
  { key: "tagNumber", label: "Tag" },
  { key: "customerName", label: "Customer" },
  { key: "customerPhone", label: "Phone" },
  { key: "vehicle", label: "Vehicle" },
  { key: "advisorName", label: "Advisor" },
  { key: "archivedAtMs", label: "Archived" },
  { key: "archivedByName", label: "Archived By" },
  { key: "followupStatus", label: "Follow Up" },
  { key: "actions", label: "Actions" }
];

let archivedROs = [];
let unsubscribeArchivedROs = null;

window.addEventListener("dexp-session-ready", () => {
  initializeArchive();
});

function initializeArchive() {
  renderAppHeader({
    title: "Archive"
  });

  buildTableHead();

  archiveSearchInput.addEventListener("input", () => {
    renderArchiveRows(filterArchiveRows(archiveSearchInput.value));
  });

  archiveList.addEventListener("click", async (event) => {
    const restoreButton = event.target.closest(".js-restore-ro");

    if (!restoreButton) {
      return;
    }

    await handleRestoreRO(restoreButton.dataset.roId);
  });

  startArchiveListener();
}

function buildTableHead() {
  tableHead.innerHTML = ARCHIVE_COLUMNS
    .map((column) => {
      return `<th>${column.label}</th>`;
    })
    .join("");
}

function startArchiveListener() {
  archiveList.innerHTML = `
    <tr>
      <td colspan="${ARCHIVE_COLUMNS.length}">
        Loading archived ROs...
      </td>
    </tr>
  `;

  if (unsubscribeArchivedROs) {
    unsubscribeArchivedROs();
  }

  unsubscribeArchivedROs = watchArchivedROs((ros) => {
    archivedROs = Array.isArray(ros) ? ros : [];

    renderArchiveRows(filterArchiveRows(archiveSearchInput.value));
  });
}

function filterArchiveRows(searchValue = "") {
  const search = String(searchValue || "").trim().toLowerCase();

  if (!search) {
    return archivedROs;
  }

  return archivedROs.filter((ro) => {
    const text = [
      ro.roNumber,
      ro.tagNumber,
      ro.customerName,
      ro.customerPhone,
      ro.year,
      ro.make,
      ro.model,
      ro.color,
      ro.advisorName,
      ro.archivedByName,
      ro.archiveReason,
      ro.followupStatus
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search);
  });
}

function renderArchiveRows(rows = []) {
  if (!rows.length) {
    archiveList.innerHTML = `
      <tr>
        <td colspan="${ARCHIVE_COLUMNS.length}">
          No archived repair orders found.
        </td>
      </tr>
    `;

    return;
  }

  archiveList.innerHTML = rows
    .map((ro) => {
      return `
        <tr>
          ${ARCHIVE_COLUMNS.map((column) => {
            return `
              <td data-label="${column.label}">
                ${getColumnValue(ro, column)}
              </td>
            `;
          }).join("")}
        </tr>
      `;
    })
    .join("");
}

function getColumnValue(ro, column) {
  if (column.key === "vehicle") {
    return [
      ro.year,
      ro.make,
      ro.model,
      ro.color
    ].filter(Boolean).join(" ");
  }

  if (column.key === "archivedAtMs") {
    return formatDateTime(ro.archivedAtMs);
  }

  if (column.key === "followupStatus") {
    return ro.followupStatus || "";
  }

  if (column.key === "actions") {
    return `
      <button
        class="small-button secondary js-restore-ro"
        type="button"
        data-ro-id="${ro.id}"
      >
        Restore
      </button>
    `;
  }

  return ro[column.key] || "";
}

async function handleRestoreRO(roId) {
  if (!roId) {
    return;
  }

  const confirmed = confirm("Restore this RO back to active list?");

  if (!confirmed) {
    return;
  }

  await restoreArchivedRO(roId, {
    module: "archive"
  });
}

function formatDateTime(value) {
  const ms = Number(value || 0);

  if (!ms) {
    return "";
  }

  return new Date(ms).toLocaleString();
}