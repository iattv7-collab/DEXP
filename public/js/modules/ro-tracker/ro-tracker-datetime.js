// public/js/modules/ro-tracker/ro-tracker-datetime.js

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseHM(hm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "").trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
}

function minutesToHM(minutes) {
  return {
    h: Math.floor(minutes / 60),
    m: minutes % 60,
  };
}

function formatTimeLabel(hour24, minute) {
  let hour = hour24;
  const suffix = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${pad2(minute)} ${suffix}`;
}

function msToParts(ms) {
  const date = ms ? new Date(ms) : new Date();

  return {
    yyyy: date.getFullYear(),
    mm: date.getMonth() + 1,
    dd: date.getDate(),
    h: date.getHours(),
    min: date.getMinutes(),
  };
}

function toDateInputValue(yyyy, mm, dd) {
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}

export function formatNoYearDateTime(ms) {
  if (!ms) return "";

  const date = new Date(Number(ms));
  if (Number.isNaN(date.getTime())) return "";

  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());

  let hour = date.getHours();
  const minute = pad2(date.getMinutes());
  const suffix = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${mm}/${dd} ${hour}:${minute} ${suffix}`;
}

export function formatNoYearDate(mmddyyyy) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(mmddyyyy || "").trim());
  if (!match) return "";

  return `${match[1]}/${match[2]}`;
}

export function dateInputToMMDDYYYY(value) {
  if (!value) return "";

  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return "";

  return `${month}/${day}/${year}`;
}

export function mmddyyyyToDateInput(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);

  if (!match) return "";

  return `${match[3]}-${match[1]}-${match[2]}`;
}

function dayHoursFor(schedule, yyyy, mm, dd) {
  if (!schedule) return null;

  const date = new Date(yyyy, mm - 1, dd);
  const day = date.getDay();

  if (day === 0) return schedule.sun || null;
  if (day === 6) return schedule.sat || null;

  return schedule.monFri || null;
}

function buildTimeOptionsForHours(stepMin, startMin, endMin) {
  const options = [];

  if (startMin == null || endMin == null) return options;
  if (endMin < startMin) return options;

  const start = Math.ceil(startMin / stepMin) * stepMin;
  const end = Math.floor(endMin / stepMin) * stepMin;

  for (let minutes = start; minutes <= end; minutes += stepMin) {
    options.push(minutesToHM(minutes));
  }

  return options;
}

function nearestStepMinute(minute, stepMin) {
  return Math.round(minute / stepMin) * stepMin;
}

function clampToRange(minute, startMin, endMin) {
  if (minute < startMin) return startMin;
  if (minute > endMin) return endMin;
  return minute;
}

function positionPickerNearCell(modal, anchorEl) {
  if (!anchorEl) return;

  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;

  const modalWidth = modal.offsetWidth || 520;
  const modalHeight = modal.offsetHeight || 260;

  let left = rect.left;
  let top = rect.bottom + margin;

  if (left + modalWidth > window.innerWidth - margin) {
    left = window.innerWidth - modalWidth - margin;
  }

  if (top + modalHeight > window.innerHeight - margin) {
    top = rect.top - modalHeight - margin;
  }

  if (left < margin) left = margin;
  if (top < margin) top = margin;

  modal.style.position = "fixed";
  modal.style.left = `${left}px`;
  modal.style.top = `${top}px`;
}

export function pickDateTimeMs(titleText = "Select date/time", initialMs = null, stepMin = 5, opts = {}) {
  const existing = document.getElementById("__rt_active_datetime_picker");
  if (existing) existing.remove();

  const schedule = opts.schedule || null;
  const showNow = !!opts.showNow;
  const anchorEl = opts.anchorEl || null;

  return new Promise((resolve) => {
    const initial = msToParts(initialMs);

    const backdrop = document.createElement("div");
    backdrop.id = "__rt_active_datetime_picker";
    backdrop.className = "rtp-backdrop";
    backdrop.style.background = "transparent";
    backdrop.style.alignItems = "flex-start";
    backdrop.style.justifyContent = "flex-start";

    const modal = document.createElement("div");
    modal.className = "rtp-modal";

    const title = document.createElement("div");
    title.className = "rtp-title";
    title.textContent = titleText;

    const rowDate = document.createElement("div");
    rowDate.className = "rtp-row";

    const labelDate = document.createElement("label");
    labelDate.textContent = "Date:";

    const inputDate = document.createElement("input");
    inputDate.type = "date";
    inputDate.value = toDateInputValue(initial.yyyy, initial.mm, initial.dd);

    rowDate.appendChild(labelDate);
    rowDate.appendChild(inputDate);

    const rowTime = document.createElement("div");
    rowTime.className = "rtp-row";

    const labelTime = document.createElement("label");
    labelTime.textContent = "Time:";

    const selectTime = document.createElement("select");

    rowTime.appendChild(labelTime);
    rowTime.appendChild(selectTime);

    if (showNow) {
      const buttonNow = document.createElement("button");
      buttonNow.className = "rtp-btn";
      buttonNow.type = "button";
      buttonNow.textContent = "Now";

      buttonNow.addEventListener("click", () => {
        const now = new Date();
        inputDate.value = toDateInputValue(
          now.getFullYear(),
          now.getMonth() + 1,
          now.getDate()
        );
        refreshTimes(true);
      });

      rowTime.appendChild(buttonNow);
    }

    const note = document.createElement("div");
    note.className = "rtp-note";

    const actions = document.createElement("div");
    actions.className = "rtp-actions";

    const buttonCancel = document.createElement("button");
    buttonCancel.className = "rtp-btn";
    buttonCancel.type = "button";
    buttonCancel.textContent = "Cancel";

    const buttonOk = document.createElement("button");
    buttonOk.className = "rtp-btn primary";
    buttonOk.type = "button";
    buttonOk.textContent = "OK";

    function close(value) {
      backdrop.remove();
      resolve(value);
    }

    buttonCancel.addEventListener("click", () => close(null));

    function getSelectedDateParts() {
      if (!inputDate.value) return null;

      const [yyyy, mm, dd] = inputDate.value.split("-").map(Number);
      if (!yyyy || !mm || !dd) return null;

      return { yyyy, mm, dd };
    }

    function refreshTimes(fromNowButton = false) {
      const parts = getSelectedDateParts();

      selectTime.innerHTML = "";

      if (!parts) {
        note.textContent = "";
        buttonOk.disabled = true;
        return;
      }

      const hours = dayHoursFor(schedule, parts.yyyy, parts.mm, parts.dd);

      let startMin = 0;
      let endMin = 23 * 60 + 59;
      let closed = false;

      if (schedule) {
        if (!hours) {
          closed = true;
        } else {
          const start = parseHM(hours.start);
          const end = parseHM(hours.end);

          if (start == null || end == null) {
            closed = true;
          } else {
            startMin = start;
            endMin = end;
          }
        }
      }

      if (closed) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Closed";

        selectTime.appendChild(option);
        selectTime.disabled = true;
        buttonOk.disabled = true;
        note.textContent = "Closed on this day.";
        return;
      }

      const options = buildTimeOptionsForHours(stepMin, startMin, endMin);

      if (!options.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No times";

        selectTime.appendChild(option);
        selectTime.disabled = true;
        buttonOk.disabled = true;
        note.textContent = "No valid times for this day.";
        return;
      }

      selectTime.disabled = false;
      buttonOk.disabled = false;

      let targetMin;

      if (fromNowButton) {
        const now = new Date();
        targetMin = now.getHours() * 60 + now.getMinutes();
      } else {
        targetMin = initial.h * 60 + initial.min;
      }

      targetMin = nearestStepMinute(targetMin, stepMin);
      targetMin = clampToRange(targetMin, startMin, endMin);

      options.forEach(({ h, m }) => {
        const option = document.createElement("option");
        option.value = `${h}:${m}`;
        option.textContent = formatTimeLabel(h, m);

        if (h * 60 + m === targetMin) {
          option.selected = true;
        }

        selectTime.appendChild(option);
      });

      if (schedule) {
        note.textContent = `Allowed hours: ${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)} – ${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
      } else {
        note.textContent = "";
      }
    }

    inputDate.addEventListener("change", () => refreshTimes(false));

    buttonOk.addEventListener("click", () => {
      const parts = getSelectedDateParts();
      if (!parts || !selectTime.value) return close(null);

      const [hour, minute] = selectTime.value.split(":").map(Number);
      const picked = new Date(parts.yyyy, parts.mm - 1, parts.dd, hour, minute, 0, 0);

      close(picked.getTime());
    });

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close(null);
      }
    });

    actions.appendChild(buttonCancel);
    actions.appendChild(buttonOk);

    modal.appendChild(title);
    modal.appendChild(rowDate);
    modal.appendChild(rowTime);
    modal.appendChild(note);
    modal.appendChild(actions);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    refreshTimes(false);

    window.requestAnimationFrame(() => {
      positionPickerNearCell(modal, anchorEl);
      inputDate.focus();
    });
  });
}