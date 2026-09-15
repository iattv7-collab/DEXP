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
} from "/js/modules/appointments/appointment-sheet-parse.js";

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

function renderShell() {
  return `
    <div class="dexp-admin-card appointments-card">
      <h3>Appointments</h3>
      <p class="tool-help">
        No Reynolds live feed. Upload tonight or tomorrow morning's printed sheet.
        Review the grid, then save. Arrived cars stay if you upload again.
      </p>

      <div class="action-row appointments-toolbar">
        <button type="button" class="small-button js-day" data-day="today">Today</button>
        <button type="button" class="small-button secondary js-day" data-day="tomorrow">Tomorrow</button>
        <input id="appointmentsDateInput" type="text" value="${escapeHtml(selectedDate)}" placeholder="MM/DD/YY" style="max-width:120px" />
        <label class="small-button secondary">
          Photo of sheet
          <input id="appointmentsPhotoInput" type="file" accept="image/*" capture="environment" hidden />
        </label>
        <button type="button" class="small-button secondary" id="appointmentsPasteToggle">Paste text</button>
        <button type="button" class="small-button" id="appointmentsSavePreview" disabled>Save preview</button>
      </div>

      <div id="appointmentsPasteWrap" class="hidden" style="margin:8px 0">
        <textarea id="appointmentsPasteInput" rows="6" placeholder="Paste OCR or exported sheet text"></textarea>
        <button type="button" class="small-button" id="appointmentsParsePaste">Parse paste</button>
      </div>

      <p id="appointmentsStatusMsg" class="tool-help"></p>

      <div id="appointmentsPreviewWrap" class="hidden">
        <h4>Review before save</h4>
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
      selectedDate =
        button.dataset.day === "tomorrow"
          ? shiftAppointmentDate(formatAppointmentDate(new Date()), 1)
          : formatAppointmentDate(new Date());
      const input = document.getElementById("appointmentsDateInput");
      if (input) input.value = selectedDate;
      startWatch();
    });
  });

  document.getElementById("appointmentsDateInput")?.addEventListener("change", (event) => {
    selectedDate = String(event.target.value || "").trim();
    startWatch();
  });

  document.getElementById("appointmentsPhotoInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMsg("Reading sheet photo…");
    try {
      const text = await recognizeAppointmentImage(file);
      applyParsed(parseAppointmentSheetText(text));
    } catch (error) {
      setMsg(error?.message || "Could not read photo.");
    }
  });

  document.getElementById("appointmentsPasteToggle")?.addEventListener("click", () => {
    document.getElementById("appointmentsPasteWrap")?.classList.toggle("hidden");
  });

  document.getElementById("appointmentsParsePaste")?.addEventListener("click", () => {
    const text = document.getElementById("appointmentsPasteInput")?.value || "";
    applyParsed(parseAppointmentSheetText(text));
  });

  document.getElementById("appointmentsSavePreview")?.addEventListener("click", savePreview);

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
}

function applyParsed(parsed) {
  previewRows = parsed.rows || [];
  previewDate = parsed.appointmentDate || selectedDate;
  if (previewDate) {
    selectedDate = previewDate;
    const input = document.getElementById("appointmentsDateInput");
    if (input) input.value = selectedDate;
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
  if (body) {
    body.innerHTML = previewRows
      .map((row) => {
        return `<tr>
          <td>${escapeHtml(row.appointmentTime)}</td>
          <td>${escapeHtml(row.transportationType)}</td>
          <td>${escapeHtml(row.advisorCode)}</td>
          <td>${escapeHtml(row.customerName)}</td>
          <td>${escapeHtml(row.vehicle)}</td>
          <td>${escapeHtml(row.vin)}</td>
          <td>${escapeHtml(row.phone)}</td>
          <td>${escapeHtml(row.concern)}</td>
        </tr>`;
      })
      .join("");
  }
  setMsg(`Parsed ${previewRows.length} rows for ${previewDate || selectedDate}. Review, then save.`);
}

async function savePreview() {
  const saveBtn = document.getElementById("appointmentsSavePreview");
  if (saveBtn) saveBtn.disabled = true;
  setMsg("Saving…");
  try {
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

function renderLiveRow(row) {
  const matched = findMatchingRO(row);
  const roLabel = row.roNumber || matched?.roNumber || "";
  const canLink = !row.roId && matched;
  const showLoanerWait =
    row.loanerRequired &&
    row.status === APPOINTMENT_STATUS.ARRIVED &&
    !row.waitingForLoaner;

  return `<tr data-id="${escapeHtml(row.id)}">
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