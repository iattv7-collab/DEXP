// public/js/modules/ro-tracker/ro-tracker-render.js

import {
  formatNoYearDate,
  formatNoYearDateTime,
  mmddyyyyToDateInput,
} from "/js/modules/ro-tracker/ro-tracker-datetime.js";

export function buildROTrackerRow(ro = {}, columns = []) {
  const tr = document.createElement("tr");

  tr.className = getRowClass(ro);
  tr.dataset.roId = getROId(ro);

  columns.forEach((column) => {
    const td = buildCell(ro, column.key);
    tr.appendChild(td);
  });

  return tr;
}

function buildCell(ro, key) {
  if (key === "roNumber") return buildTextInputCell(ro, "roNumber", ro.roNumber);
  if (key === "tagNumber") return buildTextInputCell(ro, "tagNumber", ro.tagNumber);
  if (key === "advisorCompanyId") return buildPlainCell(ro.advisorCompanyId || ro.advisorNumber || "");
  if (key === "customerName") return buildTextInputCell(ro, "customerName", ro.customerName, { hoverFull: true });
  if (key === "customerPhone") return buildTextInputCell(ro, "customerPhone", ro.customerPhone, { phone: true });

  if (key === "roDate") return buildDatePickerCell(ro, "roDate", ro.roDate);
  if (key === "promiseTime") return buildDatePickerCell(ro, "promiseDate", ro.promiseDate || ro.promiseTime);

  if (key === "model") return buildTextInputCell(ro, "model", ro.model);
  if (key === "currentLocation") return buildPlainCell(ro.currentLocation || ro.location || "");
  if (key === "loanerVin") return buildPlainCell(ro.loanerVin ? String(ro.loanerVin).slice(-8) : "");

  if (key === "concern") return buildTextInputCell(ro, "concern", ro.concern || "", { longText: true });
  if (key === "notes") return buildTextInputCell(ro, "notes", ro.notes || "", { longText: true });

  if (key === "readyCalled") return buildReadyCalledCell(ro);
  if (key === "techVideo") return buildCheckboxCell(ro, "techVideo", Boolean(ro.techVideo), { videoCell: true });
  if (key === "calledTime") return buildDateTimeCell(ro, "calledAtMs", ro.calledAtMs, { showNow: true, stepMin: 5 });
  if (key === "nextUpdateTime") return buildDateTimeCell(ro, "nextUpdateAtMs", ro.nextUpdateAtMs, { stepMin: 15 });
  if (key === "isWaiter") return buildCheckboxCell(ro, "waiter", Boolean(ro.customerWaiting || ro.isWaiter));
  if (key === "techDone") return buildTechDoneCell(ro);
  if (key === "textSent") return buildButtonCell(ro, "textSent", "Text");
  if (key === "actions") return buildButtonCell(ro, "archive", "Archive");

  return buildPlainCell("");
}

function buildPlainCell(value) {
  const td = document.createElement("td");
  td.textContent = value || "";
  return td;
}

function buildTextInputCell(ro, field, value, opts = {}) {
  const td = document.createElement("td");

  if (opts.longText) {
    td.className = "hovertext";
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "cell-edit";
  input.value = opts.phone ? formatPhoneInput(value) : (value || "");
  input.dataset.roId = getROId(ro);
  input.dataset.roTextField = field;
  input.title = input.value || "";

  if (opts.phone) {
    input.dataset.phoneField = "true";
  }

  if (opts.longText) {
    input.dataset.roLongTextField = field;
  }

  td.appendChild(input);
  return td;
}

function buildDatePickerCell(ro, field, value) {
  const td = document.createElement("td");

  const wrap = document.createElement("div");
  wrap.className = "rt-datewrap";

  const input = document.createElement("input");
  input.type = "date";
  input.className = "cell-edit";
  input.value = mmddyyyyToDateInput(value);
  input.dataset.roId = getROId(ro);
  input.dataset.roDateField = field;

  const overlay = document.createElement("div");
  overlay.className = "rt-dateoverlay";
  overlay.textContent = formatNoYearDate(value) || "";

  wrap.appendChild(input);
  wrap.appendChild(overlay);
  td.appendChild(wrap);

  return td;
}

function buildDateTimeCell(ro, field, ms, opts = {}) {
  const td = document.createElement("td");

  const wrap = document.createElement("div");
  wrap.className = "ro-datetime-cell";

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.className = "cell-edit";
  input.value = ms ? formatNoYearDateTime(ms) : "";
  input.dataset.roId = getROId(ro);
  input.dataset.roDateTimeField = field;
  input.dataset.currentMs = ms || "";
  input.dataset.stepMin = String(opts.stepMin || 5);

  wrap.appendChild(input);

  if (opts.showNow) {
    wrap.appendChild(buildSmallButton(ro, "calledNow", "Now"));
  }

  td.appendChild(wrap);
  return td;
}

function buildReadyCalledCell(ro) {
  const td = document.createElement("td");
  td.className = "center";

  const wrap = document.createElement("div");
  wrap.className = "ro-ready-cell";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(ro.readyCalled || String(ro.status || "").toLowerCase() === "ready called");
  checkbox.disabled = !Boolean(ro.techVideo);
  checkbox.dataset.roId = getROId(ro);
  checkbox.dataset.roAction = "readyCalled";

  const label = document.createElement("span");
  label.textContent = "Ready called";

  wrap.appendChild(checkbox);
  wrap.appendChild(label);
  td.appendChild(wrap);

  return td;
}

function buildCheckboxCell(ro, action, checked, opts = {}) {
  const td = document.createElement("td");
  td.className = "center";

  if (opts.videoCell && checked) {
    td.classList.add("cell-video-sent");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(checked);
  checkbox.dataset.roId = getROId(ro);
  checkbox.dataset.roAction = action;

  td.appendChild(checkbox);
  return td;
}

function buildTechDoneCell(ro) {
  const td = document.createElement("td");
  td.className = "center";
  td.textContent = ro.repairCompleted || ro.techDone ? "✅" : "";
  return td;
}

function buildButtonCell(ro, action, label) {
  const td = document.createElement("td");
  td.className = "center";
  td.appendChild(buildSmallButton(ro, action, label));
  return td;
}

function buildSmallButton(ro, action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ro-small-action-button";
  button.dataset.roId = getROId(ro);
  button.dataset.roAction = action;
  button.textContent = label;
  return button;
}

function getRowClass(ro = {}) {
  const videoSent = Boolean(ro.techVideo);
  const readyCalled = Boolean(ro.readyCalled || String(ro.status || "").toLowerCase() === "ready called");
  const waiter = Boolean(ro.customerWaiting || ro.isWaiter);
  const nextUpdateAtMs = Number(ro.nextUpdateAtMs || 0);

  if (videoSent && readyCalled) return "row-ready";
  if (waiter) return "row-waiter";

  if (nextUpdateAtMs) {
    const now = Date.now();
    if (nextUpdateAtMs < now) return "row-past";

    const next = new Date(nextUpdateAtMs);
    const today = new Date();

    const sameDay =
      next.getFullYear() === today.getFullYear() &&
      next.getMonth() === today.getMonth() &&
      next.getDate() === today.getDate();

    if (sameDay) return "row-today";
  }

  return "";
}

function formatPhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function getROId(ro = {}) {
  return ro.id || ro.roNumber || "";
}