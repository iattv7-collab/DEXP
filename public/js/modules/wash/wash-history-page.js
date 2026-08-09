// ======================================================
// FILE: /public/js/modules/wash/wash-history-page.js
// MODULE: Wash History
// PURPOSE:
// Read-only history of completed DEXP wash records.
// Combines completed Master RO washes and Courtesy Washes.
// Supports search and completion-date filtering.
// ======================================================

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  listenToCompletedCourtesyWashes,
} from "/js/services/firestore/courtesy-wash-service.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["wash"],
  });

  renderAppHeader();

  const session = await waitForSession();

  const rowsEl = $("washHistoryRows");
  const messageEl = $("washHistoryMessage");
  const searchEl = $("washHistorySearch");
  const fromEl = $("washHistoryFrom");
  const toEl = $("washHistoryTo");
  const clearFiltersButton =
    $("clearWashHistoryFiltersBtn");

  let completedRoRows = [];
  let completedCourtesyRows = [];

  function setMessage(message, ok = true) {
    if (!messageEl) {
      return;
    }

    messageEl.textContent = message || "";
    messageEl.style.color =
      ok ? "green" : "crimson";
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function isCourtesyWash(ticket) {
    return ticket?.sourceType === "courtesy";
  }

  function roValue(ticket) {
    if (isCourtesyWash(ticket)) {
      return clean(ticket.vinLast8 || "");
    }

    return clean(
      ticket.roNumber ||
      ticket.ro ||
      "",
    );
  }

  function tagValue(ticket) {
    if (isCourtesyWash(ticket)) {
      return "COURTESY";
    }

    return clean(
      ticket.tagNumber ||
      ticket.tag ||
      "",
    );
  }

  function vehicleValue(ticket) {
    return [
      ticket.year,
      ticket.make,
      ticket.model,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function advisorValue(ticket) {
    if (isCourtesyWash(ticket)) {
      return "";
    }

    return clean(
      ticket.advisorName ||
      ticket.advisorDisplayName ||
      ticket.advisorEmail ||
      ticket.advisorCompanyId ||
      "",
    );
  }

  function completedByValue(ticket) {
    return clean(
      ticket.washedByName ||
      ticket.washedByDisplayName ||
      ticket.updatedByName ||
      ticket.washedBy ||
      "",
    );
  }

  function locationValue(ticket) {
    if (isCourtesyWash(ticket)) {
      return "";
    }

    return clean(
      ticket.currentLocation ||
      ticket.location ||
      "",
    );
  }

  function notesValue(ticket) {
    if (isCourtesyWash(ticket)) {
      return [
        ticket.customerName,
        ticket.customerPhone,
      ]
        .filter(Boolean)
        .join(" • ");
    }

    return clean(
      ticket.washNotes ||
      ticket.notes ||
      "",
    );
  }

  function priorityLabel(ticket) {
    if (ticket.customerWaiting === true) {
      return "WAITER";
    }

    if (
      typeof ticket.needByAtMs === "number" &&
      ticket.needByAtMs > 0
    ) {
      return "NEED BY";
    }

    if (
      clean(ticket.priorityType).toLowerCase() ===
        "rewash" ||
      ticket.isRewashCycle === true
    ) {
      return "REWASH";
    }

    return "NORMAL";
  }

  function fmtTime(value) {
    if (!value) {
      return "";
    }

    if (
      typeof value?.toDate === "function"
    ) {
      return value
        .toDate()
        .toLocaleString([], {
          month: "numeric",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
    }

    if (typeof value === "number") {
      const date = new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "";
      }

      return date.toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "numeric",
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

  function startOfDateMs(dateValue) {
    if (!dateValue) {
      return null;
    }

    const [year, month, day] =
      dateValue
        .split("-")
        .map(Number);

    if (!year || !month || !day) {
      return null;
    }

    return new Date(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0,
    ).getTime();
  }

  function endOfDateMs(dateValue) {
    if (!dateValue) {
      return null;
    }

    const [year, month, day] =
      dateValue
        .split("-")
        .map(Number);

    if (!year || !month || !day) {
      return null;
    }

    return new Date(
      year,
      month - 1,
      day,
      23,
      59,
      59,
      999,
    ).getTime();
  }

  function getCompletedRows() {
    return [
      ...completedRoRows,
      ...completedCourtesyRows,
    ];
  }

  function getFilteredRows() {
    const search =
      clean(searchEl.value).toLowerCase();

    const fromMs =
      startOfDateMs(fromEl.value);

    const toMs =
      endOfDateMs(toEl.value);

    return getCompletedRows()
      .filter((ticket) => {
        const completedAtMs =
          Number(ticket.washedAtMs || 0);

        if (
          fromMs !== null &&
          completedAtMs < fromMs
        ) {
          return false;
        }

        if (
          toMs !== null &&
          completedAtMs > toMs
        ) {
          return false;
        }

        if (!search) {
          return true;
        }

        const searchableText = [
          roValue(ticket),
          tagValue(ticket),
          ticket.vin,
          ticket.vinLast8,
          vehicleValue(ticket),
          ticket.customerName,
          ticket.customerPhone,
          advisorValue(ticket),
          locationValue(ticket),
          ticket.priorityType,
          ticket.washNotes,
          ticket.notes,
          completedByValue(ticket),
          ticket.sourceType,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(
          search,
        );
      })
      .sort((ticketA, ticketB) => {
        return (
          Number(
            ticketB.washedAtMs || 0,
          ) -
          Number(
            ticketA.washedAtMs || 0,
          )
        );
      });
  }

  function renderRows() {
    const rows = getFilteredRows();

    if (!rows.length) {
      rowsEl.innerHTML = `
        <tr>
          <td colspan="12">
            No completed wash records found.
          </td>
        </tr>
      `;

      return;
    }

    rowsEl.innerHTML = rows
      .map((ticket) => {
        return `
          <tr>
            <td>
              <b>
                ${escapeHtml(
                  tagValue(ticket),
                )}
              </b>
            </td>

            <td>
              ${escapeHtml(
                roValue(ticket),
              )}
            </td>

            <td>
              ${escapeHtml(
                vehicleValue(ticket),
              )}
            </td>

            <td>
              ${escapeHtml(
                ticket.customerName || "",
              )}
            </td>

            <td>
              ${escapeHtml(
                advisorValue(ticket),
              )}
            </td>

            <td>
              ${escapeHtml(
                locationValue(ticket),
              )}
            </td>

            <td>
              ${escapeHtml(
                priorityLabel(ticket),
              )}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(ticket.needByAtMs),
              )}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(
                  ticket.washQueuedAtMs,
                ),
              )}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(
                  ticket.washingStartedAtMs,
                ),
              )}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(ticket.washedAtMs),
              )}
            </td>

            <td>
              ${escapeHtml(
                notesValue(ticket),
              )}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // ====================================================
  // NORMAL RO HISTORY
  // ====================================================

  function listenToRoWashHistory() {
    const historyQuery = query(
      collection(db, "ros"),
      where(
        "dealerId",
        "==",
        session.dealerId,
      ),
      where(
        "washStatus",
        "==",
        "washed",
      ),
    );

    return onSnapshot(
      historyQuery,
      (snapshot) => {
        completedRoRows =
          snapshot.docs.map(
            (documentSnapshot) => ({
              id: documentSnapshot.id,
              sourceType: "ro",
              ...documentSnapshot.data(),
            }),
          );

        renderRows();
      },
      (error) => {
        console.error(
          "RO Wash history failed:",
          error,
        );

        setMessage(
          error?.message ||
            "Could not load RO wash history.",
          false,
        );
      },
    );
  }

  // ====================================================
  // COURTESY WASH HISTORY
  // ====================================================

  function listenToCourtesyWashHistory() {
    return listenToCompletedCourtesyWashes(
      session.dealerId,
      (rows) => {
        completedCourtesyRows = rows;

        renderRows();
      },
      (error) => {
        setMessage(
          error?.message ||
            "Could not load Courtesy Wash history.",
          false,
        );
      },
    );
  }

  searchEl.addEventListener(
    "input",
    renderRows,
  );

  fromEl.addEventListener(
    "change",
    renderRows,
  );

  toEl.addEventListener(
    "change",
    renderRows,
  );

  clearFiltersButton.addEventListener(
    "click",
    () => {
      searchEl.value = "";
      fromEl.value = "";
      toEl.value = "";

      renderRows();
      searchEl.focus();
    },
  );

  listenToRoWashHistory();
  listenToCourtesyWashHistory();
});

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();

    if (existing?.dealerId) {
      resolve(existing);
      return;
    }

    window.addEventListener(
      "dexp-session-ready",
      () => resolve(getSession()),
      {
        once: true,
      },
    );
  });
}