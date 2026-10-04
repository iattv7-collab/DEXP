// ======================================================
// FILE: /public/js/modules/loaners/loaner-history.js
// PURPOSE:
// VIN file lookup. ROs list to the right. Click one to open it.
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
function tripDetail(trip) {
  const back = trip.returnedAtText || "Still out";

  return `
    <div class="loaner-trip-detail">
      <div>Customer ${escapeHtml(trip.customerName || "")}</div>
      <div>Out ${escapeHtml(trip.outAtText || "")} · ${escapeHtml(trip.outMileage || "")} mi</div>
      <div>Back ${escapeHtml(back)} · ${escapeHtml(trip.returnMileage || "")} mi</div>
      <div>Range ${escapeHtml(trip.fuelLevel || "")} · Damage ${escapeHtml(trip.damageNotes || "")}</div>
      <div>Received by ${escapeHtml(trip.receivedByName || "")} · Went to ${escapeHtml(trip.destination || "")}</div>
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
   * One VIN folder, ROs to the right, click opens that trip.
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
      const ros = newest.map((trip) => {
        const ro = String(trip.assignedRo || "");
        const open = q && ro.toUpperCase().includes(q) ? "open" : "";

        return `
          <details class="loaner-ro" ${open}>
            <summary>RO ${escapeHtml(ro || "none")} · ${escapeHtml(trip.outAtText || "")}</summary>
            ${tripDetail(trip)}
          </details>
        `;
      }).join("");

      return `
        <div class="loaner-file-row">
          <div class="loaner-file-vin">${escapeHtml(title || vin)}<br>${escapeHtml(vin)}</div>
          <div class="loaner-file-ros">${ros}</div>
        </div>
      `;
    }).join("");
  }

  return unsubscribe;
}
