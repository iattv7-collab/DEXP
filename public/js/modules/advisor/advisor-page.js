// ======================================================
// FILE: /public/js/modules/advisor/advisor-page.js
// MODULE: Advisor
// PURPOSE:
// Advisor operational view for all current open DEXP ROs.
//
// VIEW OPTIONS:
// - My ROs
// - All ROs
// - Selected advisor
//
// EXISTING ACTIONS PRESERVED:
// - Request pickup
// - Request rewash
// - Mark CP booked
// - Mark warranty booked
// - Request QC
// - Mark no QC required
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";

import { getSession, hasPermission } from "/js/core/session.js";

import { PERMISSIONS } from "/js/config/permissions.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  arrayUnion,
  doc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { watchDealerROs } from "/js/services/firestore/ros-service.js";
import { renderLoanerDaysCard } from "/js/modules/loaners/loaner-days.js";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { pickDateTimeMs } from "/js/shared/date-time-picker.js";

import { getWashSettings } from "/js/services/firestore/wash-settings-service.js";

import {
  canAcceptNeedBy,
  projectWashQueue,
} from "/js/services/firestore/wash-capacity-service.js";

import {
  markCpBooked,
  markWarrantyBooked,
  clearCpBooked,
  clearWarrantyBooked,
} from "/js/modules/shared/booking-actions-service.js";

import {
  requestQc,
  markNoQcRequired,
  clearQcDecision,
} from "/js/modules/shared/qc-actions-service.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["advisor"],
  });

  renderAppHeader();

  const session = await waitForSession();

  const canRequestPickup = hasPermission(PERMISSIONS.PICKUP_REQUEST);

  const canRequestRewash = hasPermission(PERMISSIONS.WASH_REWASH_REQUEST);

  const canMarkCp = hasPermission(PERMISSIONS.BOOKING_CP_MARK);
  const canClearCp = canMarkCp;

  const canMarkWty = hasPermission(PERMISSIONS.BOOKING_WTY_MARK);
  const canClearWty = canMarkWty;

  const canRequestQc = hasPermission(PERMISSIONS.QC_REQUEST);

  const canMarkNoQc = hasPermission(PERMISSIONS.QC_NO_QC);

  const canSetNeedBy = hasPermission(PERMISSIONS.WASH_NEED_BY_SET);

  const tableEl = $("ticketsTable");
  const advisorColumnsButton = $("advisorColumnsButton");

  const ADVISOR_COLUMNS = [
    { key: "tag", label: "Tag" },
    { key: "ro", label: "RO" },
    { key: "customer", label: "Customer" },
    { key: "model", label: "Model" },
    { key: "advisor", label: "Advisor" },
    { key: "location", label: "Location" },
    { key: "status", label: "RO Status" },
    { key: "qc", label: "QC" },
    { key: "requestQc", label: "QC Action" },
    { key: "cp", label: "CP Booked" },
    { key: "wty", label: "WTY Booked" },
    { key: "needBy", label: "Need By" },
    { key: "projected", label: "Projected" },
    { key: "wash", label: "Wash" },
    { key: "rewash", label: "Rewash" },
    { key: "washed", label: "Washed" },
    { key: "pickup", label: "Pickup Status" },
    { key: "requestPickup", label: "Request Pickup" },
  ];

  const advisorColumnStorageKey = `dexp_advisor_columns_${session?.uid || "local"}`;
  let visibleAdvisorColumns = loadAdvisorColumns();

  function loadAdvisorColumns() {
    try {
      const saved = JSON.parse(localStorage.getItem(advisorColumnStorageKey) || "[]");
      const allowed = new Set(ADVISOR_COLUMNS.map((column) => column.key));
      const clean = Array.isArray(saved)
        ? saved.filter((key) => allowed.has(key))
        : [];

      return clean.length
        ? ADVISOR_COLUMNS.map((column) => column.key).filter((key) =>
            clean.includes(key),
          )
        : ADVISOR_COLUMNS.map((column) => column.key);
    } catch (error) {
      return ADVISOR_COLUMNS.map((column) => column.key);
    }
  }

  function saveAdvisorColumns(keys) {
    localStorage.setItem(advisorColumnStorageKey, JSON.stringify(keys));
    visibleAdvisorColumns = keys;
  }

  advisorColumnsButton?.addEventListener("click", openAdvisorColumns);
  const msgEl = $("msg");
  const searchEl = $("searchInput");

  const myRosButton = $("myRosBtn");
  const allRosButton = $("allRosBtn");
  const advisorFilterEl = $("advisorFilter");
  const advisorViewLabel = $("advisorViewLabel");

  let rows = [];
  let currentWashSettings = null;
  let projectedById = {};

  let currentView = session?.role === "advisor" ? "mine" : "all";

  let selectedAdvisorId = "";
  let loanerTrips = [];

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function roValue(ticket) {
    return clean(ticket.roNumber || ticket.ro || "");
  }

  function tagValue(ticket) {
    return clean(ticket.tagNumber || ticket.tag || "");
  }

  function advisorIdValue(ticket) {
    return clean(ticket.advisorId);
  }

  function advisorNameValue(ticket) {
    return clean(
      ticket.advisorName ||
        ticket.advisorDisplayName ||
        ticket.advisorEmail ||
        ticket.advisorCompanyId ||
        "",
    );
  }

  function vehicleValue(ticket) {
    return [ticket.year, ticket.make, ticket.model].filter(Boolean).join(" ");
  }

  function fmtTime(value) {
    if (!value) {
      return "";
    }

    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    if (typeof value === "number") {
      return new Date(value).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return "";
  }

  function escapeHtml(value) {
    return String(value || "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[character],
    );
  }

  function auditPatch(fields = []) {
    const user = auth.currentUser;

    return {
      updatedAt: serverTimestamp(),

      updatedByUid: user?.uid || "",

      updatedByName: clean(user?.displayName || ""),

      updatedByEmail: clean(user?.email || ""),

      lastEditedAtMs: Date.now(),
      lastEditedBy: user?.uid || "",
      lastEditedRole: session?.role || "advisor",
      lastEditedFields: fields,
    };
  }

  function washEvent(type) {
    return {
      type,
      atMs: Date.now(),
      by: auth.currentUser?.uid || "",
      role: session?.role || "advisor",
      cycle: "wash",
    };
  }

  async function requestRewash(id) {
    await updateDoc(doc(db, "ros", id), {
      priorityType: "rewash",
      isRewashCycle: true,

      rewashRequestedAtMs: Date.now(),

      rewashRequestedBy: auth.currentUser?.uid || "",

      washStatus: "rewash_requested",

      washEvents: arrayUnion(washEvent("rewash_requested")),

      ...auditPatch([
        "priorityType",
        "isRewashCycle",
        "rewashRequestedAtMs",
        "rewashRequestedBy",
        "washStatus",
      ]),
    });

    setMsg("Rewash requested.");
  }

  async function requestPickup(id) {
    await updateDoc(doc(db, "ros", id), {
      pickupStatus: "requested",

      pickupRequestedAtMs: Date.now(),

      pickupRequestedBy: auth.currentUser?.uid || "",

      pickupRequestedByName:
        auth.currentUser?.displayName || auth.currentUser?.email || "",

      ...auditPatch([
        "pickupStatus",
        "pickupRequestedAtMs",
        "pickupRequestedBy",
        "pickupRequestedByName",
      ]),
    });

    setMsg("Pickup requested.");
  }

  async function setNeedBy(id, ticket, anchorButton) {
    if (!ticket) {
      throw new Error("Repair order not found.");
    }

    const washStatus = clean(ticket.washStatus).toLowerCase();

    if (!["pending", "washing", "rewash_requested"].includes(washStatus)) {
      throw new Error("The vehicle must be in Wash before setting Need By.");
    }

    if (ticket.customerWaiting === true || ticket.isWaiter === true) {
      throw new Error("Waiter cars cannot take a Need By slot.");
    }

    if (ticket.pickedUpAtMs) {
      throw new Error("This vehicle is already picked up.");
    }

    if (!confirmNeedByOverride(ticket, "change Need By")) {
      return;
    }

    const settings = await getWashSettings();

    currentWashSettings = settings;

    const schedule = {
      monFri:
        Number(settings.mfBays || 0) > 0
          ? {
              start: settings.mfOpen || "07:30",
              end: settings.mfClose || "19:00",
            }
          : null,

      sat:
        Number(settings.satBays || 0) > 0
          ? {
              start: settings.satOpen || "08:00",
              end: settings.satClose || "15:00",
            }
          : null,

      sun:
        Number(settings.sunBays || 0) > 0
          ? {
              start: settings.sunOpen || "00:00",
              end: settings.sunClose || "00:00",
            }
          : null,
    };

    const selectedMs = await pickDateTimeMs(
      "Need By",
      Number(ticket.needByAtMs || 0) || null,
      15,
      {
        schedule,
        anchorEl: anchorButton,
      },
    );

    if (!selectedMs) {
      return;
    }

    if (selectedMs <= Date.now()) {
      setMsg("Need By must be in the future.", false);
      return;
    }

    const washRows = rows.filter((row) =>
      ["pending", "washing", "rewash_requested"].includes(
        clean(row.washStatus).toLowerCase(),
      ),
    );

    const check = canAcceptNeedBy({
      tickets: washRows,
      settings,
      proposedFinishAtMs: selectedMs,
      ticketId: id,
    });

    if (!check.ok) {
      const reason = check.reason || "That wash slot is not available.";

      setMsg(reason, false);
      alert(reason);
      return;
    }

    const preview = projectWashQueue(
      washRows.map((row) =>
        row.id === id ? { ...row, needByAtMs: selectedMs } : row,
      ),
      settings,
    );

    const projectedFinish = Number(
      preview.find((row) => row.id === id)?.projectedFinishAtMs || 0,
    );

    if (projectedFinish > selectedMs) {
      const confirmed = confirm(
        `This Need By cannot be met. Estimated finish is ${fmtTime(projectedFinish)}. Save it anyway?`,
      );

      if (!confirmed) {
        return;
      }
    }

    const currentNeedBy = Number(ticket.needByAtMs || 0);

    if (currentNeedBy && selectedMs > currentNeedBy) {
      const confirmed = confirm(
        `Wash may not finish by ${fmtTime(currentNeedBy)}. Move Need By later to ${fmtTime(selectedMs)}?`,
      );

      if (!confirmed) {
        return;
      }
    }

    await updateDoc(doc(db, "ros", id), {
      needByAtMs: selectedMs,
      needBySlotEndMs: check.slotEndMs || selectedMs,
      needBySetBy: auth.currentUser?.uid || "",

      washEvents: arrayUnion(washEvent("wash_need_by_set")),

      ...auditPatch(["needByAtMs", "needBySlotEndMs", "needBySetBy"]),
    });

    setMsg(`Need By set for ${fmtTime(selectedMs)}.`);
  }

  function confirmNeedByOverride(ticket, actionLabel) {
    const ownerId = advisorIdValue(ticket);
    const actorId = clean(session?.uid);

    if (!ownerId || ownerId === actorId) {
      return true;
    }

    const ownerName = advisorNameValue(ticket) || "another advisor";
    const actorName =
      clean(session?.displayName || session?.email) || "you";

    return confirm(
      `This RO belongs to ${ownerName}.\n\n` +
        `You are about to ${actionLabel}. This action is recorded under ${actorName}.\n\n` +
        `Continue?`,
    );
  }

  async function resolveNeedByLateAlert(ticketId, needBy) {
    const alertId = `needby-late-${ticketId}-${Number(needBy || 0)}`;

    try {
      await updateDoc(doc(db, "notificationRequests", alertId), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        resolvedAtMs: Date.now(),
        resolvedBy: auth.currentUser?.uid || "",
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      });
    } catch (error) {
      console.warn("Need By late alert was not open:", alertId, error?.message);
    }
  }

  async function clearNeedBy(id, ticket) {
    if (!ticket) {
      throw new Error("Repair order not found.");
    }

    const currentNeedBy = Number(ticket.needByAtMs || 0);

    if (!currentNeedBy) {
      setMsg("No Need By to clear.", false);
      return;
    }

    if (!confirmNeedByOverride(ticket, "clear Need By")) {
      return;
    }

    const confirmed = confirm(
      `Remove Need By for RO ${roValue(ticket)}? This car goes back to normal wash order.`,
    );

    if (!confirmed) {
      return;
    }

    await updateDoc(doc(db, "ros", id), {
      needByAtMs: null,
      needBySlotEndMs: null,
      needBySetBy: null,

      washEvents: arrayUnion(washEvent("wash_need_by_cleared")),

      ...auditPatch(["needByAtMs", "needBySlotEndMs", "needBySetBy"]),
    });

    await resolveNeedByLateAlert(id, currentNeedBy);

    setMsg("Need By removed.");
  }

  function qcLabel(ticket) {
    const status = clean(ticket.qcStatus).toLowerCase();

    if (status === "requested") {
      return "Requested";
    }

    if (status === "working") {
      return "Working";
    }

    if (status === "complete") {
      return "Completed";
    }

    if (status === "not_required") {
      return "No QC";
    }

    return "";
  }

  function refreshProjected() {
    const washRows = rows.filter((row) =>
      ["pending", "washing", "rewash_requested"].includes(
        clean(row.washStatus).toLowerCase(),
      ),
    );

    const projected = projectWashQueue(washRows, currentWashSettings || {});

    projectedById = {};

    projected.forEach((ticket) => {
      projectedById[ticket.id] = ticket;
    });
  }

  function washLabel(ticket) {
    const status = clean(ticket.washStatus).toLowerCase();

    if (status === "pending") {
      return "Pending";
    }

    if (status === "rewash_requested") {
      return "Rewash Requested";
    }

    if (status === "washing") {
      return "Washing";
    }

    if (status === "washed") {
      return "Washed";
    }

    return "";
  }

  function pickupLabel(ticket) {
    const status = clean(ticket.pickupStatus).toLowerCase();

    if (status === "requested") {
      return "Requested";
    }

    if (status === "on_the_way") {
      return "On The Way";
    }

    if (status === "complete") {
      return "Complete";
    }

    return "";
  }

  function populateAdvisorFilter() {
    const previousValue = advisorFilterEl.value;

    const advisors = new Map();

    rows.forEach((ticket) => {
      const advisorId = advisorIdValue(ticket);

      const advisorName = advisorNameValue(ticket);

      if (!advisorId) {
        return;
      }

      if (!advisors.has(advisorId)) {
        advisors.set(advisorId, advisorName || "Unknown Advisor");
      }
    });

    const sortedAdvisors = Array.from(advisors.entries()).sort(
      (advisorA, advisorB) => {
        return advisorA[1].localeCompare(advisorB[1]);
      },
    );

    advisorFilterEl.innerHTML = `
      <option value="">
        Select Advisor
      </option>

      ${sortedAdvisors
        .map(([advisorId, advisorName]) => {
          return `
            <option value="${escapeHtml(advisorId)}">
              ${escapeHtml(advisorName)}
            </option>
          `;
        })
        .join("")}
    `;

    const previousStillExists = Array.from(advisorFilterEl.options).some(
      (option) => {
        return option.value === previousValue;
      },
    );

    if (previousStillExists) {
      advisorFilterEl.value = previousValue;
    }
  }

  function setCurrentView(view, advisorId = "") {
    currentView = view;
    selectedAdvisorId = advisorId;

    if (view !== "advisor") {
      advisorFilterEl.value = "";
    }

    updateViewControls();
    render();
    renderLoanerDays();
  }

  function updateViewControls() {
    myRosButton.disabled = false;
    allRosButton.disabled = false;

    myRosButton.classList.toggle("active-view", currentView === "mine");

    allRosButton.classList.toggle("active-view", currentView === "all");

    if (currentView === "mine") {
      advisorViewLabel.textContent = `Viewing: ${
        session?.displayName || session?.email || "My"
      } ROs`;

      return;
    }

    if (currentView === "all") {
      advisorViewLabel.textContent = "Viewing: All current ROs";

      return;
    }

    const selectedOption =
      advisorFilterEl.options[advisorFilterEl.selectedIndex];

    const advisorName =
      selectedOption?.textContent?.trim() || "Selected Advisor";

    advisorViewLabel.textContent = `Viewing: ${advisorName} ROs`;
  }

  function getCurrentRows() {
    const search = clean(searchEl.value).toLowerCase();

    let filteredRows = rows;

    if (currentView === "mine") {
      filteredRows = filteredRows.filter((ticket) => {
        return advisorIdValue(ticket) === session?.uid;
      });
    }

    if (currentView === "advisor" && selectedAdvisorId) {
      filteredRows = filteredRows.filter((ticket) => {
        return advisorIdValue(ticket) === selectedAdvisorId;
      });
    }

    if (search) {
      filteredRows = filteredRows.filter((ticket) => {
        const searchableText = [
          roValue(ticket),
          tagValue(ticket),
          ticket.customerName,
          ticket.customerPhone,
          advisorNameValue(ticket),
          ticket.model,
          ticket.make,
          ticket.year,
          ticket.currentLocation,
          ticket.location,
          ticket.status,
          ticket.washStatus,
          ticket.qcStatus,
          ticket.pickupStatus,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(search);
      });
    }

    return [...filteredRows].sort((ticketA, ticketB) => {
      const advisorComparison = advisorNameValue(ticketA).localeCompare(
        advisorNameValue(ticketB),
      );

      if (currentView === "all" && advisorComparison !== 0) {
        return advisorComparison;
      }

      const roA = roValue(ticketA);
      const roB = roValue(ticketB);

      return roA.localeCompare(roB, undefined, {
        numeric: true,
      });
    });
  }

  function advisorCell(key, ticket, ctx) {
    const {
      lateStyle,
      washStatus,
      canRewashTicket,
      qcLocked,
      pickupRequested,
      projected,
      cpDone,
      wtyDone,
    } = ctx;

    if (key === "tag") {
      return `<td><b>${escapeHtml(tagValue(ticket))}</b></td>`;
    }
    if (key === "ro") return `<td>${escapeHtml(roValue(ticket))}</td>`;
    if (key === "advisor") return `<td>${escapeHtml(advisorNameValue(ticket))}</td>`;
    if (key === "model") return `<td>${escapeHtml(vehicleValue(ticket))}</td>`;
    if (key === "customer") return `<td>${escapeHtml(ticket.customerName || "")}</td>`;
    if (key === "location") {
      return `<td>${escapeHtml(ticket.currentLocation || ticket.location || "")}</td>`;
    }
    if (key === "status") return `<td>${escapeHtml(ticket.status || "")}</td>`;
    if (key === "wash") return `<td>${escapeHtml(washLabel(ticket))}</td>`;
    if (key === "washed") return `<td>${escapeHtml(fmtTime(ticket.washedAtMs))}</td>`;
    if (key === "qc") {
      const canClear = ["requested", "not_required"].includes(
        clean(ticket.qcStatus).toLowerCase(),
      );

      return `<td class="qcStatusCell" title="${
        canClear ? "Double-click to clear this QC choice" : ""
      }">${escapeHtml(qcLabel(ticket))}</td>`;
    }
    if (key === "pickup") return `<td>${escapeHtml(pickupLabel(ticket))}</td>`;
    if (key === "needBy") {
      return `<td>
        <button class="needByBtn" type="button" style="${lateStyle}" ${
          !canSetNeedBy ||
          ticket.customerWaiting === true ||
          ticket.isWaiter === true ||
          Boolean(ticket.pickedUpAtMs) ||
          !["pending", "washing", "rewash_requested"].includes(washStatus)
            ? "disabled"
            : ""
        }>${ticket.needByAtMs ? fmtTime(ticket.needByAtMs) : "Need By"}</button>
        ${
          ticket.needByAtMs &&
          canSetNeedBy &&
          !ticket.pickedUpAtMs &&
          ["pending", "washing", "rewash_requested"].includes(washStatus)
            ? `<button class="clearNeedByBtn" type="button">Clear</button>`
            : ""
        }
      </td>`;
    }
    if (key === "projected") {
      return `<td style="${lateStyle}">${escapeHtml(fmtTime(projected.projectedFinishAtMs))}</td>`;
    }
    if (key === "rewash") {
      return `<td><button class="rewashBtn" ${
        !canRequestRewash || !canRewashTicket ? "disabled" : ""
      }>Request Rewash</button></td>`;
    }
    if (key === "cp") {
      return `<td>${
        cpDone
          ? `${canClearCp ? `<span>Booked</span> <button class="cpClearBtn">Clear CP</button>` : "Booked"}`
          : canMarkCp
            ? `<button class="cpBookedBtn">Mark CP Booked</button>`
            : ""
      }</td>`;
    }
    if (key === "wty") {
      return `<td>${
        wtyDone
          ? `${canClearWty ? `<span>Booked</span> <button class="wtyClearBtn">Clear WTY</button>` : "Booked"}`
          : canMarkWty
            ? `<button class="wtyBookedBtn">Mark WTY Booked</button>`
            : ""
      }</td>`;
    }
    if (key === "requestQc") {
      return `<td class="qcActionCell">
        <button class="requestQcBtn" ${
          !canRequestQc || qcLocked ? "disabled" : ""
        }>Request QC</button>
        <button class="noQcBtn" ${
          !canMarkNoQc || qcLocked ? "disabled" : ""
        }>No QC</button>
      </td>`;
    }
    if (key === "requestPickup") {
      return `<td><button class="pickupBtn" ${
        !canRequestPickup || pickupRequested ? "disabled" : ""
      }>${pickupRequested ? "Pickup Requested" : "Request Pickup"}</button></td>`;
    }

    return `<td></td>`;
  }

  function openAdvisorColumns() {
    const overlay = document.createElement("div");
    overlay.className = "advisor-column-overlay";

    const modal = document.createElement("div");
    modal.className = "advisor-column-modal";
    modal.innerHTML = `
      <h3>Advisor Columns</h3>
      <p>Choose which columns you want to see.</p>
      <div class="advisor-column-list">
        ${ADVISOR_COLUMNS.map((column) => `
          <label class="advisor-column-option">
            <input type="checkbox" value="${column.key}" ${
              visibleAdvisorColumns.includes(column.key) ? "checked" : ""
            } />
            <span>${escapeHtml(column.label)}</span>
          </label>
        `).join("")}
      </div>
      <div class="advisor-column-actions">
        <button type="button" class="js-cancel">Cancel</button>
        <button type="button" class="js-save">Save</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector(".js-cancel").addEventListener("click", () => {
      overlay.remove();
    });

    modal.querySelector(".js-save").addEventListener("click", () => {
      const selected = [...modal.querySelectorAll("input:checked")].map(
        (input) => input.value,
      );

      if (!selected.length) {
        alert("Select at least one column.");
        return;
      }

      saveAdvisorColumns(
        ADVISOR_COLUMNS.map((column) => column.key).filter((key) =>
          selected.includes(key),
        ),
      );
      render();
      overlay.remove();
    });
  }

  function render() {
    const filtered = getCurrentRows();

    tableEl.innerHTML = `
      <thead>
        <tr>
          ${visibleAdvisorColumns
            .map((key) => {
              const column = ADVISOR_COLUMNS.find((item) => item.key === key);
              const help = {
                needBy: "When you need this car finished.",
                projected: "When wash expects to finish. Red means it will miss Need by.",
                wash: "Current wash status: Pending, Washing, Rewash Requested, or Washed.",
                rewash: "Ask wash to run the car again.",
                washed: "Time the wash finished.",
              }[key];

              return help
                ? `<th class="advisor-th-help" data-help="${escapeHtml(help)}">${escapeHtml(column?.label || key)}</th>`
                : `<th>${escapeHtml(column?.label || key)}</th>`;
            })
            .join("")}
        </tr>
      </thead>

      <tbody>
        ${
          filtered.length
            ? filtered
                .map((ticket) => {
                  const cpDone =
                    Boolean(ticket.cpBookedAtMs) || Boolean(ticket.cpBookedAt);

                  const wtyDone =
                    Boolean(ticket.wtyBookedAtMs) ||
                    Boolean(ticket.wtyBookedAt);

                  const pickupStatus = clean(ticket.pickupStatus).toLowerCase();

                  const pickupRequested =
                    pickupStatus === "requested" ||
                    pickupStatus === "on_the_way";

                  const washStatus = clean(ticket.washStatus).toLowerCase();

                  const canRewashTicket = washStatus === "washed";

                  const qcStatus = clean(ticket.qcStatus).toLowerCase();

                  const qcLocked =
                    qcStatus === "requested" ||
                    qcStatus === "working" ||
                    qcStatus === "complete" ||
                    qcStatus === "not_required";

                  const projected = projectedById[ticket.id] || {};
                  const late = projected.needByMissed === true;
                  const lateStyle = late
                    ? "color:crimson;font-weight:700;"
                    : "";

                  return `
                    <tr data-id="${escapeHtml(ticket.id)}">
                      ${visibleAdvisorColumns
                        .map((key) => advisorCell(key, ticket, {
                          lateStyle,
                          washStatus,
                          canRewashTicket,
                          qcLocked,
                          pickupRequested,
                          projected,
                          cpDone,
                          wtyDone,
                        }))
                        .join("")}
                    </tr>
                  `;
                })
                .join("")
            : `
              <tr>
                <td colspan="${visibleAdvisorColumns.length || 1}">
                  No repair orders found.
                </td>
              </tr>
            `
        }
      </tbody>
    `;
  }

  let advisorHelpTip = null;

  tableEl.addEventListener("mouseover", (event) => {
    const header = event.target.closest(".advisor-th-help");

    if (!header?.dataset.help) {
      return;
    }

    if (!advisorHelpTip) {
      advisorHelpTip = document.createElement("div");
      advisorHelpTip.className = "advisor-help-tip";
      document.body.appendChild(advisorHelpTip);
    }

    const box = header.getBoundingClientRect();

    advisorHelpTip.textContent = header.dataset.help;
    advisorHelpTip.style.left = `${box.left}px`;
    advisorHelpTip.style.top = `${box.top - 8}px`;
    advisorHelpTip.style.transform = "translateY(-100%)";
    advisorHelpTip.classList.add("is-on");
  });

  tableEl.addEventListener("mouseout", (event) => {
    if (event.relatedTarget?.closest?.(".advisor-th-help")) {
      return;
    }

    advisorHelpTip?.classList.remove("is-on");
  });

  tableEl.addEventListener("dblclick", async (event) => {
    const cell = event.target.closest(".qcStatusCell");
    const tableRow = event.target.closest("tr[data-id]");

    if (!cell || !tableRow) {
      return;
    }

    const ticket = rows.find((item) => item.id === tableRow.dataset.id);
    const status = clean(ticket?.qcStatus).toLowerCase();

    if (!["requested", "not_required"].includes(status)) {
      return;
    }

    const confirmed = confirm("Clear this QC choice so you can choose again?");

    if (!confirmed) {
      return;
    }

    try {
      await clearQcDecision(ticket.id);
      setMsg("QC choice cleared.");
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Could not clear QC.", false);
    }
  });

  tableEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button");

    const tableRow = event.target.closest("tr[data-id]");

    if (!button || !tableRow) {
      return;
    }

    const id = tableRow.dataset.id;
    const ticket = rows.find((r) => r.id === id);

    try {
      if (button.classList.contains("needByBtn")) {
        await setNeedBy(id, ticket, button);
      }

      if (button.classList.contains("clearNeedByBtn")) {
        await clearNeedBy(id, ticket);
      }
      if (button.classList.contains("pickupBtn")) {
        await requestPickup(id);
      }

      if (button.classList.contains("rewashBtn")) {
        await requestRewash(id);
      }

      if (button.classList.contains("cpBookedBtn")) {
        await markCpBooked(id);
        setMsg("CP booked.");
      }

      if (button.classList.contains("cpClearBtn")) {
        await clearCpBooked(id);
        setMsg("CP cleared.");
      }

      if (button.classList.contains("wtyBookedBtn")) {
        await markWarrantyBooked(id);
        setMsg("Warranty booked.");
      }

      if (button.classList.contains("wtyClearBtn")) {
        await clearWarrantyBooked(id);
        setMsg("Warranty cleared.");
      }

      if (button.classList.contains("requestQcBtn")) {
        await requestQc(id);
        setMsg("QC requested.");
      }

      if (button.classList.contains("noQcBtn")) {
        await markNoQcRequired(id);
        setMsg("No QC required.");
      }
    } catch (error) {
      console.error(error);

      setMsg(error?.message || "Action failed.", false);
    }
  });

  myRosButton.addEventListener("click", () => {
    setCurrentView("mine");
  });

  allRosButton.addEventListener("click", () => {
    setCurrentView("all");
  });

  advisorFilterEl.addEventListener("change", () => {
    const advisorId = advisorFilterEl.value;

    if (!advisorId) {
      return;
    }

    setCurrentView("advisor", advisorId);
  });

  searchEl.addEventListener("input", render);

  function renderLoanerDays() {
    const advisorId =
      currentView === "mine"
        ? session?.uid || ""
        : currentView === "advisor"
          ? selectedAdvisorId
          : "";
    const advisorName =
      currentView === "mine"
        ? session?.displayName || session?.email || ""
        : advisorFilterEl.options[advisorFilterEl.selectedIndex]?.textContent?.trim() || "";

    renderLoanerDaysCard(
      $("loanerDaysCard"),
      loanerTrips,
      advisorId,
      advisorName,
    );
  }

  if (session?.dealerId) {
    onSnapshot(
      query(
        collection(db, "loanerTrips"),
        where("dealerId", "==", session.dealerId),
      ),
      (snap) => {
        loanerTrips = snap.docs.map((tripDoc) => tripDoc.data() || {});
        renderLoanerDays();
      },
    );
  }

  watchDealerROs((dealerRows) => {
    rows = Array.isArray(dealerRows) ? dealerRows : [];

    refreshProjected();
    populateAdvisorFilter();
    updateViewControls();
    render();
  });

  getWashSettings()
    .then((settings) => {
      currentWashSettings = settings;
      refreshProjected();
      render();
    })
    .catch((error) => {
      console.error(error);
    });
});

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();

    if (existing?.dealerId) {
      resolve(existing);
      return;
    }

    window.addEventListener("dexp-session-ready", () => resolve(getSession()), {
      once: true,
    });
  });
}
