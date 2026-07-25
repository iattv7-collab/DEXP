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

import {
  markCpBooked,
  markWarrantyBooked,
} from "/js/modules/shared/booking-actions-service.js";

import {
  requestQc,
  markNoQcRequired,
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

  const canMarkWty = hasPermission(PERMISSIONS.BOOKING_WTY_MARK);

  const canRequestQc = hasPermission(PERMISSIONS.QC_REQUEST);

  const canMarkNoQc = hasPermission(PERMISSIONS.QC_NO_QC);

  const tableEl = $("ticketsTable");
  const msgEl = $("msg");
  const searchEl = $("searchInput");

  const myRosButton = $("myRosBtn");
  const allRosButton = $("allRosBtn");
  const advisorFilterEl = $("advisorFilter");
  const advisorViewLabel = $("advisorViewLabel");

  let rows = [];

  let currentView = session?.role === "advisor" ? "mine" : "all";

  let selectedAdvisorId = "";

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

      washStatus: "queued",

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

  function qcLabel(ticket) {
    const status = clean(ticket.qcStatus).toLowerCase();

    if (status === "requested") {
      return "Requested";
    }

    if (status === "working") {
      return "Working";
    }

    if (status === "complete") {
      return "Done";
    }

    if (status === "not_required") {
      return "No QC";
    }

    return "";
  }

  function washLabel(ticket) {
    const status = clean(ticket.washStatus).toLowerCase();

    if (status === "pending") {
      return "Pending";
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

  function render() {
    const filtered = getCurrentRows();

    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Tag</th>
          <th>RO</th>
          <th>Advisor</th>
          <th>Model</th>
          <th>Customer</th>
          <th>Location</th>
          <th>RO Status</th>
          <th>Wash</th>
          <th>Washed</th>
          <th>QC</th>
          <th>Pickup Status</th>
          <th>Need By</th>
          <th>Request Pickup</th>
          <th>Rewash</th>
          <th>CP Booked</th>
          <th>WTY Booked</th>
          <th>Request QC</th>
          <th>No QC</th>
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

                  return `
                    <tr data-id="${escapeHtml(ticket.id)}">
                      <td>
                        <b>
                          ${escapeHtml(tagValue(ticket))}
                        </b>
                      </td>

                      <td>
                        ${escapeHtml(roValue(ticket))}
                      </td>

                      <td>
                        ${escapeHtml(advisorNameValue(ticket))}
                      </td>

                      <td>
                        ${escapeHtml(vehicleValue(ticket))}
                      </td>

                      <td>
                        ${escapeHtml(ticket.customerName || "")}
                      </td>

                      <td>
                        ${escapeHtml(
                          ticket.currentLocation || ticket.location || "",
                        )}
                      </td>

                      <td>
                        ${escapeHtml(ticket.status || "")}
                      </td>

                      <td>
                        ${escapeHtml(washLabel(ticket))}
                      </td>

                      <td>
                        ${escapeHtml(fmtTime(ticket.washedAtMs))}
                      </td>

                      <td>
                        ${escapeHtml(qcLabel(ticket))}
                      </td>

                       <td>
                         ${escapeHtml(pickupLabel(ticket))}
                       </td>

                       <td>
                         <button
                           class="needByBtn"
                           type="button"
                         >
                           Need By
                         </button>
                       </td>

                       <td>
                         <button
                           class="pickupBtn"
                          ${
                            !canRequestPickup || pickupRequested
                              ? "disabled"
                              : ""
                          }
                        >
                          ${
                            pickupRequested
                              ? "Pickup Requested"
                              : "Request Pickup"
                          }
                        </button>
                      </td>

                      <td>
                        <button
                          class="rewashBtn"
                          ${
                            !canRequestRewash || !canRewashTicket
                              ? "disabled"
                              : ""
                          }
                        >
                          Request Rewash
                        </button>
                      </td>

                      <td>
                        <button
                          class="cpBookedBtn"
                          ${!canMarkCp || cpDone ? "disabled" : ""}
                        >
                          ${cpDone ? "CP Booked" : "Mark CP Booked"}
                        </button>
                      </td>

                      <td>
                        <button
                          class="wtyBookedBtn"
                          ${!canMarkWty || wtyDone ? "disabled" : ""}
                        >
                          ${wtyDone ? "WTY Booked" : "Mark WTY Booked"}
                        </button>
                      </td>

                      <td>
                        <button
                          class="requestQcBtn"
                          ${!canRequestQc || qcLocked ? "disabled" : ""}
                        >
                          Request QC
                        </button>
                      </td>

                      <td>
                        <button
                          class="noQcBtn"
                          ${!canMarkNoQc || qcLocked ? "disabled" : ""}
                        >
                          No QC Required
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join("")
            : `
              <tr>
                <td colspan="18">
                  No repair orders found.
                </td>
              </tr>
            `
        }
      </tbody>
    `;
  }

  tableEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button");

    const tableRow = event.target.closest("tr[data-id]");

    if (!button || !tableRow) {
      return;
    }

    const id = tableRow.dataset.id;

    try {
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

      if (button.classList.contains("wtyBookedBtn")) {
        await markWarrantyBooked(id);
        setMsg("Warranty booked.");
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

  watchDealerROs((dealerRows) => {
    rows = Array.isArray(dealerRows) ? dealerRows : [];

    populateAdvisorFilter();
    updateViewControls();
    render();
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
