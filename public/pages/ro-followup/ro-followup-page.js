// public/pages/ro-followup/ro-followup-page.js

import { protectRoute } from "/js/core/router.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  watchArchivedROs,
  updateRO,
} from "/js/services/firestore/ros-service.js";

import { ROS_FIELDS } from "/js/config/ros-fields.js";

import { getSession } from "/js/core/session.js";

import { loadROTrackerFollowupSettings } from "/js/modules/ro-tracker/ro-tracker-followup-settings.js";

protectRoute();

const tableBody = document.getElementById("roFollowupTableBody");

const searchInput = document.getElementById("searchFollowup");

const backButton = document.getElementById("btnBackToROTracker");

let allRows = [];

window.addEventListener("dexp-session-ready", initializePage);

function initializePage() {
  renderAppHeader({
    title: "RO Follow Up",
  });

  backButton?.addEventListener("click", () => {
    window.location.href = "/pages/ro-tracker/index.html";
  });

  searchInput?.addEventListener("input", renderRows);

  watchArchivedROs((rows) => {
    const session = getSession();

    let filtered = rows.filter((ro) => {
      return ro.followupStatus === "pending";
    });

    if (session?.role === "advisor") {
      filtered = filtered.filter((ro) => {
        return ro.advisorId === session.uid;
      });
    }

    allRows = filtered;

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
      return [ro.roNumber, ro.customerName, ro.customerPhone, ro.model]
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }

  if (!rows.length) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td colspan="6">
        No pending follow-ups.
      </td>
    `;

    tableBody.appendChild(tr);

    return;
  }

  rows.forEach((ro) => {
    const tr = document.createElement("tr");

    const isDue = Number(ro.followupDueAtMs || 0) <= Date.now();

    if (isDue) {
      tr.style.background = "rgba(255, 230, 120, 0.55)";
    }

    tr.innerHTML = `
      <td>${escapeHTML(ro.roNumber)}</td>

      <td>${escapeHTML(ro.customerName)}</td>

      <td>${escapeHTML(ro.customerPhone)}</td>

      <td>${escapeHTML(ro.model)}</td>

      <td>
        <button
          type="button"
          data-action="text"
          data-ro-id="${escapeHTML(ro.id)}"
        >
          Text
        </button>
      </td>

      <td>
        <button
          type="button"
          data-action="done"
          data-ro-id="${escapeHTML(ro.id)}"
        >
          Done
        </button>
      </td>
    `;

    tableBody.appendChild(tr);
  });

  bindButtons(rows);
}

function bindButtons(rows) {
  tableBody.querySelectorAll('[data-action="text"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const roId = button.dataset.roId;

      const ro = rows.find((r) => r.id === roId);

      if (!ro) {
        return;
      }

      const settings = loadROTrackerFollowupSettings();

      const message = buildSMSMessage(settings.smsTemplate, ro);

      const phone = String(ro.customerPhone || "").replace(/\D/g, "");

      if (!phone) {
        alert("Customer phone missing.");
        return;
      }

      await updateRO(ro.id, {
        [ROS_FIELDS.followupTextSentAtMs]: Date.now(),
      });

      window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    });
  });

  tableBody.querySelectorAll('[data-action="done"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const roId = button.dataset.roId;

      const session = getSession();

      await updateRO(roId, {
        [ROS_FIELDS.followupStatus]: "done",

        [ROS_FIELDS.followupCompletedAtMs]: Date.now(),

        [ROS_FIELDS.followupCompletedBy]: session?.uid || "",

        [ROS_FIELDS.followupCompletedByName]: session?.displayName || "",
      });
    });
  });
}

function buildSMSMessage(template, ro) {
  const fullName = String(ro.customerName || "").trim();

  const firstName = fullName.split(" ")[0] || "";

  return String(template || "")
    .replaceAll("{firstName}", firstName)
    .replaceAll("{name}", fullName)
    .replaceAll("{ro}", ro.roNumber || "")
    .replaceAll("{model}", ro.model || "");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
