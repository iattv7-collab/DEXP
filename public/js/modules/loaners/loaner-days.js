// ======================================================
// FILE: /public/js/modules/loaners/loaner-days.js
// PURPOSE:
// Loaner days-out math and the advisor card.
// Change this file only when the estimate changes.
// ======================================================

/**
 * Calendar days from out to end. Same day counts as 1.
 * @param {number} outAtMs
 * @param {number} endAtMs
 * @return {number}
 */
export function loanerDayCount(outAtMs, endAtMs) {
  const start = new Date(Number(outAtMs));
  const end = new Date(Number(endAtMs));

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 0;
  }

  const startDay = Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
  );
  const endDay = Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
  );
  const diff = Math.round((endDay - startDay) / 86400000);

  return Math.max(1, diff);
}

/**
 * Month standing for one advisor. Open loans stay out of the average.
 * @param {Array<object>} trips
 * @param {string} advisorId
 * @param {number} nowMs
 * @return {object}
 */
export function summarizeLoanerDays(trips, advisorId, nowMs = Date.now()) {
  const advisor = String(advisorId || "").trim();
  const now = new Date(nowMs);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
  ).getTime();
  const mine = (Array.isArray(trips) ? trips : []).filter((trip) => {
    return String(trip.advisorId || "").trim() === advisor;
  });
  const closed = mine.filter((trip) => {
    const returnedAtMs = Number(trip.returnedAtMs || 0);

    return returnedAtMs >= monthStart && returnedAtMs < monthEnd;
  });
  const open = mine
      .filter((trip) => {
        return String(trip.status || "") === "open" ||
          !Number(trip.returnedAtMs || 0);
      })
      .map((trip) => {
        return {
          ...trip,
          daysSoFar: loanerDayCount(trip.outAtMs, nowMs),
        };
      });
  const loans = closed.length;
  const totalDays = closed.reduce((sum, trip) => {
    return sum + loanerDayCount(trip.outAtMs, trip.returnedAtMs);
  }, 0);

  return {
    loans,
    totalDays,
    averageDays: loans ? totalDays / loans : 0,
    open,
  };
}

/**
 * @param {string} value
 * @return {string}
 */
function escapeHtml(value) {
  const amp = "&" + "amp;";
  const lt = "&" + "lt;";
  const gt = "&" + "gt;";
  const quot = "&" + "quot;";
  const apos = "&" + "#039;";

  return String(value || "")
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos);
}

/**
 * @param {number} days
 * @return {string}
 */
function summaryDays(days) {
  const count = Number(days || 0);

  return count === 1 ? "1 day" : `${count} days`;
}

/**
 * Draw the advisor card. Empty advisor clears it.
 * @param {HTMLElement} container
 * @param {Array<object>} trips
 * @param {string} advisorId
 * @param {string} advisorName
 */
export function renderLoanerDaysCard(container, trips, advisorId, advisorName) {
  if (!container) {
    return;
  }

  if (!advisorId) {
    container.innerHTML = "";
    return;
  }

  const summary = summarizeLoanerDays(trips, advisorId);
  const averageText = summary.loans ? summary.averageDays.toFixed(1) : "0";
  const openRows = summary.open.length ?
    summary.open.map((trip) => {
      const ro = escapeHtml(trip.assignedRo || "");
      const unit = escapeHtml(trip.unitNumber || "");

      return `<div>RO ${ro} · unit ${unit} · ${summaryDays(trip.daysSoFar)} so far</div>`;
    }).join("") :
    "<div>No open loan.</div>";

  container.innerHTML = `
    <div class="loaner-days-card">
      <strong>${escapeHtml(advisorName || "Advisor")} loaner days</strong>
      <span>This month, returned loans only. A same-day loan counts as 1.</span>
      <div class="loaner-days-numbers">
        <span>Loans ${summary.loans}</span>
        <span>Days ${summary.totalDays}</span>
        <span>Average ${averageText}</span>
      </div>
      <div class="loaner-days-open">
        <em>Open, not in the average</em>
        ${openRows}
      </div>
    </div>
  `;
}
