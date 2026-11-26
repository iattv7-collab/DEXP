// public/pages/move-locate/move-locate-simple.js
// Parallel simplified Move & Locate. Does not touch the existing page.

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";
import {
  getDealerROs,
  findActiveROByTag,
  findActiveROByNumber,
  updateRO,
} from "/js/services/firestore/ros-service.js";
import {
  getActiveLocations,
  groupLocationsByArea,
} from "/js/services/firestore/locations-service.js";
import { saveVehicleLocation } from "./move-locate-location.js?v=1";
import {
  normalizeTag,
  formatAreaLabel,
  formatAreaLot,
} from "./move-locate-helpers.js";
import { getROTag, getROArea, getROLot, findROByTag } from "./move-locate-move.js";
import {
  completeRequest,
  releaseRequestInProgress,
} from "/js/services/firestore/requests-service.js";
import {
  resolveNotificationRequest,
  releaseNotificationRequest,
} from "/js/services/firestore/notification-requests-service.js";

protectRoute({ allowedModules: [MODULES.MOVE_LOCATE] });

const searchInput = document.getElementById("simpleSearchInput");
const searchButton = document.getElementById("simpleSearchButton");
const messageEl = document.getElementById("simpleMessage");
const resultEl = document.getElementById("simpleResult");
const tagEl = document.getElementById("simpleTag");
const roEl = document.getElementById("simpleRO");
const locationEl = document.getElementById("simpleLocation");
const toLineEl = document.getElementById("simpleToLine");
const detailsToggle = document.getElementById("simpleDetailsToggle");
const detailsEl = document.getElementById("simpleDetails");
const customerEl = document.getElementById("simpleCustomer");
const vinEl = document.getElementById("simpleVIN");
const vehicleEl = document.getElementById("simpleVehicle");
const advisorEl = document.getElementById("simpleAdvisor");
const areaSelect = document.getElementById("simpleAreaSelect");
const lotSelect = document.getElementById("simpleLotSelect");
const blockingInput = document.getElementById("simpleBlockingInput");
const finishButton = document.getElementById("simpleFinishButton");
const cancelButton = document.getElementById("simpleCancelButton");

let currentRO = null;
let groupedLocations = {};
let lastROs = [];
let blockingEligible = true;
let activeRequestId = "";
let activeNotificationId = "";

window.addEventListener("dexp-session-ready", init);

function init() {
  renderAppHeader({ title: "Move & Locate" });
  loadLocations();
  loadROs();
  wireEvents();
  loadRouteParams();
}

function wireEvents() {
  searchInput.addEventListener("input", () => {
    searchButton.disabled = !searchInput.value.trim();
    clearMessage();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") findVehicle();
  });
  searchButton.addEventListener("click", findVehicle);
  detailsToggle.addEventListener("click", () => {
    detailsEl.classList.toggle("hidden");
  });
  areaSelect.addEventListener("change", () => {
    fillLots();
    resetBlocking();
    updateFinishState();
  });
  lotSelect.addEventListener("change", () => {
    resetBlocking();
    updateFinishState();
  });
  blockingInput.addEventListener("input", onBlockingInput);
  finishButton.addEventListener("click", handleFinish);
  cancelButton.addEventListener("click", handleCancel);
}

async function loadLocations() {
  try {
    const locations = await getActiveLocations();
    groupedLocations = groupLocationsByArea(locations);
    fillAreas();
  } catch (err) {
    showMessage("Could not load locations.");
  }
}

async function loadROs() {
  try {
    lastROs = await getDealerROs();
  } catch (err) {
    console.error(err);
  }
}

function fillAreas() {
  areaSelect.innerHTML = '<option value="">Select area...</option>';
  Object.keys(groupedLocations).forEach((area) => {
    const opt = document.createElement("option");
    opt.value = area;
    opt.textContent = formatAreaLabel(area);
    areaSelect.appendChild(opt);
  });
}

function fillLots() {
  const area = areaSelect.value;
  lotSelect.innerHTML = '<option value="">Select lot...</option>';
  if (!area) return;
  (groupedLocations[area] || []).forEach((lot) => {
    const opt = document.createElement("option");
    opt.value = lot.label;
    opt.textContent = lot.label;
    opt.dataset.remote = lot.remote === true ? "1" : "";
    lotSelect.appendChild(opt);
  });
}

function selectedLotIsRemote() {
  const opt = lotSelect.selectedOptions?.[0];
  return opt?.dataset.remote === "1";
}

function isWashRequest() {
  const title = String(currentRO?.activeRequestTitle || "").toLowerCase();
  const type = String(currentRO?.activeRequestType || "").toLowerCase();
  return title.includes("wash") || type.includes("wash");
}

async function findVehicle() {
  const raw = searchInput.value.trim();
  if (!raw) return;
  clearMessage();
  resultEl.classList.add("hidden");
  currentRO = null;

  const tag = normalizeTag(raw);
  let ro = await findActiveROByTag(tag);
  if (!ro) ro = await findActiveROByNumber(raw);

  if (!ro) {
    showMessage("No active RO found.");
    return;
  }

  currentRO = ro;
  renderResult(ro);
  resultEl.classList.remove("hidden");
  updateFinishState();
}

function renderResult(ro) {
  tagEl.textContent = getROTag(ro) || "—";
  roEl.textContent = ro.roNumber || "—";
  locationEl.textContent = formatAreaLot(getROArea(ro), getROLot(ro)) || "—";

  const to = String(ro.activeRequestTitle || "").trim();
  if (to) {
    toLineEl.textContent = `To: ${to}`;
    toLineEl.classList.remove("hidden");
  } else {
    toLineEl.classList.add("hidden");
  }

  customerEl.textContent = ro.customerName || "";
  vinEl.textContent = ro.vin || "";
  vehicleEl.textContent = ro.vehicle || "";
  advisorEl.textContent = ro.advisorName || "";

  resetBlocking();
}

function resetBlocking() {
  blockingInput.value = "";
  blockingInput.className = "simple-blocking";
  blockingEligible = true;
}

async function onBlockingInput() {
  const raw = normalizeTag(blockingInput.value);
  blockingInput.value = raw;

  if (!raw) {
    blockingInput.className = "simple-blocking";
    blockingEligible = true;
    updateFinishState();
    return;
  }

  blockingInput.className = "simple-blocking checking";
  blockingEligible = false;
  updateFinishState();

  const area = areaSelect.value;
  const lot = lotSelect.value;
  if (!area || !lot) return;

  const fresh = await getDealerROs();
  const blocked = findROByTag(raw, fresh);
  const sameLot = blocked && getROArea(blocked) === area && getROLot(blocked) === lot;
  const self = normalizeTag(getROTag(currentRO)) === raw;

  if (sameLot && !self) {
    blockingInput.className = "simple-blocking eligible";
    blockingEligible = true;
  } else {
    blockingInput.className = "simple-blocking checking";
    blockingEligible = false;
  }
  updateFinishState();
}

function destinationReady() {
  return Boolean(areaSelect.value && lotSelect.value);
}

function updateFinishState() {
  const remoteBlocked = isWashRequest() && selectedLotIsRemote();
  const ready = destinationReady() && blockingEligible && !remoteBlocked;
  finishButton.disabled = !ready;
  if (locationEl) {
    if (remoteBlocked) {
      locationEl.style.background = "#fee2e2";
      locationEl.style.padding = "4px 8px";
      locationEl.style.borderRadius = "6px";
      showMessage("Remote lots are not allowed for wash.");
    } else {
      locationEl.style.background = "";
      locationEl.style.padding = "";
    }
  }
}

async function handleFinish() {
  if (!currentRO || finishButton.disabled) return;
  clearMessage();
  const session = getSession();
  const area = areaSelect.value;
  const lot = lotSelect.value;
  const blocking = normalizeTag(blockingInput.value);

  if (isWashRequest() && selectedLotIsRemote()) {
    showMessage("Remote lots are not allowed for wash.");
    updateFinishState();
    return;
  }

  try {
    if (currentRO.moveStatus !== "moving") {
      await updateRO(currentRO.id, {
        moveStatus: "moving",
        moveStartedByUid: session?.uid || "",
        moveStartedByName: session?.displayName || "",
        moveStartedAtMs: Date.now(),
      });
    }

    await saveVehicleLocation({
      ro: currentRO,
      area,
      lot,
      blockingTag: blocking,
    });

    const requestTitle = String(currentRO.activeRequestTitle || "").toLowerCase();
    const requestType = String(currentRO.activeRequestType || "").toLowerCase();
    const isWashRequest = requestTitle.includes("wash") || requestType.includes("wash");

    const finishUpdates = {
      moveStatus: "",
      moveStartedByUid: "",
      moveStartedByName: "",
      moveStartedAtMs: null,
      activeRequestId: "",
      activeRequestTitle: "",
    };

    if (isWashRequest) {
      const nowMs = Date.now();
      const session = getSession();
      Object.assign(finishUpdates, {
        washStatus: "pending",
        washQueuedAtMs: nowMs,
        washQueuedBy: session?.uid || "",
        washQueuedByName: session?.displayName || session?.email || "",
        priorityType: currentRO.isWaiter || currentRO.customerWaiting ? "waiter" : "normal",
        washWaiterAtMs: currentRO.isWaiter || currentRO.customerWaiting ? nowMs : null,
      });
    }

    await updateRO(currentRO.id, finishUpdates);

    if (activeRequestId) {
      await completeRequest(activeRequestId);
    }
    if (activeNotificationId) {
      await resolveNotificationRequest(activeNotificationId);
    }

    showMessage("Finished.");
    resetForm();
  } catch (err) {
    console.error(err);
    showMessage(err?.message || "Could not finish.");
  }
}

async function handleCancel() {
  if (!currentRO) {
    resetForm();
    return;
  }
  clearMessage();
  try {
    await updateRO(currentRO.id, {
      moveStatus: "",
      moveStartedByUid: "",
      moveStartedByName: "",
      moveStartedAtMs: null,
      activeRequestId: "",
      activeRequestTitle: "",
    });

    if (activeRequestId) {
      await releaseRequestInProgress(activeRequestId);
    }
    if (activeNotificationId) {
      await releaseNotificationRequest(activeNotificationId);
    }
  } catch (err) {
    console.error(err);
  }
  resetForm();
  window.location.href = "/pages/dashboard/index.html";
}

function resetForm() {
  currentRO = null;
  resultEl.classList.add("hidden");
  searchInput.value = "";
  searchButton.disabled = true;
  detailsEl.classList.add("hidden");
  resetBlocking();
  areaSelect.value = "";
  lotSelect.innerHTML = '<option value="">Select lot...</option>';
  updateFinishState();
}

function loadRouteParams() {
  const params = new URLSearchParams(window.location.search);
  const tag = String(params.get("tagNumber") || "").trim();
  activeRequestId = String(params.get("requestId") || "").trim();
  activeNotificationId = String(params.get("notificationId") || "").trim();
  if (tag) {
    searchInput.value = tag;
    searchButton.disabled = false;
    setTimeout(findVehicle, 300);
  }
}

function showMessage(text) {
  messageEl.textContent = text;
}
function clearMessage() {
  messageEl.textContent = "";
}