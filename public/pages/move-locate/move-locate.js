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
const selectedVehicleSection = vehicleResultCard.closest(".tool-card");

const detailCustomerName = document.getElementById("detailCustomerName");
const detailVIN = document.getElementById("detailVIN");
const detailVehicle = document.getElementById("detailVehicle");
const detailAdvisor = document.getElementById("detailAdvisor");

const startMoveButton = document.getElementById("startMoveButton");
const cancelMoveButton = document.getElementById("cancelMoveButton");
const overrideCancelMoveButton = document.getElementById(
  "overrideCancelMoveButton",
);
const takeOverMoveButton = document.getElementById("takeOverMoveButton");

const finalLocationPanel = document.getElementById("finalLocationPanel");

const singleFinalLocationControls = document.getElementById(
  "singleFinalLocationControls",
);
const singleSaveLocationRow = document.getElementById("singleSaveLocationRow");

const moveAreaSelect = document.getElementById("moveAreaSelect");
const finalLocationSelect = document.getElementById("finalLocationSelect");
const blocksTagInput = document.getElementById("blocksTagInput");
const saveLocationButton = document.getElementById("saveLocationButton");

const groupFinalLocationList = document.getElementById(
  "groupFinalLocationList",
);
const groupSaveLocationRow = document.getElementById("groupSaveLocationRow");
const saveGroupLocationsButton = document.getElementById(
  "saveGroupLocationsButton",
);

const movingVehiclesTableBody = document.getElementById(
  "movingVehiclesTableBody",
);

const parkingAvailabilityList = document.getElementById(
  "parkingAvailabilityList",
);

let currentRO = null;
let currentMoveGroup = [];
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

  hideInitialPanels();

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

  if (takeOverMoveButton) {
    takeOverMoveButton.addEventListener("click", async () => {
      await takeOverMove();
    });
  }

  if (saveLocationButton) {
    saveLocationButton.addEventListener("click", async () => {
      await saveAllLocations();
    });
  }

  if (saveGroupLocationsButton) {
    saveGroupLocationsButton.addEventListener("click", async () => {
      await saveAllLocations();
    });
  }

  loadLocationCatalog();
  loadMovingVehicles();
}

function hideInitialPanels() {
  vehicleResultCard.classList.add("hidden");
  vehicleDetailsPanel.classList.add("hidden");
  moveChainPanel.classList.add("hidden");
  finalLocationPanel.classList.add("hidden");
  cancelMoveButton.classList.add("hidden");
  overrideCancelMoveButton.classList.add("hidden");

  if (takeOverMoveButton) {
    takeOverMoveButton.classList.add("hidden");
  }

  hideOldSingleSaveUi();
  hideUnifiedSaveButton();
}

async function loadLocationCatalog() {
  try {
    const locations = await getActiveLocations();

    groupedLocations = groupLocationsByArea(locations);

    populateLegacyAreaDropdown();

    if (moveAreaSelect) {
      moveAreaSelect.addEventListener("change", populateLegacyLotDropdown);
    }
  } catch (error) {
    console.error(error);
    showMessage("Could not load locations.");
  }
}

function populateLegacyAreaDropdown() {
  if (!moveAreaSelect) {
    return;
  }

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

function populateLegacyLotDropdown() {
  if (!finalLocationSelect || !moveAreaSelect) {
    return;
  }

  const area = moveAreaSelect.value;

  finalLocationSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select lot...";

  finalLocationSelect.appendChild(placeholder);

  if (!area) {
    return;
  }

  const lots = groupedLocations[area] || [];

  lots.forEach((lot) => {
    const option = document.createElement("option");

    option.value = lot.label;
    option.textContent = lot.label;

    finalLocationSelect.appendChild(option);
  });
}

function formatAreaLabel(area) {
  return String(area || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSessionUserName() {
  const session = getSession();

  return session?.displayName || session?.email || "";
}

function isMoveOwner(ro) {
  const session = getSession();

  return (
    ro?.moveStartedByUid === session?.uid &&
    ro?.moveStartedDeviceId === getDeviceId()
  );
}

function isMoving(ro) {
  return ro?.moveStatus === "moving";
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
    renderParkingAvailability();

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
    currentMoveGroup = [];
    vehicleResultCard.classList.add("hidden");
    vehicleDetailsPanel.classList.add("hidden");
    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");
    overrideCancelMoveButton.classList.add("hidden");

    if (takeOverMoveButton) {
      takeOverMoveButton.classList.add("hidden");
    }

    showMessage("Vehicle not found.");
    return;
  }

  currentRO = match;

  if (isMoving(match) && isMoveOwner(match)) {
    currentMoveGroup = getCurrentMoveGroup(match);
    renderUnifiedMoveCards();
  } else {
    currentMoveGroup = [];
  }

  renderMovingVehicles();
  renderSelectedVehicle(match);

  showMessage("Vehicle found.");
}

function renderSelectedVehicle(ro) {
  const area = getROArea(ro);
  const lot = getROLot(ro);
  const moveStatus = ro.moveStatus || "";
  const blockedByChain = buildBlockedByChain(ro, lastROs);

  previewTag.textContent = getROTag(ro) || "—";
  previewRO.textContent = ro[ROS_FIELDS.roNumber] || "—";
  previewLocation.textContent = formatAreaLot(area, lot) || "No location saved";
  previewStatus.textContent = moveStatus || "Not moving";
  previewBlockedBy.textContent = blockedByChain.join(", ") || "—";

  moveChainPanel.classList.add("hidden");
  moveChainList.innerHTML = "";

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

  if (isMoving(ro)) {
    startMoveButton.classList.add("hidden");

    if (isMoveOwner(ro)) {
      finalLocationPanel.classList.remove("hidden");
      cancelMoveButton.classList.remove("hidden");
      overrideCancelMoveButton.classList.add("hidden");

      if (takeOverMoveButton) {
        takeOverMoveButton.classList.add("hidden");
      }

      currentMoveGroup = getCurrentMoveGroup(ro);
      renderUnifiedMoveCards();
    } else {
      finalLocationPanel.classList.add("hidden");
      cancelMoveButton.classList.add("hidden");
      overrideCancelMoveButton.classList.remove("hidden");

      if (takeOverMoveButton) {
        takeOverMoveButton.classList.remove("hidden");
      }

      showMessage(
        `Vehicle is already being moved by ${ro.moveStartedBy || "another user"}.`,
      );
    }

    return;
  }

  finalLocationPanel.classList.add("hidden");
  cancelMoveButton.classList.add("hidden");
  overrideCancelMoveButton.classList.add("hidden");

  if (takeOverMoveButton) {
    takeOverMoveButton.classList.add("hidden");
  }

  startMoveButton.classList.remove("hidden");
}

function toggleDetails() {
  vehicleDetailsPanel.classList.toggle("hidden");

  detailsButton.textContent = vehicleDetailsPanel.classList.contains("hidden")
    ? "View Details"
    : "Hide Details";
}

async function startMove() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("Find a vehicle first.");
    return;
  }

  lastROs = await getDealerROs();

  const freshCurrentRO = lastROs.find((ro) => ro.id === currentRO.id);

  if (!freshCurrentRO) {
    showMessage("Vehicle not found.");
    return;
  }

  if (isMoving(freshCurrentRO) && !isMoveOwner(freshCurrentRO)) {
    currentRO = freshCurrentRO;
    renderSelectedVehicle(freshCurrentRO);
    showMessage(
      `Vehicle is already being moved by ${freshCurrentRO.moveStartedBy || "another user"}.`,
    );
    return;
  }

  if (isMoving(freshCurrentRO) && isMoveOwner(freshCurrentRO)) {
    currentRO = freshCurrentRO;
    currentMoveGroup = getCurrentMoveGroup(freshCurrentRO);
    renderUnifiedMoveCards();
    showMessage("Move already started.");
    return;
  }

  const moveGroup = buildMoveGroup(freshCurrentRO, lastROs);

  const alreadyMoving = moveGroup.find((ro) => {
    return isMoving(ro) && !isMoveOwner(ro);
  });

  if (alreadyMoving) {
    showMessage(
      `${getROTag(alreadyMoving)} is already being moved by ${
        alreadyMoving.moveStartedBy || "another user"
      }.`,
    );
    return;
  }

  const session = getSession();
  const startedAt = Date.now();
  const startedBy = getSessionUserName();
  const startedByUid = session?.uid || "";
  const deviceId = getDeviceId();
  const moveGroupId = crypto.randomUUID();
  const targetTag = getROTag(freshCurrentRO);

  try {
    for (const [index, ro] of moveGroup.entries()) {
      await updateRO(
        ro.id,
        {
          moveStatus: "moving",
          moveStartedAt: startedAt,
          moveStartedBy: startedBy,
          moveStartedByUid: startedByUid,
          moveStartedDeviceId: deviceId,

          moveGroupId,
          moveGroupTargetId: freshCurrentRO.id,
          moveGroupTargetTag: targetTag,
          moveGroupOrder: index + 1,
        },
        {
          eventType:
            ro.id === freshCurrentRO.id
              ? "vehicle_move_started"
              : "vehicle_group_move_started",
          module: "move-locate",
          message:
            ro.id === freshCurrentRO.id
              ? "Target vehicle move started"
              : `Blocker ${getROTag(ro)} move started for target ${targetTag}`,
        },
      );
    }

    lastROs = await getDealerROs();

    currentMoveGroup = lastROs
      .filter((ro) => ro.moveGroupId === moveGroupId)
      .sort((a, b) => (a.moveGroupOrder || 0) - (b.moveGroupOrder || 0));

    currentRO =
      currentMoveGroup.find((ro) => ro.id === freshCurrentRO.id) ||
      freshCurrentRO;

    startMoveButton.classList.add("hidden");
    cancelMoveButton.classList.remove("hidden");
    finalLocationPanel.classList.remove("hidden");

    renderUnifiedMoveCards();
    renderMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage(
      currentMoveGroup.length > 1
        ? `${currentMoveGroup.length} vehicles locked for move. Select final locations for all.`
        : "Vehicle locked for move. Select final location.",
    );
  } catch (error) {
    console.error(error);
    showMessage("Could not start move.");
  }
}

function getCurrentMoveGroup(ro) {
  if (!ro?.moveGroupId) {
    return [ro];
  }

  const group = lastROs
    .filter((item) => item.moveGroupId === ro.moveGroupId)
    .sort((a, b) => (a.moveGroupOrder || 0) - (b.moveGroupOrder || 0));

  return group.length ? group : [ro];
}

function renderUnifiedMoveCards() {
  groupFinalLocationList.innerHTML = "";

  hideOldSingleSaveUi();
  showUnifiedSaveButton();

  if (!currentMoveGroup.length) {
    updateUnifiedSaveButtonState();
    return;
  }

  currentMoveGroup.forEach((ro) => {
    const card = document.createElement("div");

    card.className = "tool-preview";
    card.style.marginBottom = "10px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div><b>TAG</b> ${getROTag(ro)}</div>
          <div><b>RO</b> ${ro[ROS_FIELDS.roNumber] || ""}</div>
          <div><b>Current Area/Lot:</b> ${formatAreaLot(getROArea(ro), getROLot(ro)) || ""}</div>
          <div><b>Status:</b> ${ro.moveStatus || ""}</div>
        </div>

        <div>
          <label>
            Final Area
            <select class="group-area-select" data-id="${ro.id}">
              <option value="">Select area...</option>
              ${Object.keys(groupedLocations)
                .map(
                  (area) =>
                    `<option value="${escapeHtml(area)}">${escapeHtml(
                      formatAreaLabel(area),
                    )}</option>`,
                )
                .join("")}
            </select>
          </label>

          <label>
            Final Lot
            <select class="group-lot-select" data-id="${ro.id}">
              <option value="">Select area first...</option>
            </select>
          </label>

          <label>
            Blocking Tag
            <input
              class="group-blocking-input"
              data-id="${ro.id}"
              type="text"
              placeholder="Tag this car is blocking"
            />
          </label>
        </div>
      </div>
    `;

    groupFinalLocationList.appendChild(card);
  });

  groupFinalLocationList
    .querySelectorAll(".group-area-select")
    .forEach((select) => {
      select.addEventListener("change", () => {
        const roId = select.dataset.id;
        const lotSelect = groupFinalLocationList.querySelector(
          `.group-lot-select[data-id="${roId}"]`,
        );

        lotSelect.innerHTML = `<option value="">Select lot...</option>`;

        const lots = groupedLocations[select.value] || [];

        lots.forEach((lot) => {
          const option = document.createElement("option");

          option.value = lot.label;
          option.textContent = lot.label;

          lotSelect.appendChild(option);
        });

        updateUnifiedSaveButtonState();
      });
    });

  groupFinalLocationList
    .querySelectorAll(".group-lot-select")
    .forEach((select) => {
      select.addEventListener("change", updateUnifiedSaveButtonState);
    });

  groupFinalLocationList
    .querySelectorAll(".group-blocking-input")
    .forEach((input) => {
      input.addEventListener("input", () => {
        input.value = normalizeTag(input.value);
      });
    });

  updateUnifiedSaveButtonState();
}

function hideOldSingleSaveUi() {
  if (singleFinalLocationControls) {
    singleFinalLocationControls.classList.add("hidden");
  }

  if (singleSaveLocationRow) {
    singleSaveLocationRow.classList.add("hidden");
  }

  if (saveLocationButton) {
    saveLocationButton.disabled = true;
  }
}

function showUnifiedSaveButton() {
  if (groupSaveLocationRow) {
    groupSaveLocationRow.classList.remove("hidden");
  }
}

function hideUnifiedSaveButton() {
  if (groupSaveLocationRow) {
    groupSaveLocationRow.classList.add("hidden");
  }

  if (saveGroupLocationsButton) {
    saveGroupLocationsButton.disabled = true;
  }
}

function updateUnifiedSaveButtonState() {
  if (!saveGroupLocationsButton) {
    return;
  }

  if (!currentMoveGroup.length) {
    saveGroupLocationsButton.disabled = true;
    return;
  }

  const allHaveFinalLocation = currentMoveGroup.every((ro) => {
    const areaSelect = groupFinalLocationList.querySelector(
      `.group-area-select[data-id="${ro.id}"]`,
    );

    const lotSelect = groupFinalLocationList.querySelector(
      `.group-lot-select[data-id="${ro.id}"]`,
    );

    return Boolean(areaSelect?.value && lotSelect?.value);
  });

  saveGroupLocationsButton.disabled = !allHaveFinalLocation;
}

async function saveAllLocations() {
  clearMessage();

  if (!currentMoveGroup.length) {
    showMessage("No move to save.");
    return;
  }

  const saveItems = currentMoveGroup.map((ro) => {
    const areaSelect = groupFinalLocationList.querySelector(
      `.group-area-select[data-id="${ro.id}"]`,
    );

    const lotSelect = groupFinalLocationList.querySelector(
      `.group-lot-select[data-id="${ro.id}"]`,
    );

    const blockingInput = groupFinalLocationList.querySelector(
      `.group-blocking-input[data-id="${ro.id}"]`,
    );

    return {
      ro,
      finalArea: areaSelect?.value || "",
      finalLot: lotSelect?.value?.trim() || "",
      blockingTag: normalizeTag(blockingInput?.value || ""),
    };
  });

  const missingLocation = saveItems.find((item) => {
    return !item.finalArea || !item.finalLot;
  });

  if (missingLocation) {
    showMessage("Select final area and lot for every moving vehicle.");
    updateUnifiedSaveButtonState();
    return;
  }

  clearMoveValidationErrors();

  const validationMessage = validateSaveItems(saveItems);

  if (validationMessage) {
    showMessage(validationMessage);
    updateUnifiedSaveButtonState();
    return;
  }

  saveGroupLocationsButton.disabled = true;

  try {
    for (const item of saveItems) {
      await saveOneMovedVehicle(item);
    }

    currentMoveGroup = [];
    groupFinalLocationList.innerHTML = "";

    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");
    startMoveButton.classList.remove("hidden");

    hideUnifiedSaveButton();

    lastROs = await getDealerROs();

    renderMovingVehicles();

    showMessage("All locations saved.");
    setTimeout(resetMoveLocateForm, 2000);
  } catch (error) {
    console.error(error);
    showMessage(error?.message || "Could not save locations.");
    updateUnifiedSaveButtonState();
  }
}

function clearMoveValidationErrors() {
  groupFinalLocationList
    .querySelectorAll(".move-validation-error")
    .forEach((card) => {
      card.classList.remove("move-validation-error");
    });
}

function validateSaveItems(saveItems) {
  for (const item of saveItems) {
    if (item.blockingTag && item.blockingTag === getROTag(item.ro)) {
      return "A vehicle cannot block itself.";
    }

    if (!item.blockingTag) {
      continue;
    }

    const blockedRO = findROByTag(item.blockingTag, lastROs);

    if (!blockedRO) {
      return `Blocking tag ${item.blockingTag} was not found.`;
    }

    const blockedArea = getROArea(blockedRO);
    const blockedLot = getROLot(blockedRO);

    const card = groupFinalLocationList
      .querySelector(`.group-blocking-input[data-id="${item.ro.id}"]`)
      ?.closest(".tool-preview");

    if (card) {
      card.classList.remove("move-validation-error");
    }

    if (
      (blockedArea && blockedArea !== item.finalArea) ||
      (blockedLot && blockedLot !== item.finalLot)
    ) {
      if (card) {
        card.classList.add("move-validation-error");
      }

      return `Blocking tag ${item.blockingTag} is not in the same lot.`;
    }

    const chain = buildBlockedByChain(item.ro, lastROs);

    if (chain.includes(item.blockingTag)) {
      return "This would create a circular blocking chain.";
    }
  }

  return "";
}

async function saveOneMovedVehicle({ ro, finalArea, finalLot, blockingTag }) {
  const movedTag = getROTag(ro);

  await clearCarsBlockedByTag(movedTag);

  await updateRO(
    ro.id,
    {
      [ROS_FIELDS.currentLocation]: finalLot,
      currentLocation: finalLot,
      currentLocationArea: finalArea,

      blockedByTag: "",
      blockingTag: "",

      locationUpdatedAt: Date.now(),

      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
      moveStartedByUid: "",
      moveStartedDeviceId: "",

      moveGroupId: "",
      moveGroupTargetId: "",
      moveGroupTargetTag: "",
      moveGroupOrder: null,
    },
    {
      eventType: "location_updated",
      module: "move-locate",
      message: `Vehicle moved to ${formatAreaLot(finalArea, finalLot)}`,
    },
  );

  lastROs = await getDealerROs();

  if (blockingTag) {
    await saveBlockingRelationship({
      blockerRO: {
        ...ro,
        [ROS_FIELDS.currentLocation]: finalLot,
        currentLocation: finalLot,
        currentLocationArea: finalArea,
      },
      blockedTag: blockingTag,
      area: finalArea,
      lot: finalLot,
    });
  }

  lastROs = await getDealerROs();
}

async function cancelMove() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("No vehicle selected.");
    return;
  }

  lastROs = await getDealerROs();

  const freshCurrentRO = lastROs.find((ro) => ro.id === currentRO.id);

  if (!freshCurrentRO) {
    showMessage("Vehicle not found.");
    return;
  }

  const moveGroup = getCurrentMoveGroup(freshCurrentRO);

  try {
    for (const ro of moveGroup) {
      await updateRO(
        ro.id,
        {
          moveStatus: "",
          moveStartedAt: null,
          moveStartedBy: "",
          moveStartedByUid: "",
          moveStartedDeviceId: "",

          moveGroupId: "",
          moveGroupTargetId: "",
          moveGroupTargetTag: "",
          moveGroupOrder: null,
        },
        {
          eventType:
            moveGroup.length > 1
              ? "vehicle_group_move_cancelled"
              : "vehicle_move_cancelled",
          module: "move-locate",
          message:
            moveGroup.length > 1
              ? "Vehicle group move cancelled"
              : "Vehicle move cancelled",
        },
      );
    }

    currentMoveGroup = [];
    currentRO = {
      ...freshCurrentRO,
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
      moveStartedByUid: "",
      moveStartedDeviceId: "",
      moveGroupId: "",
      moveGroupTargetId: "",
      moveGroupTargetTag: "",
      moveGroupOrder: null,
    };

    groupFinalLocationList.innerHTML = "";
    finalLocationPanel.classList.add("hidden");
    cancelMoveButton.classList.add("hidden");
    startMoveButton.classList.remove("hidden");

    hideUnifiedSaveButton();

    lastROs = await getDealerROs();

    renderMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage(
      moveGroup.length > 1 ? "Group move cancelled." : "Move cancelled.",
    );

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
    lastROs = await getDealerROs();

    const freshCurrentRO = lastROs.find((ro) => ro.id === currentRO.id);

    if (!freshCurrentRO) {
      showMessage("Vehicle not found.");
      return;
    }

    const moveGroup = getCurrentMoveGroup(freshCurrentRO);

    for (const ro of moveGroup) {
      await updateRO(
        ro.id,
        {
          moveStatus: "",
          moveStartedAt: null,
          moveStartedBy: "",
          moveStartedByUid: "",
          moveStartedDeviceId: "",

          moveGroupId: "",
          moveGroupTargetId: "",
          moveGroupTargetTag: "",
          moveGroupOrder: null,
        },
        {
          eventType: "vehicle_move_override_cancelled",
          module: "move-locate",
          message: "Vehicle move overridden and cancelled",
        },
      );
    }

    currentMoveGroup = [];
    currentRO = {
      ...freshCurrentRO,
      moveStatus: "",
      moveStartedAt: null,
      moveStartedBy: "",
      moveStartedByUid: "",
      moveStartedDeviceId: "",
      moveGroupId: "",
      moveGroupTargetId: "",
      moveGroupTargetTag: "",
      moveGroupOrder: null,
    };

    lastROs = await getDealerROs();

    resetMoveLocateForm();
    renderMovingVehicles();

    showMessage("Move override cancelled.");
  } catch (error) {
    console.error(error);
    showMessage("Could not override move.");
  }
}

async function takeOverMove() {
  clearMessage();

  if (!currentRO?.id) {
    showMessage("No vehicle selected.");
    return;
  }

  const confirmed = confirm("Take over this move?");

  if (!confirmed) {
    return;
  }

  const session = getSession();
  const startedBy = getSessionUserName();
  const startedByUid = session?.uid || "";
  const deviceId = getDeviceId();

  try {
    lastROs = await getDealerROs();

    const freshCurrentRO = lastROs.find((ro) => ro.id === currentRO.id);

    if (!freshCurrentRO) {
      showMessage("Vehicle not found.");
      return;
    }

    const moveGroup = getCurrentMoveGroup(freshCurrentRO);

    for (const ro of moveGroup) {
      await updateRO(
        ro.id,
        {
          moveStartedBy: startedBy,
          moveStartedByUid: startedByUid,
          moveStartedDeviceId: deviceId,
          moveTakenOverAt: Date.now(),
        },
        {
          eventType: "vehicle_move_taken_over",
          module: "move-locate",
          message: `Move taken over by ${startedBy}`,
        },
      );
    }

    lastROs = await getDealerROs();

    currentRO =
      lastROs.find((ro) => ro.id === freshCurrentRO.id) || freshCurrentRO;

    currentMoveGroup = getCurrentMoveGroup(currentRO);

    finalLocationPanel.classList.remove("hidden");
    cancelMoveButton.classList.remove("hidden");
    overrideCancelMoveButton.classList.add("hidden");

    if (takeOverMoveButton) {
      takeOverMoveButton.classList.add("hidden");
    }

    renderUnifiedMoveCards();
    renderMovingVehicles();
    renderSelectedVehicle(currentRO);

    showMessage("Move taken over.");
  } catch (error) {
    console.error(error);
    showMessage("Could not take over move.");
  }
}

function renderMovingVehicles() {
  const moving = lastROs.filter((ro) => ro.moveStatus === "moving");

  movingVehiclesTableBody.innerHTML = "";

  if (!moving.length) {
    movingVehiclesTableBody.innerHTML = `
      <tr>
        <td colspan="6">No moving vehicles.</td>
      </tr>
    `;
    return;
  }

  moving.forEach((ro) => {
    const row = document.createElement("tr");

    const actionHtml = !isMoveOwner(ro)
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
      <td data-label="Tag">${getROTag(ro)}</td>
      <td data-label="RO">${ro[ROS_FIELDS.roNumber] || ""}</td>
      <td data-label="Current Location">${formatAreaLot(getROArea(ro), getROLot(ro))}</td>
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

function getROArea(ro) {
  return String(ro?.currentLocationArea || ro?.area || "").trim();
}

function getROLot(ro) {
  return String(
    ro?.[ROS_FIELDS.currentLocation] ||
      ro?.currentLocation ||
      ro?.location ||
      "",
  ).trim();
}

function formatAreaLot(area, lot) {
  return [area, lot].filter(Boolean).join(" / ");
}

function findROByTag(tag, ros = []) {
  const cleanTag = normalizeTag(tag);

  return ros.find((ro) => {
    return getROTag(ro) === cleanTag;
  });
}

function buildMoveGroup(ro, ros = []) {
  const blockedByChain = buildBlockedByChain(ro, ros);

  const blockerTagsInMoveOrder = [...blockedByChain].reverse();

  const blockerROs = blockerTagsInMoveOrder
    .map((tag) => findROByTag(tag, ros))
    .filter((item) => item?.id);

  return [...blockerROs, ro];
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

async function saveBlockingRelationship({ blockerRO, blockedTag, area, lot }) {
  const blockerTag = getROTag(blockerRO);
  const cleanBlockedTag = normalizeTag(blockedTag);

  if (!cleanBlockedTag) {
    return;
  }

  if (cleanBlockedTag === blockerTag) {
    throw new Error("A vehicle cannot block itself.");
  }

  const freshROs = await getDealerROs();
  const blockedRO = findROByTag(cleanBlockedTag, freshROs);

  if (!blockedRO?.id) {
    throw new Error(`Blocking tag ${cleanBlockedTag} was not found.`);
  }

  const blockedArea = getROArea(blockedRO);
  const blockedLot = getROLot(blockedRO);

  if (blockedArea && blockedArea !== area) {
    throw new Error(`Blocking tag ${cleanBlockedTag} is not in the same area.`);
  }

  if (blockedLot && blockedLot !== lot) {
    throw new Error(`Blocking tag ${cleanBlockedTag} is not in the same lot.`);
  }

  const blockerChain = buildBlockedByChain(blockerRO, freshROs);

  if (blockerChain.includes(cleanBlockedTag)) {
    throw new Error("This would create a circular blocking chain.");
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

async function clearCarsBlockedByTag(tag) {
  const currentTag = normalizeTag(tag);

  if (!currentTag) {
    return;
  }

  const freshROs = await getDealerROs();

  const blockedCars = freshROs.filter((ro) => {
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

  lastROs = await getDealerROs();
}

function hasUnsavedOwnedMove() {
  return currentMoveGroup.some((ro) => isMoving(ro) && isMoveOwner(ro));
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
  currentMoveGroup = [];

  vehicleSearchInput.value = "";

  vehicleResultCard.classList.add("hidden");
  vehicleDetailsPanel.classList.add("hidden");
  moveChainPanel.classList.add("hidden");
  finalLocationPanel.classList.add("hidden");

  cancelMoveButton.classList.add("hidden");
  overrideCancelMoveButton.classList.add("hidden");

  if (takeOverMoveButton) {
    takeOverMoveButton.classList.add("hidden");
  }

  startMoveButton.classList.remove("hidden");

  groupFinalLocationList.innerHTML = "";

  hideOldSingleSaveUi();
  hideUnifiedSaveButton();

  if (moveAreaSelect) {
    moveAreaSelect.value = "";
  }

  if (finalLocationSelect) {
    finalLocationSelect.innerHTML = `<option value="">Select area first...</option>`;
  }

  if (blocksTagInput) {
    blocksTagInput.value = "";
  }
}

function renderParkingAvailability() {
  if (!parkingAvailabilityList) {
    return;
  }

  parkingAvailabilityList.innerHTML = "";

  const locations = Object.values(groupedLocations)
    .flat()
    .map((location) => {
      const area = String(location.area || "").trim();
      const lot = String(location.label || "").trim();
      const capacity = Number(location.capacity || 0);

      const used = lastROs.filter((ro) => {
        return getROArea(ro) === area && getROLot(ro) === lot;
      }).length;

      const available = Math.max(capacity - used, 0);

      return {
        location,
        lot,
        available,
      };
    })
    .sort((a, b) => b.available - a.available);

  locations.forEach((itemData) => {
    const item = document.createElement("div");

    item.className =
      itemData.available > 0
        ? "parking-availability-item"
        : "parking-availability-item parking-full";

    item.innerHTML = `
      <span class="parking-availability-label">
        ${escapeHtml(itemData.lot)}
      </span>

      <span class="parking-availability-count">
        ${itemData.available}
      </span>
    `;

    parkingAvailabilityList.appendChild(item);
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

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message) {
  moveLocateMessage.textContent = message;
}

function clearMessage() {
  moveLocateMessage.textContent = "";
}
