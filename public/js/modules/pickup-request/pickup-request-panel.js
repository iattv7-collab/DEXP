// public/js/modules/pickup-request/pickup-request-panel.js
// Advisor Request Pickup: search popup + floating panel for the creator only.

import { getSession } from "/js/core/session.js";
import { getActiveRequestTypes } from "/js/services/firestore/request-types-service.js";
import {
  createRequest,
  completeRequest,
  watchActiveRequests,
} from "/js/services/firestore/requests-service.js";
import {
  findActiveROByNumber,
  findActiveROByTag,
  updateRO,
} from "/js/services/firestore/ros-service.js";

const POS_KEY_PREFIX = "dexp_pickup_panel_pos_";
let started = false;
let unsubscribe = null;
let currentRows = [];
let pickupTypeCache = null;

export function initPickupRequestPanel() {
  if (started) return;
  const session = getSession();
  if (!session?.uid || session.role !== "advisor") return;

  started = true;
  ensureStyles();
  ensurePanel();
  restorePosition();

  unsubscribe = watchActiveRequests((rows) => {
    const mine = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.requestedByUid === session.uid)
      .filter((row) => isPickupRequest(row))
      .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0));

    currentRows = mine;
    renderPanelRows();
  });
}

export function openPickupSearch() {
  const existing = document.getElementById("dexpPickupSearch");
  if (existing) {
    existing.querySelector("input")?.focus();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "dexpPickupSearch";
  overlay.className = "dexp-pickup-search-overlay";
  overlay.innerHTML = `
    <div class="dexp-pickup-search-card" role="dialog" aria-label="Request Pickup">
      <div class="dexp-pickup-search-title">Request Pickup</div>
      <label class="dexp-pickup-search-label" for="dexpPickupSearchInput">RO or Tag</label>
      <input id="dexpPickupSearchInput" type="text" placeholder="Type RO or tag..." autocomplete="off" />
      <button id="dexpPickupSearchBtn" type="button" class="dexp-pickup-primary">Search</button>
      <div id="dexpPickupSearchResult" class="dexp-pickup-search-result"></div>
      <button id="dexpPickupSearchClose" type="button" class="dexp-pickup-ghost">Close</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#dexpPickupSearchInput");
  const result = overlay.querySelector("#dexpPickupSearchResult");
  let found = null;

  function close() {
    overlay.remove();
  }

  overlay.querySelector("#dexpPickupSearchClose").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  async function runSearch() {
    const queryText = String(input.value || "").trim();
    if (!queryText) {
      result.innerHTML = `<div class="dexp-pickup-msg">Type an RO or tag.</div>`;
      return;
    }

    result.innerHTML = `<div class="dexp-pickup-msg">Searching...</div>`;
    found = null;

    try {
      const ro = await findVehicle(queryText);
      if (!ro) {
        result.innerHTML = `<div class="dexp-pickup-msg">No active RO found.</div>`;
        return;
      }
      if (ro.pickedUpAtMs) {
        result.innerHTML = `<div class="dexp-pickup-msg">This car is already picked up.</div>`;
        return;
      }
      found = ro;
      result.innerHTML = renderFoundRow(ro);
      result.querySelector("[data-create]")?.addEventListener("click", () => {
        createFromFound(ro, close);
      });
    } catch (error) {
      result.innerHTML = `<div class="dexp-pickup-msg">${escapeHtml(error?.message || "Search failed.")}</div>`;
    }
  }

  overlay.querySelector("#dexpPickupSearchBtn").addEventListener("click", runSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (found) {
      createFromFound(found, close);
      return;
    }
    runSearch();
  });

  input.focus();
}

async function createFromFound(ro, close) {
  const button = document.querySelector("#dexpPickupSearchResult [data-create]");
  if (button) button.disabled = true;

  try {
    const pickupType = await getPickupType();
    if (!pickupType) {
      alert("No request type is marked Use for pickup. Set that in Admin.");
      if (button) button.disabled = false;
      return;
    }

    const session = getSession();
    const tagNumber = ro.tagNumber || ro.tag || "";
    const roNumber = ro.roNumber || ro.ro || "";
    const vehicle = vehicleLabel(ro);

    await createRequest({
      roId: ro.id || "",
      roNumber,
      tagNumber,
      vinLast8: ro.vinLast8 || "",
      requestType: pickupType.requestType,
      sourceModule: "pickup-request",
      targetGroupId: pickupType.targetGroupId,
      targetGroupName: pickupType.targetGroupName || "",
      title: pickupType.name || "Customer pickup",
      message:
        pickupType.defaultMessage ||
        `RO ${roNumber || "N/A"} • Tag ${tagNumber || "N/A"}`,
      route: "/pages/pickup-finish/index.html",
      routeParams: {
        tagNumber,
        title: pickupType.name || "Customer pickup",
      },
      customerName: ro.customerName || "",
      vehicleLabel: vehicle,
    });

    await updateRO(
      ro.id,
      {
        pickupStatus: "requested",
        pickupRequestedAtMs: Date.now(),
        pickupRequestedBy: session?.uid || "",
        pickupRequestedByName: session?.displayName || session?.email || "",
      },
      {
        module: "pickup-request",
        eventType: "pickup_requested",
        message: "Pickup requested",
      },
    );

    close();
    const panel = document.getElementById("dexpPickupPanel");
    if (panel) panel.hidden = false;
  } catch (error) {
    alert(error?.message || "Could not create pickup request.");
    if (button) button.disabled = false;
  }
}

async function markPickedUp(row) {
  const confirmed = confirm(
    `Mark RO ${row.roNumber || ""} / Tag ${row.tagNumber || ""} as picked up?`,
  );
  if (!confirmed) return;

  const session = getSession();

  try {
    if (row.roId) {
      await updateRO(
        row.roId,
        {
          pickedUpAtMs: Date.now(),
          pickedUpBy: session?.uid || "",
          pickedUpByName: session?.displayName || "",
          pickedUpByRole: session?.role || "",
          pickupStatus: "",
          pickupRequestedAtMs: null,
          pickupRequestedBy: "",
          pickupRequestedByName: "",
        },
        {
          module: "pickup-request",
          eventType: "picked_up_updated",
          message: "Customer picked up",
        },
      );
    }

    await completeRequest(row.id);
  } catch (error) {
    alert(error?.message || "Could not mark picked up.");
  }
}

function ensurePanel() {
  if (document.getElementById("dexpPickupPanel")) return;

  const panel = document.createElement("div");
  panel.id = "dexpPickupPanel";
  panel.className = "dexp-pickup-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="dexp-pickup-panel-title" data-drag-handle>
      Pickups
    </div>
    <div id="dexpPickupPanelRows" class="dexp-pickup-panel-rows"></div>
  `;
  document.body.appendChild(panel);
  makeDraggable(panel);
}

function renderPanelRows() {
  const panel = document.getElementById("dexpPickupPanel");
  const host = document.getElementById("dexpPickupPanelRows");
  if (!panel || !host) return;

  if (!currentRows.length) {
    panel.hidden = true;
    host.innerHTML = "";
    return;
  }

  panel.hidden = false;
  host.innerHTML = currentRows.map((row) => renderPanelRow(row)).join("");

  host.querySelectorAll("[data-picked-up]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-picked-up");
      const row = currentRows.find((item) => item.id === id);
      if (row) markPickedUp(row);
    });
  });
}

function renderPanelRow(row) {
  const waiting = String(row.status || "") !== "in_progress";
  const cls = waiting ? "is-waiting" : "is-progress";
  const vehicle = row.vehicleLabel || "";
  const customer = row.customerName || "";

  return `
    <div class="dexp-pickup-row ${cls}">
      <div class="dexp-pickup-cell">
        <span>RO</span>
        <strong>${escapeHtml(row.roNumber || "")}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Tag</span>
        <strong>${escapeHtml(row.tagNumber || "")}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Vehicle</span>
        <strong>${escapeHtml(vehicle)}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Customer</span>
        <strong>${escapeHtml(customer)}</strong>
      </div>
      <button type="button" class="dexp-pickup-primary dexp-pickup-short" data-picked-up="${escapeHtml(row.id)}">
        Picked up
      </button>
    </div>
  `;
}

function renderFoundRow(ro) {
  return `
    <div class="dexp-pickup-row is-found">
      <div class="dexp-pickup-cell">
        <span>RO</span>
        <strong>${escapeHtml(ro.roNumber || "")}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Tag</span>
        <strong>${escapeHtml(ro.tagNumber || "")}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Vehicle</span>
        <strong>${escapeHtml(vehicleLabel(ro))}</strong>
      </div>
      <div class="dexp-pickup-cell">
        <span>Customer</span>
        <strong>${escapeHtml(ro.customerName || "")}</strong>
      </div>
      <button type="button" class="dexp-pickup-primary dexp-pickup-short" data-create="true">
        Create
      </button>
    </div>
  `;
}

function makeDraggable(panel) {
  const handle = panel.querySelector("[data-drag-handle]");
  if (!handle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function point(event) {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }

  function onDown(event) {
    dragging = true;
    const p = point(event);
    const rect = panel.getBoundingClientRect();
    startX = p.x;
    startY = p.y;
    originX = rect.left;
    originY = rect.top;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.left = `${originX}px`;
    panel.style.top = `${originY}px`;
  }

  function onMove(event) {
    if (!dragging) return;
    const p = point(event);
    const left = Math.max(8, originX + (p.x - startX));
    const top = Math.max(8, originY + (p.y - startY));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    savePosition(panel);
  }

  handle.addEventListener("mousedown", onDown);
  handle.addEventListener("touchstart", onDown, { passive: true });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
}

function savePosition(panel) {
  const session = getSession();
  if (!session?.uid) return;
  const rect = panel.getBoundingClientRect();
  localStorage.setItem(
    POS_KEY_PREFIX + session.uid,
    JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }),
  );
}

function restorePosition() {
  const session = getSession();
  const panel = document.getElementById("dexpPickupPanel");
  if (!session?.uid || !panel) return;

  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY_PREFIX + session.uid) || "null");
    if (!saved || typeof saved.left !== "number" || typeof saved.top !== "number") return;
    panel.style.right = "auto";
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
  } catch {
    // ignore bad saved position
  }
}

async function findVehicle(queryText) {
  const value = String(queryText || "").trim();
  if (!value) return null;

  const byRo = await findActiveROByNumber(value);
  if (byRo && String(byRo.status || "").toLowerCase() !== "archived") return byRo;

  const byTag = await findActiveROByTag(value);
  if (byTag && String(byTag.status || "").toLowerCase() !== "archived") return byTag;

  return null;
}

async function getPickupType() {
  if (pickupTypeCache) return pickupTypeCache;
  const types = await getActiveRequestTypes();
  pickupTypeCache = types.find((item) => item.useForPickup === true) || null;
  return pickupTypeCache;
}

function isPickupRequest(row) {
  if (pickupTypeCache && row.requestType === pickupTypeCache.requestType) return true;
  const title = String(row.title || "").toLowerCase();
  return title.includes("pickup") || title.includes("pick up");
}

function vehicleLabel(ro) {
  return [ro.year, ro.make, ro.model].filter(Boolean).join(" ").trim();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function ensureStyles() {
  if (document.getElementById("dexpPickupRequestStyles")) return;
  const style = document.createElement("style");
  style.id = "dexpPickupRequestStyles";
  style.textContent = `
    .dexp-pickup-search-overlay {
      position: fixed;
      inset: 0;
      z-index: 10020;
      background: rgba(15, 23, 42, 0.35);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 72px 16px 16px;
    }
    .dexp-pickup-search-card {
      width: min(720px, 100%);
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 16px 40px rgba(0,0,0,.18);
      padding: 16px;
    }
    .dexp-pickup-search-title,
    .dexp-pickup-panel-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .dexp-pickup-search-label {
      display: block;
      font-size: 13px;
      color: #475569;
      margin-bottom: 6px;
    }
    .dexp-pickup-search-card input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 15px;
      margin-bottom: 10px;
    }
    .dexp-pickup-primary {
      border: 0;
      background: #2563eb;
      color: #fff;
      border-radius: 8px;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
    }
    .dexp-pickup-short {
      padding: 8px 12px;
      white-space: nowrap;
    }
    .dexp-pickup-ghost {
      margin-top: 10px;
      background: transparent;
      border: 0;
      color: #475569;
      cursor: pointer;
    }
    .dexp-pickup-msg {
      margin-top: 10px;
      color: #334155;
      font-size: 14px;
    }
    .dexp-pickup-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 10px;
      padding: 10px;
      border-radius: 10px;
      background: #f8fafc;
    }
    .dexp-pickup-row.is-waiting { background: #fee2e2; }
    .dexp-pickup-row.is-progress { background: #dcfce7; }
    .dexp-pickup-cell {
      min-width: 70px;
      flex: 1;
    }
    .dexp-pickup-cell span {
      display: block;
      font-size: 11px;
      color: #64748b;
    }
    .dexp-pickup-cell strong {
      font-size: 14px;
      color: #0f172a;
    }
    .dexp-pickup-panel {
      position: fixed;
      z-index: 10010;
      top: 72px;
      right: 16px;
      width: min(720px, calc(100vw - 24px));
      background: #fff;
      border-radius: 14px;
      box-shadow: 0 16px 40px rgba(0,0,0,.18);
      padding: 12px;
    }
    .dexp-pickup-panel-title {
      cursor: move;
      user-select: none;
    }
  `;
  document.head.appendChild(style);
}