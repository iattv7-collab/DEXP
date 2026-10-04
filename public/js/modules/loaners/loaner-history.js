// ======================================================
// FILE: /public/js/modules/loaners/loaner-history.js
// PURPOSE:
// VIN file lookup. Click a match to expand its trips.
// An RO search lists every VIN that was on that RO.
// ======================================================

import {db} from "/js/services/firebase/firestore.js";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
 * @param {object} trip
 * @return {string}
 */
function tripLine(trip) {
  const back = trip.returnedAtText || "Still out";
  const ro = escapeHtml(trip.assignedRo || "");
  const customer = escapeHtml(trip.customerName || "");

  return `
    <div class="loaner-trip-line">
      <div>RO ${ro} · ${customer}</div>
      <div>Out ${escapeHtml(trip.outAtText || "")} · ${escapeHtml(trip.outMileage || "")} mi</div>
      <div>Back ${escapeHtml(back)} · ${escapeHtml(trip.returnMileage || "")} mi</div>
      <div>${escapeHtml(trip.fuelLevel || "")} · ${escapeHtml(trip.damageNotes || "")}</div>
      <div>${escapeHtml(trip.receivedByName || "")} · ${escapeHtml(trip.destination || "")}</div>
    </div>
  `;
}

/**
 * Watch this dealer's trips and draw matching VIN files.
 * @param {string} dealerId
 * @param {HTMLInputElement} searchInput
 * @param {HTMLElement} resultEl
 * @return {function(): void}
 */
export function startLoanerHistory(dealerId, searchInput, resultEl) {
  if (!dealerId || !searchInput || !resultEl) {
    return () => {};
  }

  let trips = [];

  const unsubscribe = onSnapshot(
      query(collection(db, "loanerTrips"), where("dealerId", "==", dealerId)),
      (snap) => {
        trips = snap.docs.map((tripDoc) => tripDoc.data() || {});
        render();
      },
      (error) => {
        console.error("Loaner history listener failed:", error);
      },
  );

  searchInput.addEventListener("input", render);

  /**
   * Draw one closed file per matching VIN.
   */
  function render() {
    const q = searchInput.value.trim().toUpperCase();

    if (!q) {
      resultEl.innerHTML = "<p class=\"small-muted\">Search a VIN, unit, or RO.</p>";
      return;
    }

    const matches = trips.filter((trip) => {
      return [
        trip.vin,
        trip.unitNumber,
        trip.assignedRo,
        trip.customerName,
        trip.plate,
      ].join(" ").toUpperCase().includes(q);
    });
    const byVin = new Map();

    matches.forEach((trip) => {
      const vin = String(trip.vin || "");

      if (!vin) {
        return;
      }

      if (!byVin.has(vin)) {
        byVin.set(vin, []);
      }

      byVin.get(vin).push(trip);
    });

    if (!byVin.size) {
      resultEl.innerHTML = "<p class=\"small-muted\">No loaner file matched.</p>";
      return;
    }

    resultEl.innerHTML = Array.from(byVin.entries()).map(([vin, vinTrips]) => {
      const newest = [...vinTrips].sort((a, b) => {
        return Number(b.outAtMs || 0) - Number(a.outAtMs || 0);
      });
      const head = newest[0] || {};
      const title = [
        head.unitNumber,
        head.year,
        head.make,
        head.model,
      ].filter(Boolean).join(" ");

      return `
        <details class="loaner-file">
          <summary>${escapeHtml(title || vin)} · ${escapeHtml(vin)}</summary>
          ${newest.map(tripLine).join("")}
        </details>
      `;
    }).join("");
  }

  return unsubscribe;
}
