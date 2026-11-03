// public/pages/move-locate/move-locate-lot-list.js

let getROs = () => [];
let helpers = {};
let onUpdateLocation = () => {};
let lotListArea = "";
let lotListLot = "";
let lotListSearch = "";
let openedFromLotList = false;

export function initLotTagList(options = {}) {
  getROs = options.getROs || getROs;
  helpers = options.helpers || {};
  onUpdateLocation = options.onUpdateLocation || onUpdateLocation;

  document.getElementById("lotTagListBack")?.addEventListener("click", hideLotTagList);

  document.getElementById("moveSearchBackButton")?.addEventListener("click", (event) => {
    if (!openedFromLotList) return;
    event.stopImmediatePropagation();
    returnToLotList();
  }, true);

  document.getElementById("lotTagListBody")?.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-ro-id]");
    if (!row) return;
    const now = Date.now();
    const last = Number(row.dataset.lastTap || 0);
    if (now - last < 400) {
      row.dataset.lastTap = "0";
      const ro = getROs().find((item) => item.id === row.dataset.roId);
      if (ro) openUpdateFromLotList(ro);
      return;
    }
    row.dataset.lastTap = String(now);
  });
}

function hideMoveSearchChrome() {
  document.querySelector(".move-card-header")?.classList.add("hidden");
  document.querySelector(".move-search-row")?.classList.add("hidden");
  document.getElementById("moveSecondaryActions")?.classList.add("hidden");
  document.getElementById("addTagButton")?.classList.add("hidden");
}

function showMoveSearchChrome() {
  document.querySelector(".move-card-header")?.classList.remove("hidden");
  document.querySelector(".move-search-row")?.classList.remove("hidden");
  document.getElementById("moveSecondaryActions")?.classList.remove("hidden");
  document.getElementById("addTagButton")?.classList.remove("hidden");
}

function prefillUpdateLocation(ro) {
  const areaSelect = document.getElementById("updateLocationAreaSelect");
  const lotSelect = document.getElementById("updateLocationLotSelect");
  const blocking = document.getElementById("updateLocationBlockingInput");
  const save = document.getElementById("saveUpdatedLocationButton");
  const area = helpers.getROArea?.(ro) || "";
  const lot = helpers.getROLot?.(ro) || "";

  if (areaSelect && area) {
    areaSelect.value = area;
    areaSelect.dispatchEvent(new Event("change"));
  }
  if (lotSelect && lot) lotSelect.value = lot;
  if (blocking) blocking.value = ro.blockedByTag || "";
  if (save) save.disabled = !lotSelect?.value;
}

export function openUpdateFromLotList(ro) {
  openedFromLotList = true;
  document.getElementById("lotTagListPanel")?.classList.add("hidden");
  document.querySelector(".move-workflow-card")?.classList.remove("hidden");
  hideMoveSearchChrome();
  onUpdateLocation(ro);
  prefillUpdateLocation(ro);
}

export function returnToLotList() {
  openedFromLotList = false;
  showMoveSearchChrome();
  document.querySelector(".move-workflow-card")?.classList.add("hidden");
  openLotTagList(lotListArea, lotListLot);
}

export function openLotTagList(area, lot) {
  openedFromLotList = false;
  showMoveSearchChrome();
  document.getElementById("updateLocationPanel")?.classList.add("hidden");
  lotListArea = String(area || "").trim();
  lotListLot = String(lot || "").trim();
  lotListSearch = "";
  const input = document.getElementById("lotTagSearchInput");
  if (input) input.value = "";
  document.querySelector(".move-workflow-card")?.classList.add("hidden");
  document.getElementById("lotTagListPanel")?.classList.remove("hidden");
  renderLotTagList();
}

export function hideLotTagList() {
  lotListArea = "";
  lotListLot = "";
  lotListSearch = "";
  document.getElementById("lotTagListPanel")?.classList.add("hidden");
  document.querySelector(".move-workflow-card")?.classList.remove("hidden");
}

export function refreshLotTagList() {
  if (lotListLot) renderLotTagList();
}

function carsInLot() {
  const { getROArea, getROLot } = helpers;
  return getROs().filter((ro) => {
    return getROArea(ro) === lotListArea && getROLot(ro) === lotListLot;
  });
}

function blockingTagFor(ro) {
  const { getROTag, normalizeTag } = helpers;
  const tag = getROTag(ro);
  if (!tag) return "";
  const other = getROs().find((item) => {
    return item.id !== ro.id && normalizeTag(item.blockedByTag) === tag;
  });
  return other ? getROTag(other) : "";
}

function renderLotTagList() {
  const { getROTag, getROArea, getROLot, normalizeTag, formatAreaLot, escapeHtml } = helpers;
  const title = document.getElementById("lotTagListTitle");
  const body = document.getElementById("lotTagListBody");
  if (!body) return;
  if (title) title.textContent = lotListLot || "Lot";

  const q = lotListSearch.trim().toUpperCase();
  const rows = carsInLot().filter((ro) => {
    if (!q) return true;
    const tag = getROTag(ro);
    const blocked = normalizeTag(ro.blockedByTag);
    const blocking = blockingTagFor(ro);
    return tag.includes(q) || blocked.includes(q) || blocking.includes(q);
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4">${q ? "No tags match." : "No tags in this lot."}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((ro) => {
    const tag = getROTag(ro) || "—";
    const where = formatAreaLot(getROArea(ro), getROLot(ro)) || "—";
    const blocked = normalizeTag(ro.blockedByTag) || "—";
    const blocking = blockingTagFor(ro) || "—";
    return `<tr data-ro-id="${escapeHtml(ro.id || "")}">
      <td>${escapeHtml(tag)}</td>
      <td>${escapeHtml(where)}</td>
      <td>${escapeHtml(blocked)}</td>
      <td>${escapeHtml(blocking)}</td>
    </tr>`;
  }).join("");
}