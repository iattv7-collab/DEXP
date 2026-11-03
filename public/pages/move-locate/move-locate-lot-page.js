// public/pages/move-locate/move-locate-lot-page.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";
import { watchDealerROs } from "/js/services/firestore/ros-service.js";
import { getActiveLocations, groupLocationsByArea } from "/js/services/firestore/locations-service.js";
import { normalizeTag, formatAreaLabel, formatAreaLot, escapeHtml } from "./move-locate-helpers.js";
import { getROTag, getROArea, getROLot } from "./move-locate-move.js";
import { saveVehicleLocation } from "./move-locate-location.js?v=1";

protectRoute({ allowedModules: [MODULES.MOVE_LOCATE] });

const params = new URLSearchParams(window.location.search);
const pageArea = String(params.get("area") || "").trim();
const pageLot = String(params.get("lot") || "").trim();

let lastROs = [];
let groupedLocations = {};
let currentRO = null;
let searchText = "";

window.addEventListener("dexp-session-ready", init);

function init() {
  renderAppHeader({ title: pageLot || "Lot" });
  document.getElementById("lotTagListTitle").textContent = pageLot || "Lot";
  document.getElementById("lotTagListBack")?.addEventListener("click", () => {
    window.location.href = "/pages/move-locate/move-locate.html";
  });
  document.getElementById("lotTagSearchInput")?.addEventListener("input", (event) => {
    searchText = String(event.target.value || "");
    renderList();
  });
  document.getElementById("lotTagListBody")?.addEventListener("click", onRowClick);
  document.getElementById("lotUpdateBack")?.addEventListener("click", showList);
  document.getElementById("lotUpdateAreaSelect")?.addEventListener("change", fillLots);
  document.getElementById("lotUpdateLotSelect")?.addEventListener("change", () => {
    document.getElementById("lotUpdateBlockingInput").value = "";
    document.getElementById("lotUpdateSaveButton").disabled = !document.getElementById("lotUpdateLotSelect").value;
  });
  document.getElementById("lotUpdateSaveButton")?.addEventListener("click", saveLocation);
  loadLocations();
  watchDealerROs((ros) => {
    lastROs = ros || [];
    renderList();
  });
}

async function loadLocations() {
  const locations = await getActiveLocations();
  groupedLocations = groupLocationsByArea(locations);
  const areaSelect = document.getElementById("lotUpdateAreaSelect");
  areaSelect.innerHTML = `<option value="">Select area...</option>`;
  Object.keys(groupedLocations).forEach((area) => {
    const option = document.createElement("option");
    option.value = area;
    option.textContent = formatAreaLabel(area);
    areaSelect.appendChild(option);
  });
}

function carsInLot() {
  return lastROs.filter((ro) => getROArea(ro) === pageArea && getROLot(ro) === pageLot);
}

function blockingTagFor(ro) {
  const tag = getROTag(ro);
  if (!tag) return "";
  const other = lastROs.find((item) => item.id !== ro.id && normalizeTag(item.blockedByTag) === tag);
  return other ? getROTag(other) : "";
}

function renderList() {
  const body = document.getElementById("lotTagListBody");
  const q = searchText.trim().toUpperCase();
  const rows = carsInLot().filter((ro) => {
    if (!q) return true;
    return getROTag(ro).includes(q) || normalizeTag(ro.blockedByTag).includes(q) || blockingTagFor(ro).includes(q);
  });
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3">${q ? "No tags match." : "No tags in this lot."}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((ro) => `<tr data-ro-id="${escapeHtml(ro.id || "")}">
    <td>${escapeHtml(getROTag(ro) || "—")}</td>
    <td>${escapeHtml(formatAreaLot(getROArea(ro), getROLot(ro)) || "—")}</td>
    <td>${escapeHtml(blockingTagFor(ro) || "—")}</td>
  </tr>`).join("");
}

function onRowClick(event) {
  const row = event.target.closest("tr[data-ro-id]");
  if (!row) return;
  const now = Date.now();
  const last = Number(row.dataset.lastTap || 0);
  if (now - last >= 400) {
    row.dataset.lastTap = String(now);
    return;
  }
  row.dataset.lastTap = "0";
  const ro = lastROs.find((item) => item.id === row.dataset.roId);
  if (ro) openUpdate(ro);
}

function openUpdate(ro) {
  currentRO = ro;
  document.getElementById("lotTagListPanel").classList.add("hidden");
  document.getElementById("lotUpdatePanel").classList.remove("hidden");
  const blockedBy = normalizeTag(ro.blockedByTag);
  document.getElementById("lotUpdateVehicleLine").textContent =
    `Tag ${getROTag(ro) || "—"} · RO ${ro[ROS_FIELDS.roNumber] || "—"} · ${formatAreaLot(getROArea(ro), getROLot(ro)) || "No location"}` +
    (blockedBy ? ` · Blocked by ${blockedBy}` : "");
  const areaSelect = document.getElementById("lotUpdateAreaSelect");
  areaSelect.value = getROArea(ro);
  fillLots();
  document.getElementById("lotUpdateLotSelect").value = getROLot(ro);
  document.getElementById("lotUpdateBlockingInput").value = blockingTagFor(ro) || "";
  document.getElementById("lotUpdateSaveButton").disabled = !getROLot(ro);
  setMsg("");
}

function showList() {
  currentRO = null;
  document.getElementById("lotUpdatePanel").classList.add("hidden");
  document.getElementById("lotTagListPanel").classList.remove("hidden");
  renderList();
}

function fillLots() {
  const area = document.getElementById("lotUpdateAreaSelect").value;
  const lotSelect = document.getElementById("lotUpdateLotSelect");
  lotSelect.innerHTML = `<option value="">Select lot...</option>`;
  (groupedLocations[area] || []).forEach((lot) => {
    const option = document.createElement("option");
    option.value = lot.label;
    option.textContent = lot.label;
    lotSelect.appendChild(option);
  });
}

function setMsg(text) {
  document.getElementById("lotUpdateMessage").textContent = text || "";
}

async function saveLocation() {
  if (!currentRO?.id) return;
  const area = document.getElementById("lotUpdateAreaSelect").value.trim();
  const lot = document.getElementById("lotUpdateLotSelect").value.trim();
  const blockingTag = normalizeTag(document.getElementById("lotUpdateBlockingInput").value);
  if (!area || !lot) {
    setMsg("Select the area and lot.");
    return;
  }
  if (blockingTag && blockingTag === getROTag(currentRO)) {
    setMsg("A vehicle cannot block itself.");
    return;
  }
  const save = document.getElementById("lotUpdateSaveButton");
  save.disabled = true;
  try {
    await saveVehicleLocation({
      ro: currentRO,
      area,
      lot,
      blockingTag,
    });
    window.location.href = `/pages/move-locate/move-locate-lot.html?area=${encodeURIComponent(area)}&lot=${encodeURIComponent(lot)}`;
  } catch (error) {
    setMsg(error?.message || "Could not save location.");
    save.disabled = false;
  }
}