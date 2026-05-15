// public/pages/master-ro/master-ro.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";

import {
    createRO,
    getDealerROs
} from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";
import { MASTER_RO_COLUMNS } from "/js/config/columns/master-ro-columns.js";

import {
    renderDataTable,
    buildTableHeaders,
    formatTableDate
} from "/js/shared/data-table.js";

protectRoute({
    allowedModules: [MODULES.MASTER_RO]
});

const tableHead = document.getElementById("masterRoTableHead");
const roList = document.getElementById("roList");
const createTestRoButton = document.getElementById("createTestRoButton");
const roSearchInput = document.getElementById("roSearchInput");

let currentROs = [];

window.addEventListener("dexp-session-ready", () => {
    initializeMasterRO();
});

async function initializeMasterRO() {
    renderAppHeader({
        title: "Master RO"
    });

    tableHead.innerHTML = buildTableHeaders(MASTER_RO_COLUMNS);

    createTestRoButton.addEventListener("click", async () => {
        await createTestRO();
    });

    roSearchInput.addEventListener("input", () => {
        renderROs(filterROs(roSearchInput.value));
    });

    await loadROs();
}

async function createTestRO() {
    await createRO({
        [ROS_FIELDS.roNumber]: `RO-${Date.now()}`,
        [ROS_FIELDS.tagNumber]: `T-${Date.now().toString().slice(-4)}`,
        [ROS_FIELDS.vin]: "WP0AA2A90RS123456",
        [ROS_FIELDS.year]: "2024",
        [ROS_FIELDS.make]: "Porsche",
        [ROS_FIELDS.model]: "911",
        [ROS_FIELDS.color]: "White",
        [ROS_FIELDS.customerName]: "Test Customer",
        [ROS_FIELDS.customerPhone]: "555-555-5555",
        [ROS_FIELDS.scanSource]: "manual-test"
    });

    await loadROs();
}

async function loadROs() {
    roList.innerHTML = `
    <tr>
      <td colspan="${MASTER_RO_COLUMNS.length}">
        Loading ROs...
      </td>
    </tr>
  `;

    currentROs = await getDealerROs();

    renderROs(currentROs);
}

function filterROs(searchValue = "") {
    const search = searchValue.trim().toLowerCase();

    if (!search) {
        return currentROs;
    }

    return currentROs.filter((ro) => {
        const text = [
            ro.roNumber,
            ro.tagNumber,
            ro.vin,
            ro.vinLast8,
            ro.year,
            ro.make,
            ro.model,
            ro.color,
            ro.customerName,
            ro.customerPhone,
            ro.advisorName,
            ro.status,
            ro.currentLocation,
            ro.locationArea,
            ro.scanSource
        ]
            .join(" ")
            .toLowerCase();

        return text.includes(search);
    });
}

function renderROs(ros) {
    renderDataTable({
        columns: MASTER_RO_COLUMNS,
        rows: ros,
        container: roList,
        rowRenderer: renderRORow
    });
}

function renderRORow(ro, columns) {
    return `
    <tr>
      ${columns.map((column) => {
        return `
          <td data-label="${column.label}">
            ${getColumnValue(ro, column)}
          </td>
        `;
    }).join("")}
    </tr>
  `;
}

function getColumnValue(ro, column) {

    if (column.type === "date") {
        return formatTableDate(ro[column.key]);
    }

    if (column.key === "vehicle") {
        return [
            ro.year,
            ro.make,
            ro.model,
            ro.color
        ].filter(Boolean).join(" ");
    }

    if (column.key === "status") {
        const status = ro.status || "";
        const statusClass = `status-${status}`;

        return `
      <span class="status-pill ${statusClass}">
        ${status}
      </span>
    `;
    }

    if (column.key === "isWaiter") {
        return ro.isWaiter ? "Yes" : "";
    }

    if (column.key === "hasLoaner") {
        return ro.hasLoaner ? "Yes" : "";
    }

    if (column.key === "view") {
        return `
      <button class="small-button" type="button">
        View
      </button>
    `;
    }

    if (column.key === "actions") {
        return `
      <div class="action-button-row">
        <button class="small-button secondary" type="button">
          Edit
        </button>

        <button class="small-button secondary" type="button">
          More
        </button>
      </div>
    `;
    }

    return ro[column.key] || "";
}