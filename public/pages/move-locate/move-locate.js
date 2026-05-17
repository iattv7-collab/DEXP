// public/pages/move-locate/move-locate.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";

import {
  getDealerROs,
  updateRO,
  watchDealerROs,
} from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

import {
  getActiveLocations,
  groupLocationsByArea,
} from "/js/services/firestore/locations-service.js";

protectRoute({
  allowedModules: [MODULES.MOVE_LOCATE],
});

const vehicleSearchInput = document.getElementById("vehicleSearchInput");
const searchModeToggleButton = document.getElementById(
  "searchModeToggleButton",
);
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

const moveChainPanel = document.getElementById("moveChainPanel");
const moveChainList = document.getElementById("moveChainList");

const detailCustomerName = document.getElementById("detailCustomerName");
const detailVIN = document.getElementById("detailVIN");
const detailVehicle = document.getElementById("detailVehicle");
const detailAdvisor = document.getElementById("detailAdvisor");

const startMoveButton = document.getElementById("startMoveButton");
const cancelMoveButton = document.getElementById("cancelMoveButton");
const overrideCancelMoveButton = document.getElementById(
  "overrideCancelMoveButton",
);
const finalLocationPanel = document.getElementById("finalLocationPanel");
const moveAreaSelect = document.getElementById("moveAreaSelect");
const finalLocationSelect = document.getElementById("finalLocationSelect");
const blocksTagInput = document.getElementById("blocksTagInput");
const saveLocationButton = document.getElementById("saveLocationButton");

const movingVehiclesTableBody = document.getElementById(
  "movingVehiclesTableBody",
);

let currentRO = null;
let lastROs = [];
let searchMode = "tag";

let groupedLocations = {};

const DEVICE_ID_KEY = "dexp_device_id";

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();

    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

window.addEventListener("dexp-session-ready", () => {
  initializeMoveLocate();
});

function initializeMoveLocate() {
  renderAppHeader({
    title: "Move & Locate",
  });

  vehicleResultCard.classList.add("hidden");
  vehicleDetailsPanel.classList.add("hidden");
  moveChainPanel.classList.add("hidden");
  finalLocationPanel.classList.add("hidden");
  cancelMoveButton.classList.add("hidden");
  overrideCancelMoveButton.classList.add("hidden");

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

  overrideCancelMoveButton.addEventListener("click", async () => {
    await overrideCancelMove();
  });

  saveLocationButton.addEventListener("click", async () => {
    await saveFinalLocation();
  });

  loadLocationCatalog();

  loadMovingVehicles();
}

async function loadLocationCatalog() {
  try {
    const locations = await getActiveLocations();

    groupedLocations = groupLocationsByArea(locations);

    populateAreaDropdown();

    moveAreaSelect.addEventListener("change", populateLocationDropdown);
  } catch (error) {
    console.error(error);
  }
}

function populateAreaDropdown() {
  moveAreaSelect.innerHTML = "";

  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = "Select area...";

  moveAreaSelect.appendChild(placeholder);

  Object.keys(groupedLocations).forEach((area) => {
    const option = document.createElement("option");

    option.value = area;
    option.textContent = formatAreaLabel(area);

    moveAreaSelect.appendChild(option);
  });
}

function formatAreaLabel(area) {
  return String(area || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function populateLocationDropdown() {
  const area = moveAreaSelect.value;

  finalLocationSelect.innerHTML = "";

  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = "Select location...";

  finalLocationSelect.appendChild(placeholder);

  if (!area) {
    return;
  }

  const locations = groupedLocations[area] || [];

  locations.forEach((location) => {
    const option = document.createElement("option");

    option.value = location.label;
    option.textContent = location.label;

    finalLocationSelect.appendChild(option);
  });
}

function isMoveOwner(ro) {
  const session = getSession();

  return (
    ro?.moveStartedByUid === session?.uid &&
    ro?.moveStartedDeviceId === getDeviceId()
  );
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

function loadMovingVehicles() {
  watchDealerROs((ros) => {
    lastROs = ros;

    renderMovingVehicles();

    if (currentRO?.id) {
      const updatedRO = ros.find((ro) => ro.id === currentRO.id);

      if (updatedRO) {
        currentRO = updatedRO;

        renderSelectedVehicle(updatedRO);
      }
    }
  });
}

async function findVehicle() {
  clearMessage();

  const searchValue = vehicleSearchInput.value.trim().toUpperCase();

  if (!searchValue) {
    showMessage(
      searchMode === "vin"
        ? "Enter VIN or VIN Last 8."
        : "Enter RO # or Tag #.",
    );
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
  renderMovingVehicles();
  renderSelectedVehicle(match);

  showMessage("Vehicle found.");
}

function renderSelectedVehicle(ro) {
  const location =
    ro[ROS_FIELDS.currentLocation] || ro.currentLocation || ro.location || "";

  const moveStatus = ro.moveStatus || "";

  previewTag.textContent = ro[ROS_FIELDS.tagNumber] || "—";
  previewRO.textContent = ro[ROS_FIELDS.roNumber] || "—";
  previewLocation.textContent = location || "No location saved";
  previewStatus.textContent = moveStatus || "Not moving";
  previewBlockedBy.textContent =
    buildBlockedByChain(ro, lastROs).join(", ") || "—";
  renderMoveChain(ro);

  detailCustomerName.textContent = ro[ROS_FIELDS.customerName] || "";

  detailVIN.textContent = ro[ROS_FIELDS.vin] || "";

  detailVehicle.textContent = [
    ro[ROS_FIELDS.year] || "",
    ro[ROS_FIELDS.make] || "",
    ro[ROS_FIELDS.model] || "",
  ]
    .filter(Boolean)
    .join(" ");

  detailAdvisor.textContent =
    ro[ROS_FIELDS.advisorName] || ro.advisorName || "";

  document.getElementById("detailMoveStartedBy").textContent =
    ro.moveStartedBy || "";

  document.getElementById("detailMoveStartedAt").textContent = formatDateTime(
    ro.moveStartedAt,
  );

  vehicleResultCard.classList.remove("hidden");

  if (moveStatus === "moving") {
    startMoveButton.classList.add("hidden");

    if (isMoveOwner(ro)) {
      finalLocationPanel.classList.remove("hidden");

      cancelMoveButton.classList.remove("hidden");
      overrideCancelMoveButton.classList.add("hidden");
    } else {
      finalLocationPanel.classList.add("hidden");

      cancelMoveButton.classList.add("hidden");

      overrideCancelMoveButton.classList.add("hidden");

      showMessage(
        `Vehicle is being moved by ${ro.moveStartedBy || "another user"}.`,
      );
    }
  } else {
    finalLocationPanel.classList.add("hidden");

    cancelMoveButton.classList.add("hidden");
    overrideCancelMoveButton.classList.add("hidden");

    startMoveButton.classList.remove("hidden");
  }
}

function renderMoveChain(ro) {
  const chain = buildBlockedByChain(ro, lastROs);

  moveChainList.innerHTML = "";

  if (!chain.length) {
    moveChainPanel.classList.add("hidden");
    return;
  }

  moveChainPanel.classList.remove("hidden");

  const moveOrder = [...chain].reverse();

  moveOrder.forEach((tag, index) => {
    const row = document.createElement("div");

    row.textContent = `${index + 1}. Move ${tag}`;

    moveChainList.appendChild(row);
  });

  const targetRow = document.createElement("div");

  targetRow.innerHTML = `<b>Target:</b> ${getROTag(ro)}`;

  moveChainList.appendChild(targetRow);
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

  await clearCarsBlockedByCurrentVehicle();

  try {
    await updateRO(
      currentRO.id,
      {
        moveStatus: "moving",
        moveStartedAt: Date.now(),
        moveStartedBy: session?.displayName || session?.email || "",
        moveStartedByUid: session?.uid || "",
        moveStartedDeviceId: getDeviceId(),
      },
      {
        eventType: "vehicle_move_started",
        module: "move-locate",
        message: "Vehicle move started",
      },
    );

    currentRO = {
      ...currentRO,

      moveStatus: "moving",

      moveStartedAt: Date.now(),

      moveStartedBy: session?.displayName || session?.email || "",

      moveStartedByUid: session?.uid || "",

      moveStartedDeviceId: getDeviceId(),
    };

    finalLocationPanel.classList.remove("hidden");
    cancelMoveButton.classList.remove("hidden");
    startMoveButton.classList.add("hidden");

    lastROs = lastROs.map((ro) => {
      if (ro.id !== currentRO.id) {
        return ro;
      }

      return {
        ...ro,
        moveStatus: "moving",
        moveStartedAt: currentRO.moveStartedAt,
        moveStartedBy: currentRO.moveStartedBy,
        moveStartedByUid: currentRO.moveStartedByUid,
        moveStartedDeviceId: currentRO.moveStartedDeviceId,
      };
    });

    renderMovingVehicles();
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
        moveStartedBy: "",
      },
      {
        eventType: "vehicle_move_cancelled",
        module: "move-locate",
        message: "Vehicle move cancelled",
      },
    );

    currentRO = {
      ...currentRO,
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
    };

    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");
    startMoveButton.classList.remove("hidden");

    loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Move cancelled.");
    setTimeout(resetMoveLocateForm, 2000);
  } catch (error) {
    console.error(error);
    showMessage("Could not cancel move.");
  }
}

async function overrideCancelMove() {
  clearMessage();

  if (!currentRO?.id) {
    return;
  }

  const confirmed = confirm("Override and cancel this move?");

  if (!confirmed) {
    return;
  }

  try {
    await updateRO(
      currentRO.id,
      {
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: "",
        moveStartedByUid: "",
        moveStartedDeviceId: "",
      },
      {
        eventType: "vehicle_move_override_cancelled",
        module: "move-locate",
        message: "Vehicle move overridden and cancelled",
      },
    );

    currentRO = {
      ...currentRO,
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
      moveStartedByUid: "",
      moveStartedDeviceId: "",
    };

    await loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Move override cancelled.");
    setTimeout(resetMoveLocateForm, 2000);
  } catch (error) {
    console.error(error);
    showMessage("Could not override move.");
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

        locationUpdatedAt: Date.now(),
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: "",
      },
      {
        eventType: "location_updated",
        module: "move-locate",
        message: `Vehicle moved to ${currentLocation}`,
      },
    );

    if (blockingTag) {
      await saveBlockingRelationship({
        blockerRO: currentRO,
        blockedTag: blockingTag,
        location: currentLocation,
      });
    }

    currentRO = {
      ...currentRO,
      [ROS_FIELDS.currentLocation]: currentLocation,
      currentLocation,
      currentLocationArea: selectedArea,

      locationUpdatedAt: Date.now(),
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
    };

    moveAreaSelect.value = "";
    finalLocationSelect.innerHTML = `<option value="">Select area first...</option>`;
    blocksTagInput.value = "";

    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");

    await loadMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Final location saved.");
    setTimeout(resetMoveLocateForm, 2000);
  } catch (error) {
    console.error(error);
    showMessage(error?.message || "Could not save final location.");
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

    const actionHtml =
      ro.moveStatus === "moving" && !isMoveOwner(ro)
        ? `
      <button
        class="small-button secondary table-override-cancel-button"
        data-id="${ro.id}"
      >
        Override Cancel
      </button>
    `
        : "";

    row.innerHTML = `
  <td data-label="Tag">${ro[ROS_FIELDS.tagNumber] || ""}</td>
  <td data-label="RO">${ro[ROS_FIELDS.roNumber] || ""}</td>
  <td data-label="Current Location">${ro[ROS_FIELDS.currentLocation] || ro.currentLocation || ""}</td>
  <td data-label="Started By">${ro.moveStartedBy || ""}</td>
  <td data-label="Started At">${formatDateTime(ro.moveStartedAt)}</td>
  <td data-label="Action">${actionHtml}</td>
`;

    row.addEventListener("click", () => {
      currentRO = ro;
      renderSelectedVehicle(ro);
      showMessage("Vehicle selected.");
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });

    movingVehiclesTableBody.appendChild(row);
    const overrideButton = row.querySelector(".table-override-cancel-button");

    if (overrideButton) {
      overrideButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        currentRO = ro;

        await overrideCancelMove();
      });
    }
  });
}

function normalizeTag(value = "") {
  return String(value).trim().toUpperCase();
}

function getROTag(ro) {
  return normalizeTag(ro?.[ROS_FIELDS.tagNumber] || ro?.tagNumber || "");
}

function getROLocation(ro) {
  return String(
    ro?.[ROS_FIELDS.currentLocation] ||
      ro?.currentLocation ||
      ro?.location ||
      "",
  ).trim();
}

function findROByTag(tag, ros = []) {
  const cleanTag = normalizeTag(tag);

  return ros.find((ro) => {
    return getROTag(ro) === cleanTag;
  });
}

function buildBlockedByChain(ro, ros = []) {
  const chain = [];
  const visited = new Set();

  let nextTag = normalizeTag(ro?.blockedByTag || "");

  while (nextTag) {
    if (visited.has(nextTag)) {
      break;
    }

    visited.add(nextTag);
    chain.push(nextTag);

    const blockerRO = findROByTag(nextTag, ros);

    if (!blockerRO) {
      break;
    }

    nextTag = normalizeTag(blockerRO.blockedByTag || "");
  }

  return chain;
}

async function saveBlockingRelationship({ blockerRO, blockedTag, location }) {
  const blockerTag = getROTag(blockerRO);
  const cleanBlockedTag = normalizeTag(blockedTag);

  if (!cleanBlockedTag) {
    return;
  }

  if (cleanBlockedTag === blockerTag) {
    throw new Error("A vehicle cannot block itself.");
  }

  const blockedRO = findROByTag(cleanBlockedTag, lastROs);

  if (!blockedRO?.id) {
    throw new Error(`Blocked tag ${cleanBlockedTag} was not found.`);
  }

  const blockedLocation = getROLocation(blockedRO);

  const blockerChain = buildBlockedByChain(blockerRO, lastROs);

  if (blockerChain.includes(cleanBlockedTag)) {
    throw new Error("This would create a circular blocking chain.");
  }

  if (blockedLocation && blockedLocation !== location) {
    throw new Error(`Blocked tag ${cleanBlockedTag} is not in ${location}.`);
  }

  await updateRO(
    blockedRO.id,
    {
      blockedByTag: blockerTag,
    },
    {
      eventType: "vehicle_blocked",
      module: "move-locate",
      message: `${cleanBlockedTag} is blocked by ${blockerTag}`,
    },
  );
}

async function clearCarsBlockedByCurrentVehicle() {
  const currentTag = getROTag(currentRO);

  if (!currentTag) {
    return;
  }

  const blockedCars = lastROs.filter((ro) => {
    return normalizeTag(ro.blockedByTag || "") === currentTag;
  });

  for (const blockedCar of blockedCars) {
    await updateRO(
      blockedCar.id,
      {
        blockedByTag: "",
      },
      {
        eventType: "blocked_by_cleared",
        module: "move-locate",
        message: `Blocked by tag ${currentTag} cleared because blocker moved`,
      },
    );
  }
}

function hasUnsavedOwnedMove() {
  return currentRO?.moveStatus === "moving" && isMoveOwner(currentRO);
}

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedOwnedMove()) {
    return;
  }

  event.preventDefault();

  event.returnValue = "";
});

function resetMoveLocateForm() {
  currentRO = null;

  vehicleSearchInput.value = "";

  vehicleResultCard.classList.add("hidden");
  vehicleDetailsPanel.classList.add("hidden");
  moveChainPanel.classList.add("hidden");

  finalLocationPanel.classList.add("hidden");

  cancelMoveButton.classList.add("hidden");
  overrideCancelMoveButton.classList.add("hidden");

  startMoveButton.classList.remove("hidden");

  moveAreaSelect.value = "";

  finalLocationSelect.innerHTML = `<option value="">Select area first...</option>`;

  blocksTagInput.value = "";
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
