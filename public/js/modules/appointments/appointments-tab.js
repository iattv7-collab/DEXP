// public/js/modules/appointments/appointments-tab.js

import { getSession } from "/js/core/session.js";
import { MODULES } from "/js/config/modules.js";
import { createRequest } from "/js/services/firestore/requests-service.js";
import {
  APPOINTMENT_STATUS,
  TRANSPORT_TYPE,
  formatAppointmentDate,
  linkAppointmentToRO,
  markAppointmentArrived,
  markAppointmentCancelled,
  markAppointmentNoShow,
  shiftAppointmentDate,
  updateAppointment,
  upsertAppointmentsForDate,
  watchAppointmentsForDate,
} from "/js/services/firestore/appointments-service.js";
import {
  parseAppointmentSheetText,
  recognizeAppointmentImage,
  enrichVehiclesFromVin,
} from "/js/modules/appointments/appointment-sheet-parse.js";
import { pickDateTimeMs } from "/js/shared/date-time-picker.js";

const LOANER_WAIT_REQUEST_TYPE = "waiting_for_loaner";

let selectedDate = formatAppointmentDate(new Date());
let transportFilter = "all";
let liveRows = [];
let previewRows = [];
let previewDate = "";
let unwatch = null;
let dealerROs = [];
let notificationGroups = [];

export function hasAppointmentsAccess() {
  const session = getSession();
  const modules = Array.isArray(session?.modules) ? session.modules : [];
  const role = session?.role || "";
  return (
    role === "platform-admin" ||
    role === "admin" ||
    modules.includes(MODULES.APPOINTMENTS) ||
    modules.includes(MODULES.OPERATIONS) ||
    modules.includes("appointments")
  );
}

export function initAppointmentsTab({
  getDealerROs = () => [],
  getNotificationGroups = () => [],
} = {}) {
  const root = document.getElementById("operationsAppointmentsSection");
  if (!root) return;

  dealerROs = getDealerROs() || [];
  notificationGroups = getNotificationGroups() || [];

  root.innerHTML = renderShell();
  wire(root);
  startWatch();
}

export function syncAppointmentsTabContext({ ros = [], groups = [] } = {}) {
  dealerROs = ros || [];
  notificationGroups = groups || [];
  renderBoard();
}


function syncDateInput() {
  const input = document.getElementById("appointmentsDateInput");
  if (input) input.value = toDateInputValue(selectedDate);
  syncDayButtons();
}

function syncDayButtons() {
  const today = formatAppointmentDate(new Date());
  const tomorrow = shiftAppointmentDate(today, 1);
  document.querySelectorAll(".js-day").forEach((button) => {
    const day = button.dataset.day;
    let active = false;
    if (day === "today") active = selectedDate === today;
    if (day === "tomorrow") active = selectedDate === tomorrow;
    if (day === "prev") active = selectedDate !== today && selectedDate !== tomorrow;
    button.classList.toggle("secondary", !active);
  });
}

function toDateInputValue(dateStr) {
  const [month, day, year] = String(dateStr || "").split("/");
  if (!month || !day || !year) return "";
  const fullYear = String(year).length === 2 ? `20${year}` : year;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fromDateInputValue(value) {
  const [year, month, day] = String(value || "").split("-");
  if (!year || !month || !day) return "";
  return `${month}/${day}/${String(year).slice(-2)}`;
}

function toTimeInputValue(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const mer = match[3] || "";
  if (mer === "PM" && hour < 12) hour += 12;
  if (mer === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function fromTimeInputValue(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return text;
  let hour = Number(match[1]);
  const minute = match[2];
  const mer = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${mer}`;
}

function renderShell() {
  return `
    <div class="dexp-admin-card appointments-card">
      <h3>Appointments</h3>
      <p class="tool-help">
        No Reynolds live feed. Upload tonight or tomorrow morning's printed sheet.
        Review the grid, then save. Arrived cars stay if you upload again.
      </p>

      <div class="action-row appointments-toolbar">
        <button type="button" class="small-button secondary js-day" data-day="prev">Prev</button>
        <button type="button" class="small-button js-day" data-day="today">Today</button>
        <button type="button" class="small-button secondary js-day" data-day="tomorrow">Tomorrow</button>
        <input id="appointmentsDateInput" type="date" value="${escapeHtml(toDateInputValue(selectedDate))}" />
        <label class="small-button secondary">
          Photo of sheet
          <input id="appointmentsPhotoInput" type="file" accept="image/*" capture="environment" hidden />
        </label>
        <button type="button" class="small-button secondary" id="appointmentsPasteToggle">Paste text</button>
        <button type="button" class="small-button" id="appointmentsSavePreview" disabled>Save preview</button>
        <button type="button" class="small-button secondary" id="appointmentsAddLive">Add appointment</button>
      </div>

      <div id="appointmentsPasteWrap" class="hidden" style="margin:8px 0">
        <textarea id="appointmentsPasteInput" rows="6" placeholder="Paste OCR or exported sheet text"></textarea>
        <button type="button" class="small-button" id="appointmentsParsePaste">Parse paste</button>
      </div>

      <p id="appointmentsStatusMsg" class="tool-help"></p>

      <div id="appointmentsPreviewWrap" class="hidden">
        <h4>Review before save</h4>
        <button type="button" class="small-button secondary" id="appointmentsAddPreviewRow">Add row</button>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Time</th><th>Transport</th><th>Adv</th><th>Customer</th>
                <th>Vehicle</th><th>VIN</th><th>Phone</th><th>Concern</th>
              </tr>
            </thead>
            <tbody id="appointmentsPreviewBody"></tbody>
          </table>
        </div>
      </div>

      <div class="action-row" id="appointmentsCounts"></div>

      <div class="action-row">
        <button type="button" class="small-button js-transport" data-transport="all">All</button>
        <button type="button" class="small-button secondary js-transport" data-transport="loaner">Loaner</button>
        <button type="button" class="small-button secondary js-transport" data-transport="waiter">Waiter</button>
        <button type="button" class="small-button secondary js-transport" data-transport="valet">Valet</button>
        <button type="button" class="small-button secondary js-transport" data-transport="none">None</button>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Transport</th>
              <th>Adv</th>
              <th>Customer</th>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Phone</th>
              <th>Concern</th>
              <th>Status</th>
              <th>RO</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="appointmentsLiveBody">
            <tr><td colspan="11">No appointments loaded for this date.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function wire(root) {
  root.querySelectorAll(".js-day").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.day === "tomorrow") {
        selectedDate = shiftAppointmentDate(formatAppointmentDate(new Date()), 1);
      } else if (button.dataset.day === "prev") {
        selectedDate = shiftAppointmentDate(selectedDate || formatAppointmentDate(new Date()), -1);
      } else {
        selectedDate = formatAppointmentDate(new Date());
      }
      syncDateInput();
      startWatch();
    });
  });

  document.getElementById("appointmentsDateInput")?.addEventListener("change", (event) => {
    selectedDate = fromDateInputValue(event.target.value) || selectedDate;
    syncDateInput();
    startWatch();
  });

  document.getElementById("appointmentsPhotoInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMsg("Reading sheet photo…");
    try {
      const text = await recognizeAppointmentImage(file);
      setMsg("Decoding vehicles from VIN…");
      const parsed = parseAppointmentSheetText(text);
      parsed.rows = await enrichVehiclesFromVin(parsed.rows);
      applyParsed(parsed);
    } catch (error) {
      setMsg(error?.message || "Could not read photo.");
    }
  });

  document.getElementById("appointmentsPasteToggle")?.addEventListener("click", () => {
    document.getElementById("appointmentsPasteWrap")?.classList.toggle("hidden");
  });

  document.getElementById("appointmentsParsePaste")?.addEventListener("click", async () => {
    const text = document.getElementById("appointmentsPasteInput")?.value || "";
    setMsg("Decoding vehicles from VIN…");
    const parsed = parseAppointmentSheetText(text);
    parsed.rows = await enrichVehiclesFromVin(parsed.rows);
    applyParsed(parsed);
  });

  document.getElementById("appointmentsPreviewWrap")?.addEventListener("click", async (event) => {
    const input = event.target.closest(".js-appt-time-pick");
    if (!input) return;
    const pickedMs = await pickDateTimeMs(
      "Select date/time",
      Date.now(),
      30,
      {
        schedule: {
          monFri: { start: "07:30", end: "18:00" },
        },
        anchorEl: input,
      },
    );
    if (!pickedMs) return;
    const date = new Date(pickedMs);
    let hour = date.getHours();
    const mer = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    const minute = String(date.getMinutes()).padStart(2, "0");
    input.value = `${hour}:${minute} ${mer}`;
    previewDate = formatAppointmentDate(date);
    selectedDate = previewDate;
    syncDateInput();
  });

  document.getElementById("appointmentsSavePreview")?.addEventListener("click", savePreview);
  function startBlankPreview() {
    previewDate = selectedDate;
    previewRows = [{
      appointmentDate: selectedDate,
      appointmentTime: "",
      transportationType: "none",
      advisorCode: "",
      customerName: "",
      vehicle: "",
      vin: "",
      phone: "",
      concern: "",
      loanerRequired: false,
      source: "manual",
    }];
    const wrap = document.getElementById("appointmentsPreviewWrap");
    const saveBtn = document.getElementById("appointmentsSavePreview");
    wrap?.classList.remove("hidden");
    if (saveBtn) saveBtn.disabled = false;
    renderPreviewBody();
    setMsg("Add the missing appointment, then save.");
  }

  document.getElementById("appointmentsAddLive")?.addEventListener("click", startBlankPreview);

  document.getElementById("appointmentsAddPreviewRow")?.addEventListener("click", () => {
    previewRows = collectPreviewRows();
    previewRows.push({
      appointmentDate: previewDate || selectedDate,
      appointmentTime: "",
      transportationType: "none",
      advisorCode: "",
      customerName: "",
      vehicle: "",
      vin: "",
      phone: "",
      concern: "",
      loanerRequired: false,
      source: "manual",
    });
    renderPreviewBody();
    const saveBtn = document.getElementById("appointmentsSavePreview");
    if (saveBtn) saveBtn.disabled = false;
  });

  root.querySelectorAll(".js-transport").forEach((button) => {
    button.addEventListener("click", () => {
      transportFilter = button.dataset.transport || "all";
      root.querySelectorAll(".js-transport").forEach((item) => {
        item.classList.toggle("secondary", item.dataset.transport !== transportFilter);
      });
      renderBoard();
    });
  });

  document.getElementById("appointmentsLiveBody")?.addEventListener("click", handleBoardClick);
  document.getElementById("appointmentsLiveBody")?.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    document.querySelectorAll("#appointmentsLiveBody tr.appointment-row-selected").forEach((item) => {
      item.classList.remove("appointment-row-selected");
    });
    row.classList.add("appointment-row-selected");
  });
}

function applyParsed(parsed) {
  previewRows = parsed.rows || [];
  previewDate = parsed.appointmentDate || selectedDate;
  if (previewDate) {
    selectedDate = previewDate;
    const input = document.getElementById("appointmentsDateInput");
    syncDateInput();
  }
  const wrap = document.getElementById("appointmentsPreviewWrap");
  const body = document.getElementById("appointmentsPreviewBody");
  const saveBtn = document.getElementById("appointmentsSavePreview");
  if (!previewRows.length) {
    wrap?.classList.add("hidden");
    if (saveBtn) saveBtn.disabled = true;
    setMsg("No appointment rows found. Try a flatter photo or paste the text.");
    return;
  }
  wrap?.classList.remove("hidden");
  if (saveBtn) saveBtn.disabled = false;
  renderPreviewBody();
  setMsg(`Parsed ${previewRows.length} rows for ${previewDate || selectedDate}. Fix cells if needed, then save.`);
}

function renderPreviewBody() {
  const body = document.getElementById("appointmentsPreviewBody");
  if (!body) return;
  body.innerHTML = previewRows
    .map((row, index) => {
      return `<tr data-preview-index="${index}">
        <td><input data-field="appointmentTime" class="js-appt-time-pick" readonly value="${escapeHtml(row.appointmentTime || "")}" placeholder="Pick time" /></td>
        <td><input data-field="transportationType" value="${escapeHtml(row.transportationType || "")}" /></td>
        <td><input data-field="advisorCode" value="${escapeHtml(row.advisorCode || "")}" /></td>
        <td><input data-field="customerName" value="${escapeHtml(row.customerName || "")}" /></td>
        <td><input data-field="vehicle" value="${escapeHtml(row.vehicle || "")}" /></td>
        <td><input data-field="vin" value="${escapeHtml(row.vin || "")}" /></td>
        <td><input data-field="phone" value="${escapeHtml(row.phone || "")}" /></td>
        <td><input data-field="concern" value="${escapeHtml(row.concern || "")}" /></td>
      </tr>`;
    })
    .join("");
}

function collectPreviewRows() {
  const body = document.getElementById("appointmentsPreviewBody");
  if (!body) return previewRows;
  return [...body.querySelectorAll("tr")].map((tr, index) => {
    const current = { ...(previewRows[index] || {}) };
    tr.querySelectorAll("input[data-field]").forEach((input) => {
      let value = String(input.value || "").trim();
      if (input.dataset.field === "appointmentTime") {
        value = fromTimeInputValue(value);
      }
      current[input.dataset.field] = value;
    });
    current.transportationType = String(current.transportationType || "none").toLowerCase();
    current.loanerRequired = current.transportationType === "loaner";
    current.appointmentDate = previewDate || selectedDate;
    return current;
  });
}

async function savePreview() {
  const saveBtn = document.getElementById("appointmentsSavePreview");
  if (saveBtn) saveBtn.disabled = true;
  setMsg("Saving…");
  try {
    previewRows = collectPreviewRows();
    previewRows = await enrichVehiclesFromVin(previewRows);
    const result = await upsertAppointmentsForDate(previewDate || selectedDate, previewRows);
    setMsg(
      `Saved ${result.saved}. Kept ${result.skippedProtected} already arrived/linked rows.`,
    );
    document.getElementById("appointmentsPreviewWrap")?.classList.add("hidden");
    previewRows = [];
  } catch (error) {
    setMsg(error?.message || "Save failed.");
    if (saveBtn) saveBtn.disabled = false;
  }
}

function startWatch() {
  if (typeof unwatch === "function") {
    unwatch();
    unwatch = null;
  }
  unwatch = watchAppointmentsForDate(selectedDate, (rows) => {
    liveRows = rows;
    renderBoard();
  });
}

function renderBoard() {
  syncDayButtons();
  const body = document.getElementById("appointmentsLiveBody");
  const counts = document.getElementById("appointmentsCounts");
  if (!body) return;

  const loanerCount = liveRows.filter((row) => row.loanerRequired).length;
  const arrivedCount = liveRows.filter((row) => row.status === APPOINTMENT_STATUS.ARRIVED).length;
  const waitingCount = liveRows.filter((row) => row.waitingForLoaner).length;

  if (counts) {
    counts.innerHTML = `
      <span>Total ${liveRows.length}</span>
      <span>Loaner ${loanerCount}</span>
      <span>Arrived ${arrivedCount}</span>
      <span>Not arrived ${liveRows.length - arrivedCount}</span>
      <span>Waiting loaner ${waitingCount}</span>
    `;
  }

  const rows = liveRows.filter((row) => {
    if (transportFilter === "all") return true;
    return String(row.transportationType || "none") === transportFilter;
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="11">No appointments loaded for this date.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(renderLiveRow).join("");
}


function appointmentRowClass(row = {}) {
  const status = String(row.status || "scheduled");
  if (status === APPOINTMENT_STATUS.NO_SHOW) return "appointment-row row-past";
  if (status === APPOINTMENT_STATUS.CANCELLED) return "appointment-row row-cancelled";
  if (row.roNumber || row.roId) return "appointment-row row-picked";
  if (status === APPOINTMENT_STATUS.ARRIVED) return "appointment-row row-ready";
  if (row.advisorWaiter === true) return "appointment-row row-waiter";
  return "appointment-row row-today";
}

function renderLiveRow(row) {
  const matched = findMatchingRO(row);
  const roLabel = row.roNumber || matched?.roNumber || "";
  const canLink = !row.roId && matched;
  const showLoanerWait =
    row.loanerRequired &&
    row.status === APPOINTMENT_STATUS.ARRIVED &&
    !row.waitingForLoaner;

  return `<tr class="${appointmentRowClass(row)}" data-id="${escapeHtml(row.id)}">
    <td>${escapeHtml(row.appointmentTime || "")}</td>
    <td>${escapeHtml(row.transportationType || "")}</td>
    <td>${escapeHtml(row.advisorCode || "")}</td>
    <td>${escapeHtml(row.customerName || "")}</td>
    <td>${escapeHtml(row.vehicle || "")}</td>
    <td>${escapeHtml(row.vin || "")}</td>
    <td>${escapeHtml(row.phone || "")}</td>
    <td>${escapeHtml(row.concern || "")}</td>
    <td>${escapeHtml(row.status || "")}${row.waitingForLoaner ? " / loaner wait" : ""}</td>
    <td>${escapeHtml(roLabel)}</td>
    <td>
      ${
        row.status === APPOINTMENT_STATUS.SCHEDULED
          ? `<button type="button" class="small-button js-appt-arrived" data-id="${escapeHtml(row.id)}">Arrived</button>
             <button type="button" class="small-button secondary js-appt-noshow" data-id="${escapeHtml(row.id)}">No show</button>
             <button type="button" class="small-button secondary js-appt-cancel" data-id="${escapeHtml(row.id)}">Cancel</button>`
          : ""
      }
      ${
        canLink
          ? `<button type="button" class="small-button secondary js-appt-link" data-id="${escapeHtml(row.id)}" data-ro-id="${escapeHtml(matched.id || matched.roNumber || "")}">Link RO</button>`
          : ""
      }
      ${
        showLoanerWait
          ? `<button type="button" class="small-button secondary js-appt-loaner-wait" data-id="${escapeHtml(row.id)}">Waiting for loaner</button>`
          : ""
      }
    </td>
  </tr>`;
}

function findMatchingRO(appointment) {
  const vin = String(appointment.vin || "").toUpperCase();
  if (vin.length < 8) return null;
  return (
    dealerROs.find((ro) => String(ro.vin || "").toUpperCase() === vin) ||
    dealerROs.find((ro) => String(ro.vinLast8 || "").toUpperCase() === vin.slice(-8)) ||
    null
  );
}

async function handleBoardClick(event) {
  const arrived = event.target.closest(".js-appt-arrived");
  const noShow = event.target.closest(".js-appt-noshow");
  const cancel = event.target.closest(".js-appt-cancel");
  const link = event.target.closest(".js-appt-link");
  const wait = event.target.closest(".js-appt-loaner-wait");

  try {
    if (arrived) {
      await markAppointmentArrived(arrived.dataset.id);
      return;
    }
    if (noShow) {
      await markAppointmentNoShow(noShow.dataset.id);
      return;
    }
    if (cancel) {
      await markAppointmentCancelled(cancel.dataset.id);
      return;
    }
    if (link) {
      const ro =
        dealerROs.find((item) => item.id === link.dataset.roId) ||
        dealerROs.find((item) => item.roNumber === link.dataset.roId);
      if (!ro) throw new Error("RO not found.");
      await linkAppointmentToRO(link.dataset.id, ro);
      return;
    }
    if (wait) {
      await sendToLoanerWait(wait.dataset.id);
    }
  } catch (error) {
    alert(error?.message || "Could not update appointment.");
  }
}

async function sendToLoanerWait(appointmentId) {
  const row = liveRows.find((item) => item.id === appointmentId);
  if (!row) return;

  const group =
    notificationGroups.find((item) => /loaner/i.test(item.name || "")) ||
    notificationGroups[0];

  if (group) {
    try {
      await createRequest({
        roId: row.roId || "",
        roNumber: row.roNumber || "",
        vinLast8: String(row.vin || "").slice(-8),
        requestType: LOANER_WAIT_REQUEST_TYPE,
        sourceModule: "appointments",
        targetGroupId: group.id,
        targetGroupName: group.name || "Loaner",
        title: `Waiting for loaner — ${row.customerName || row.vin || "customer"}`,
        message: `${row.customerName || ""} ${row.vehicle || ""} VIN ${row.vin || ""}`.trim(),
        route: "/pages/operations/operations.html",
        routeParams: { tab: "appointments" },
      });
    } catch (error) {
      console.warn("Loaner wait request not created", error);
    }
  }

  await updateAppointment(appointmentId, {
    waitingForLoaner: true,
    waitingForLoanerAtMs: Date.now(),
  });
}

function setMsg(text) {
  const node = document.getElementById("appointmentsStatusMsg");
  if (node) node.textContent = text || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}