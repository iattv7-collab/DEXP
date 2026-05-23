// public/js/modules/ro-tracker/ro-tracker-actions.js

import { updateRO } from "/js/services/firestore/ros-service.js";

import {
  dateInputToMMDDYYYY,
  formatNoYearDate,
  formatNoYearDateTime,
  pickDateTimeMs,
} from "/js/modules/ro-tracker/ro-tracker-datetime.js";

export function setupROTrackerActions({ tableBody, getROById }) {
  if (!tableBody) return;

  tableBody.addEventListener("input", (event) => {
    const input = event.target.closest("[data-phone-field='true']");
    if (!input) return;

    input.value = formatPhoneInput(input.value);
    input.title = input.value || "";
  });

  tableBody.addEventListener(
    "blur",
    async (event) => {
      const input = event.target.closest("[data-ro-text-field]");
      if (!input) return;

      input.title = input.value || "";
      await handleTextFieldBlur(input);
    },
    true,
  );

  tableBody.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-ro-text-field]");
    if (!input) return;

    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
    }
  });

  tableBody.addEventListener("change", async (event) => {
    const dateInput = event.target.closest("[data-ro-date-field]");
    if (dateInput) {
      await handleDateChange(dateInput);
      return;
    }

    const checkbox = event.target.closest(
      "input[type='checkbox'][data-ro-action]",
    );
    if (checkbox) {
      await handleCheckboxChange(checkbox, getROById);
    }
  });

  tableBody.addEventListener("click", async (event) => {
    const dateTimeInput = event.target.closest("[data-ro-date-time-field]");
    if (dateTimeInput) {
      await handleDateTimeClick(dateTimeInput);
      return;
    }

    const button = event.target.closest("button[data-ro-action]");
    if (button) {
      await handleButtonClick(button, getROById);
    }
  });

  tableBody.addEventListener("dblclick", (event) => {
    const input = event.target.closest("[data-ro-long-text-field]");
    if (!input) return;

    openLongTextEditor(input);
  });
}

async function handleTextFieldBlur(input) {
  const roId = input.dataset.roId;
  const field = input.dataset.roTextField;

  if (!roId || !field) return;

  await updateRO(
    roId,
    {
      [field]: input.value.trim(),
    },
    {
      module: "ro-tracker",
      eventType: `${field}_updated`,
      message: `${field} updated`,
    },
  );
}

async function handleDateChange(input) {
  const roId = input.dataset.roId;
  const field = input.dataset.roDateField;
  const value = dateInputToMMDDYYYY(input.value);

  if (!roId || !field) return;

  const overlay = input.parentElement?.querySelector(".rt-dateoverlay");
  if (overlay) overlay.textContent = formatNoYearDate(value) || "";

  await updateRO(
    roId,
    {
      [field]: value,
    },
    {
      module: "ro-tracker",
      eventType: `${field}_updated`,
      message: `${field} updated`,
    },
  );
}

async function handleDateTimeClick(input) {
  const roId = input.dataset.roId;
  const field = input.dataset.roDateTimeField;
  const currentMs = Number(input.dataset.currentMs || 0) || null;
  const stepMin = Number(input.dataset.stepMin || 5);

  if (!roId || !field) return;

  const pickedMs = await pickDateTimeMs(
    "Select date/time",
    currentMs,
    stepMin,
    {
      anchorEl: input,
      schedule: {
        monFri: { start: "07:30", end: "18:00" },
        sat: { start: "08:00", end: "15:00" },
        sun: null,
      },
    },
  );
  if (!pickedMs) return;

  input.value = formatNoYearDateTime(pickedMs);
  input.dataset.currentMs = String(pickedMs);

  await updateRO(
    roId,
    {
      [field]: pickedMs,
    },
    {
      module: "ro-tracker",
      eventType: `${field}_updated`,
      message: `${field} updated`,
    },
  );
}

async function handleCheckboxChange(checkbox, getROById) {
  const roId = checkbox.dataset.roId;
  const action = checkbox.dataset.roAction;
  const ro = getROById(roId);

  if (!roId || !action || !ro) return;

  const checked = Boolean(checkbox.checked);

  if (action === "readyCalled") {
    if (!ro.techVideo) {
      checkbox.checked = false;
      return;
    }

    await updateRO(
      roId,
      {
        readyCalled: checked,
        status: checked ? "Ready called" : "",
        customerWaiting: checked ? false : Boolean(ro.customerWaiting),
        isWaiter: checked ? false : Boolean(ro.isWaiter),
        waiterMarkedAtMs: checked ? null : ro.waiterMarkedAtMs || null,
        waiterNextReminderAtMs: checked
          ? null
          : ro.waiterNextReminderAtMs || null,
        waiterReminderCount: checked ? 0 : ro.waiterReminderCount || 0,
        waiterLastSentAtMs: checked ? null : ro.waiterLastSentAtMs || null,
      },
      {
        module: "ro-tracker",
        eventType: "ready_called_updated",
        message: "Ready called updated",
      },
    );
  }

  if (action === "techVideo") {
    await updateRO(
      roId,
      {
        techVideo: checked,
        readyCalled: checked ? Boolean(ro.readyCalled) : false,
        status: checked ? ro.status || "" : "",
      },
      {
        module: "ro-tracker",
        eventType: "tech_video_updated",
        message: "Tech video updated",
      },
    );
  }

  if (action === "waiter") {
    const now = Date.now();

    await updateRO(
      roId,
      {
        customerWaiting: checked,
        isWaiter: checked,
        waiterMarkedAtMs: checked ? now : null,
        waiterNextReminderAtMs: checked ? now + 60 * 60 * 1000 : null,
        waiterReminderCount: 0,
        waiterLastSentAtMs: null,
      },
      {
        module: "ro-tracker",
        eventType: "waiter_updated",
        message: "Waiter updated",
      },
    );
  }
}

async function handleButtonClick(button, getROById) {
  const roId = button.dataset.roId;
  const action = button.dataset.roAction;
  const ro = getROById(roId);

  if (!roId || !action || !ro) return;

  if (action === "calledNow") {
    const now = Date.now();

    await updateRO(
      roId,
      {
        calledAtMs: now,
      },
      {
        module: "ro-tracker",
        eventType: "customer_called",
        message: "Customer called",
      },
    );

    return;
  }

  if (action === "textSent") {
    const phone = cleanPhone(ro.customerPhone || ro.phone);

    if (!phone) {
      alert("No phone number available");
      return;
    }

    const firstName = getFirstName(ro.customerName);
    const message = `Hello, ${firstName},`;
    window.location.href = `sms:+1${phone}?body=${encodeURIComponent(message)}`;
    return;
  }

  if (action === "archive") {
    alert("Archive workflow will be wired next.");
  }
}

function openLongTextEditor(input) {
  const roId = input.dataset.roId;
  const field = input.dataset.roLongTextField;

  if (!roId || !field) return;

  const overlay = document.createElement("div");
  overlay.className = "ro-text-editor-overlay";

  const box = document.createElement("div");
  box.className = "ro-text-editor-box";

  const title = document.createElement("div");
  title.className = "ro-text-editor-title";
  title.textContent = field === "notes" ? "Edit Notes" : "Edit Concern";

  const textarea = document.createElement("textarea");
  textarea.value = input.value || "";

  const buttonRow = document.createElement("div");
  buttonRow.className = "ro-text-editor-actions";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ro-small-action-button";
  cancel.textContent = "Cancel";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "ro-small-action-button";
  save.textContent = "Save";

  cancel.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  save.addEventListener("click", async () => {
    const value = textarea.value.trim();

    input.value = value;
    input.title = value;

    await updateRO(
      roId,
      {
        [field]: value,
      },
      {
        module: "ro-tracker",
        eventType: `${field}_updated`,
        message: `${field} updated`,
      },
    );

    document.body.removeChild(overlay);
  });

  buttonRow.appendChild(cancel);
  buttonRow.appendChild(save);

  box.appendChild(title);
  box.appendChild(textarea);
  box.appendChild(buttonRow);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  textarea.focus();
}

function formatPhoneInput(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function cleanPhone(value = "") {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 10);
}

function getFirstName(name = "") {
  return (
    String(name || "")
      .trim()
      .split(" ")[0] || ""
  );
}
