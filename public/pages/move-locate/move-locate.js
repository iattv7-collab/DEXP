// public/pages/move-locate/move-locate.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";

import {
  getDealerROs,
  updateRO
} from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

import {
  getActiveLocations,
  groupLocationsByArea
} from "/js/services/firestore/locations-service.js";

protectRoute({
  allowedModules: [MODULES.MOVE_LOCATE]
});

const vehicleSearchInput = document.getElementById("vehicleSearchInput");
const searchModeToggleButton = document.getElementById("searchModeToggleButton");
const searchVehicleButton = document.getElementById("searchVehicleButton");

const vehicleResultCard = document.getElementById("vehicleResultCard");
const moveLocateMessage = document.getElementById("moveLocateMessage");

const previewTag = document.getElementById("previewTag");
const previewRO = document.getElementById("previewRO");
const previewLocation = document.getElementById("previewLocation");
const previewStatus = document.getElementById("previewStatus");
const previewBlockedBy = document.getElementById("previewBlockedBy");

const detailsButton = document.getElementById("detailsButton");
const vehicleDetailsPanel = document.getElementById("vehicleDetailsPanel");

const detailCustomerName = document.getElementById("detailCustomerName");
const detailVIN = document.getElementById("detailVIN");
const detailVehicle = document.getElementById("detailVehicle");
const detailAdvisor = document.getElementById("detailAdvisor");

const startMoveButton = document.getElementById("startMoveButton");
const cancelMoveButton = document.getElementById("cancelMoveButton");
const finalLocationPanel = document.getElementById("finalLocationPanel");
const moveAreaSelect = document.getElementById("moveAreaSelect");
const finalLocationSelect = document.getElementById("finalLocationSelect");
const blocksTagInput = document.getElementById("blocksTagInput");
const saveLocationButton = document.getElementById("saveLocationButton");

const movingVehiclesTableBody = document.getElementById("movingVehiclesTableBody");

let currentRO = null;
let lastROs = [];
let searchMode = "tag";

let groupedLocations = {
  main: [],
  annex: []
};

window.addEventListener("dexp-session-ready", () => {
  initializeMoveLocate();
});

function initializeMoveLocate() {
  renderAppHeader({
    title: "Move & Locate"
  });

  vehicleResultCard.classList.add("hidden");
  vehicleDetailsPanel.classList.add("hidden");
  finalLocationPanel.classList.add("hidden");
  cancelMoveButton.classList.add("hidden");

  searchModeToggleButton.addEventListener("click", toggleSearchMode);

  searchVehicleButton.addEventListener("click", async () => {
    await findVehicle();
  });

  vehicleSearchInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      await findVehicle();
    }
  });

  detailsButton.addEventListener("click", toggleDetails);

  startMoveButton.addEventListener("click", async () => {
    await startMove();
  });

  cancelMoveButton.addEventListener("click", async () => {
    await cancelMove();
  });

  saveLocationButton.addEventListener("click", async () => {
    await saveFinalLocation();
  });

  async function loadLocationCatalog() {
    try {
      const locations = await getActiveLocations();

      groupedLocations =
        groupLocationsByArea(locations);

      moveAreaSelect.addEventListener(
        "change",
        populateLocationDropdown
      );

    } catch (error) {
      console.error(error);
    }
  }

  function populateLocationDropdown() {
    const area = moveAreaSelect.value;

    finalLocationSelect.innerHTML = "";

    const placeholder =
      document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
      "Select location...";

    finalLocationSelect.appendChild(
      placeholder
    );

    if (!area) {
      return;
    }

    const locations =
      groupedLocations[area] || [];

    locations.forEach((location) => {
      const option =
        document.createElement("option");

      option.value = location.label;
      option.textContent = location.label;

      finalLocationSelect.appendChild(option);
    });
  }

  loadLocationCatalog();

  loadMovingVehicles();
}

function toggleSearchMode() {
  searchMode = searchMode === "tag" ? "vin" : "tag";

  if (searchMode === "vin") {
    searchModeToggleButton.textContent = "By VIN";
    vehicleSearchInput.placeholder = "VIN or VIN Last 8";
  } else {
    searchModeToggleButton.textContent = "By Tag";
    vehicleSearchInput.placeholder = "RO # or Tag #";
  }

  vehicleSearchInput.value = "";
  vehicleSearchInput.focus();
}

async function loadMovingVehicles() {
  lastROs = await getDealerROs();
  renderMovingVehicles();
}

async function findVehicle() {
  clearMessage();

  const searchValue = vehicleSearchInput.value.trim().toUpperCase();

  if (!searchValue) {
    showMessage(searchMode === "vin" ? "Enter VIN or VIN Last 8." : "Enter RO # or Tag #.");
    return;
  }

  lastROs = await getDealerROs();

  const match = lastROs.find((ro) => {
    const roNumber = String(ro[ROS_FIELDS.roNumber] || "").toUpperCase();
    const tagNumber = String(ro[ROS_FIELDS.tagNumber] || "").toUpperCase();
    const vin = String(ro[ROS_FIELDS.vin] || "").toUpperCase();
    const vinLast8 = String(ro[ROS_FIELDS.vinLast8] || "").toUpperCase();

    if (searchMode === "vin") {
      return vin === searchValue || vinLast8 === searchValue;
    }

    return roNumber === searchValue || tagNumber === searchValue;
  });

  if (!match) {
    currentRO = null;
    vehicleResultCard.classList.add("hidden");
    vehicleDetailsPanel.classList.add("hidden");
    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");

    showMessage("Vehicle not found.");
    return;
  }

  currentRO = match;
  renderSelectedVehicle(match);

  showMessage("Vehicle found.");
}

function renderSelectedVehicle(ro) {
  const location =
    ro[ROS_FIELDS.currentLocation] ||
    ro.currentLocation ||
    ro.location ||
    "";

  const moveStatus =
    ro.moveStatus ||
    "";

  previewTag.textContent = ro[ROS_FIELDS.tagNumber] || "—";
  previewRO.textContent = ro[ROS_FIELDS.roNumber] || "—";
  previewLocation.textContent = location || "No location saved";
  previewStatus.textContent = moveStatus || "Not moving";
  previewBlockedBy.textContent = ro.blockedBy || "—";

  detailCustomerName.textContent =
    ro[ROS_FIELDS.customerName] || "";

  detailVIN.textContent =
    ro[ROS_FIELDS.vin] || "";

  detailVehicle.textContent = [
    ro[ROS_FIELDS.year] || "",
    ro[ROS_FIELDS.make] || "",
    ro[ROS_FIELDS.model] || ""
  ].filter(Boolean).join(" ");

  detailAdvisor.textContent =
    ro[ROS_FIELDS.advisorName] ||
    ro.advisorName ||
    "";

  document.getElementById("detailMoveStartedBy").textContent =
    ro.moveStartedBy || "";

  document.getElementById("detailMoveStartedAt").textContent =
    formatDateTime(ro.moveStartedAt);

  vehicleResultCard.classList.remove("hidden");

  if (moveStatus === "moving") {
    finalLocationPanel.classList.remove("hidden");
    cancelMoveButton.classList.remove("hidden");
  } else {
    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");
  }
}

function toggleDetails() {
  vehicleDetailsPanel.classList.toggle("hidden");

  if (vehicleDetailsPanel.classList.contains("hidden")) {
    detailsButton.textContent = "View Details";
  } else {
    detailsButton.textContent = "Hide Details";
  }
}

async function startMove() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("Find a vehicle first.");
    return;
  }

  const session = getSession();

  try {
    await updateRO(
      currentRO.id,
      {
        moveStatus: "moving",
        moveStartedAt: Date.now(),
        moveStartedBy: session?.displayName || session?.email || ""
      },
      {
        eventType: "vehicle_move_started",
        module: "move-locate",
        message: "Vehicle move started"
      }
    );

    currentRO = {
      ...currentRO,
      moveStatus: "moving",
      moveStartedAt: Date.now(),
      moveStartedBy: session?.displayName || session?.email || ""
    };

    finalLocationPanel.classList.remove("hidden");
    cancelMoveButton.classList.remove("hidden");

    await loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Vehicle marked as moving.");
  } catch (error) {
    console.error(error);
    showMessage("Could not start move.");
  }
}

async function cancelMove() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("No vehicle selected.");
    return;
  }

  try {
    await updateRO(
      currentRO.id,
      {
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: ""
      },
      {
        eventType: "vehicle_move_cancelled",
        module: "move-locate",
        message: "Vehicle move cancelled"
      }
    );

    currentRO = {
      ...currentRO,
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: ""
    };

    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");

    await loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Move cancelled.");
  } catch (error) {
    console.error(error);
    showMessage("Could not cancel move.");
  }
}

async function saveFinalLocation() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("No vehicle selected.");
    return;
  }

  const selectedArea = moveAreaSelect.value;
  const currentLocation = finalLocationSelect.value.trim();
  const blockingTag = blocksTagInput.value.trim();

  if (!selectedArea) {
    showMessage("Select Main Store or Annex.");
    return;
  }

  if (!currentLocation) {
    showMessage("Select final location.");
    return;
  }

  try {
    await updateRO(
      currentRO.id,
      {
        [ROS_FIELDS.currentLocation]: currentLocation,
        currentLocationArea: selectedArea,
        blockingTag: blockingTag,
        locationUpdatedAt: Date.now(),
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: ""
      },
      {
        eventType: "location_updated",
        module: "move-locate",
        message: `Vehicle moved to ${currentLocation}`
      }
    );

    currentRO = {
      ...currentRO,
      [ROS_FIELDS.currentLocation]: currentLocation,
      currentLocation,
      currentLocationArea: selectedArea,
      blockingTag: blockingTag,
      locationUpdatedAt: Date.now(),
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: ""
    };

    moveAreaSelect.value = "";
    finalLocationSelect.innerHTML = `<option value="">Select area first...</option>`;
    blocksTagInput.value = "";

    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");

    await loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Final location saved.");
  } catch (error) {
    console.error(error);
    showMessage("Could not save final location.");
  }
}

function renderMovingVehicles() {
  const moving = lastROs.filter((ro) => ro.moveStatus === "moving");

  movingVehiclesTableBody.innerHTML = "";

  if (!moving.length) {
    movingVehiclesTableBody.innerHTML = `
      <tr>
        <td colspan="5">No moving vehicles.</td>
      </tr>
    `;
    return;
  }

  moving.forEach((ro) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td data-label="Tag">${ro[ROS_FIELDS.tagNumber] || ""}</td>
      <td data-label="RO">${ro[ROS_FIELDS.roNumber] || ""}</td>
      <td data-label="Current Location">${ro[ROS_FIELDS.currentLocation] || ro.currentLocation || ""}</td>
      <td data-label="Started By">${ro.moveStartedBy || ""}</td>
      <td data-label="Started At">${formatDateTime(ro.moveStartedAt)}</td>
    `;

    row.addEventListener("click", () => {
      currentRO = ro;
      renderSelectedVehicle(ro);
      showMessage("Vehicle selected.");
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });

    movingVehiclesTableBody.appendChild(row);
  });
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

function showMessage(message) {
  moveLocateMessage.textContent = message;
}

function clearMessage() {
  moveLocateMessage.textContent = "";
}