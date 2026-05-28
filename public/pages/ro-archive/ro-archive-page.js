// public/pages/ro-archive/ro-archive-page.js

import { protectRoute } from "/js/core/router.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  watchArchivedROs,
  restoreArchivedRO,
} from "/js/services/firestore/ros-service.js";

import { getSession } from "/js/core/session.js";

protectRoute();

const tableBody = document.getElementById("roArchiveTableBody");

const searchInput = document.getElementById("searchArchive");

const backButton = document.getElementById("btnBackToROTracker");

let allRows = [];

window.addEventListener("dexp-session-ready", initializePage);

async function initializePage() {
  renderAppHeader({
    title: "RO Archive",
  });

  backButton?.addEventListener("click", () => {
    window.location.href = "/pages/ro-tracker/index.html";
  });

  searchInput?.addEventListener("input", renderRows);

  watchArchivedROs((rows) => {
    const session = getSession();

    if (session?.role === "advisor") {
      allRows = rows.filter((ro) => {
        return ro.advisorId === session.uid;
      });
    } else {
      allRows = rows;
    }

    renderRows();
  });
}

function renderRows() {
  const value = String(searchInput?.value || "")
    .trim()
    .toLowerCase();

  tableBody.innerHTML = "";

  let rows = allRows;

  if (value) {
    rows = rows.filter((ro) => {
      return [
        ro.roNumber,
        ro.tagNumber,
        ro.customerName,
        ro.customerPhone,
        ro.model,
        ro.archiveReason,
      ]
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }

  if (!rows.length) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td colspan="9">
        No archived repair orders found.
      </td>
    `;

    tableBody.appendChild(tr);

    return;
  }

  rows.forEach((ro) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHTML(ro.roNumber)}</td>
      <td>${escapeHTML(ro.tagNumber)}</td>
      <td>${escapeHTML(ro.customerName)}</td>
      <td>${escapeHTML(ro.customerPhone)}</td>
      <td>${escapeHTML(ro.model)}</td>
      <td>${formatDate(ro.archivedAt)}</td>
      <td>${escapeHTML(ro.archivedByName)}</td>
      <td>${escapeHTML(ro.archiveReason)}</td>
      <td>
        <button
          type="button"
          data-action="restore"
          data-ro-id="${escapeHTML(ro.id)}"
        >
          Restore
        </button>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  bindRestoreButtons();
}

function bindRestoreButtons() {
  tableBody
    .querySelectorAll('[data-action="restore"]')
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const roId = button.dataset.roId;

        const confirmed = confirm(
          "Restore this archived RO?",
        );

        if (!confirmed) {
          return;
        }

        await restoreArchivedRO(roId, {
          module: "ro-archive",
        });
      });
    });
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}