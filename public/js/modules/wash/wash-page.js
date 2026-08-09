// ======================================================
// FILE: /public/js/modules/wash/wash-page.js
// MODULE: Wash
// PURPOSE:
// DEXP Wash Team page.
// Combines normal RO wash vehicles and Courtesy Wash
// vehicles into one operational wash queue.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  getWashSettings,
  setWashOpen,
} from "/js/services/firestore/wash-settings-service.js";

import {
  listenToActiveCourtesyWashes,
  setCourtesyWashStatus,
  removeCourtesyWashFromQueue,
} from "/js/services/firestore/courtesy-wash-service.js";

import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["wash"],
  });

  renderAppHeader();

  const rowsEl = $("washRows");
  const msgEl = $("msg");
  const openBtn = $("openWashBtn");
  const closeBtn = $("closeWashBtn");
  const badge = $("isOpenBadge");

  let currentSession = await waitForSession();
  let currentDealerId = currentSession?.dealerId || "";
  let washIsOpen = true;

  let roWashRows = [];
  let courtesyWashRows = [];

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
        { once: true },
      );
    });
  }

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function isCourtesyWash(ticket) {
    return ticket?.sourceType === "courtesy";
  }

  function roValue(ticket) {
    return clean(ticket.roNumber || ticket.ro || "");
  }

  function tagValue(ticket) {
    return clean(ticket.tagNumber || ticket.tag || "");
  }

  function vehicleValue(ticket) {
    return [ticket.year, ticket.make, ticket.model]
      .filter(Boolean)
      .join(" ");
  }

  function fmtTime(value) {
    if (!value) return "";

    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    if (typeof value === "number") {
      return new Date(value).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return "";
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
      clean(ticket.priorityType).toLowerCase() === "rewash"
    ) {
      return "REWASH";
    }

    return "NORMAL";
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

  function washEvent(type) {
    return {
      type,
      atMs: Date.now(),
      by: auth.currentUser?.uid || "",
      role: currentSession?.role || "unknown",
      cycle: "wash",
    };
  }

  function auditPatch() {
    const user = auth.currentUser;

    return {
      updatedAt: serverTimestamp(),
      updatedByUid: user?.uid || "",
      updatedByName: clean(user?.displayName || ""),
      updatedByEmail: clean(user?.email || ""),
      lastEditedAtMs: Date.now(),
      lastEditedBy: user?.uid || "",
      lastEditedRole:
        currentSession?.role || "unknown",
    };
  }

  // ====================================================
  // NORMAL RO WASH ACTIONS
  // ====================================================

  async function setRoWashStatus(ticketId, nextStatus) {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Not signed in.");
    }

    const status = clean(nextStatus).toLowerCase();

    if (!["washing", "washed"].includes(status)) {
      throw new Error("Invalid wash status.");
    }

    const ref = doc(db, "ros", ticketId);
    const nowMs = Date.now();

    const patch = {
      washStatus: status,
      ...auditPatch(),
    };

    if (status === "washing") {
      patch.washingStartedAt = serverTimestamp();
      patch.washingStartedAtMs = nowMs;
      patch.washingStartedBy = user.uid;

      patch.washEvents = arrayUnion(
        washEvent("wash_start"),
      );

      patch.lastEditedFields = [
        "washStatus",
        "washingStartedAt",
        "washingStartedAtMs",
        "washingStartedBy",
      ];
    }

    if (status === "washed") {
      patch.washedAt = serverTimestamp();
      patch.washedAtMs = nowMs;
      patch.washedBy = user.uid;

      patch.priorityType = "normal";
      patch.washWaiterAtMs = null;
      patch.rewashRequestedAtMs = null;
      patch.rewashRequestedBy = null;
      patch.isRewashCycle = false;

      patch.washEvents = arrayUnion(
        washEvent("wash_complete"),
      );

      patch.lastEditedFields = [
        "washStatus",
        "washedAt",
        "washedAtMs",
        "washedBy",
        "priorityType",
        "washWaiterAtMs",
      ];
    }

    await updateDoc(ref, patch);
  }

  async function removeRoFromWashQueue(ticketId) {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Not signed in.");
    }

    await updateDoc(doc(db, "ros", ticketId), {
      washStatus: "",
      washQueuedAt: null,
      washQueuedAtMs: null,
      washQueuedBy: null,

      washingStartedAt: null,
      washingStartedAtMs: null,
      washingStartedBy: null,

      washedAt: null,
      washedAtMs: null,
      washedBy: null,

      washWaiterAtMs: null,
      washNotes: "",

      priorityType: "normal",

      needByAtMs: null,
      needBySetBy: null,

      isRewashCycle: false,
      rewashRequestedAtMs: null,
      rewashRequestedBy: null,

      washEvents: arrayUnion(
        washEvent("wash_removed"),
      ),

      ...auditPatch(),

      lastEditedFields: [
        "washStatus",
        "washQueuedAt",
        "washQueuedAtMs",
        "washQueuedBy",
        "washingStartedAt",
        "washingStartedAtMs",
        "washingStartedBy",
        "washedAt",
        "washedAtMs",
        "washedBy",
        "washWaiterAtMs",
        "washNotes",
        "priorityType",
        "needByAtMs",
        "needBySetBy",
        "isRewashCycle",
        "rewashRequestedAtMs",
        "rewashRequestedBy",
      ],
    });
  }

  // ====================================================
  // COMBINED QUEUE
  // ====================================================

  function getCombinedRows() {
    return [
      ...roWashRows,
      ...courtesyWashRows,
    ];
  }

  function sortWashRows(rows) {
    return [...rows].sort((a, b) => {
      const aStatus =
        clean(a.washStatus).toLowerCase();

      const bStatus =
        clean(b.washStatus).toLowerCase();

      // Vehicles already washing stay first.
      if (aStatus !== bStatus) {
        if (aStatus === "washing") return -1;
        if (bStatus === "washing") return 1;
      }

      const aNeedBy =
        typeof a.needByAtMs === "number" &&
        a.needByAtMs > 0;

      const bNeedBy =
        typeof b.needByAtMs === "number" &&
        b.needByAtMs > 0;

      // Need By before normal vehicles.
      if (aNeedBy !== bNeedBy) {
        return aNeedBy ? -1 : 1;
      }

      if (aNeedBy && bNeedBy) {
        if (a.needByAtMs !== b.needByAtMs) {
          return a.needByAtMs - b.needByAtMs;
        }
      }

      const aWaiter = a.customerWaiting === true;
      const bWaiter = b.customerWaiting === true;

      // Waiters next.
      if (aWaiter !== bWaiter) {
        return aWaiter ? -1 : 1;
      }

      if (aWaiter && bWaiter) {
        return (
          Number(
            a.washWaiterAtMs ||
              a.waiterMarkedAtMs ||
              a.washQueuedAtMs ||
              0,
          ) -
          Number(
            b.washWaiterAtMs ||
              b.waiterMarkedAtMs ||
              b.washQueuedAtMs ||
              0,
          )
        );
      }

      const aRewash =
        aStatus === "rewash_requested";

      const bRewash =
        bStatus === "rewash_requested";

      // Rewash before normal vehicles.
      if (aRewash !== bRewash) {
        return aRewash ? -1 : 1;
      }

      if (aRewash && bRewash) {
        return (
          Number(
            a.rewashRequestedAtMs ||
              a.washQueuedAtMs ||
              0,
          ) -
          Number(
            b.rewashRequestedAtMs ||
              b.washQueuedAtMs ||
              0,
          )
        );
      }

      // Courtesy Wash is NORMAL priority.
      // All normal vehicles remain first-come,
      // first-served by queue time.
      return (
        Number(a.washQueuedAtMs || 0) -
        Number(b.washQueuedAtMs || 0)
      );
    });
  }

  function renderCombinedQueue() {
    renderRows(getCombinedRows());
  }

  function renderRows(rows) {
    const sorted = sortWashRows(rows);

    if (!sorted.length) {
      rowsEl.innerHTML = `
        <tr>
          <td colspan="13">
            No active wash tickets.
          </td>
        </tr>
      `;

      return;
    }

    rowsEl.innerHTML = sorted
      .map((ticket) => {
        const status =
          clean(ticket.washStatus).toLowerCase();

        const courtesy =
          isCourtesyWash(ticket);

        const statusLabel =
          status === "rewash_requested"
            ? "Rewash Requested"
            : status;

        const startDisabled =
          !washIsOpen ||
          ![
            "pending",
            "rewash_requested",
          ].includes(status)
            ? "disabled"
            : "";

        const doneDisabled =
          status !== "washing"
            ? "disabled"
            : "";

        const tagDisplay = courtesy
          ? "COURTESY"
          : tagValue(ticket);

        const roDisplay = courtesy
          ? clean(ticket.vinLast8 || "")
          : roValue(ticket);

        const modelDisplay = courtesy
          ? vehicleValue(ticket)
          : clean(ticket.model || "");

        const locationDisplay = courtesy
          ? ""
          : clean(
              ticket.currentLocation ||
                ticket.location ||
                "",
            );

        const notesDisplay = courtesy
          ? [
              ticket.customerName,
              ticket.customerPhone,
            ]
              .filter(Boolean)
              .join(" • ")
          : clean(
              ticket.washNotes ||
                ticket.notes ||
                "",
            );

        return `
          <tr
            data-id="${escapeHtml(ticket.id)}"
            data-source="${courtesy ? "courtesy" : "ro"}"
          >
            <td>
              <b>${escapeHtml(tagDisplay)}</b>
            </td>

            <td>
              ${escapeHtml(roDisplay)}
            </td>

            <td>
              ${escapeHtml(modelDisplay)}
            </td>

            <td>
              ${escapeHtml(locationDisplay)}
            </td>

            <td>
              ${escapeHtml(priorityLabel(ticket))}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(ticket.needByAtMs),
              )}
            </td>

            <td>
              ${escapeHtml(statusLabel)}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(ticket.washQueuedAtMs),
              )}
            </td>

            <td>
              ${escapeHtml(
                fmtTime(ticket.washingStartedAtMs),
              )}
            </td>

            <td>
              ${escapeHtml(notesDisplay)}
            </td>

            <td>
              <button
                class="startWashBtn"
                ${startDisabled}
              >
                Start
              </button>
            </td>

            <td>
              <button
                class="markWashedBtn"
                ${doneDisabled}
              >
                Done
              </button>
            </td>

            <td>
              <button class="removeWashBtn">
                Remove
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // ====================================================
  // NORMAL RO LISTENER
  // ====================================================

  function listenRoWashRows() {
    const activeQuery = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where(
        "washStatus",
        "in",
        [
          "pending",
          "rewash_requested",
          "washing",
        ],
      ),
    );

    return onSnapshot(
      activeQuery,
      (snapshot) => {
        roWashRows = snapshot.docs.map(
          (documentSnapshot) => ({
            id: documentSnapshot.id,
            sourceType: "ro",
            ...documentSnapshot.data(),
          }),
        );

        renderCombinedQueue();
      },
      (error) => {
        console.error(
          "RO Wash listener failed:",
          error,
        );

        setMsg(
          error?.message ||
            "Could not load RO wash queue.",
          false,
        );
      },
    );
  }

  // ====================================================
  // COURTESY WASH LISTENER
  // ====================================================

  function listenCourtesyWashRows() {
    return listenToActiveCourtesyWashes(
      currentDealerId,
      (rows) => {
        courtesyWashRows = rows;

        renderCombinedQueue();
      },
      (error) => {
        setMsg(
          error?.message ||
            "Could not load Courtesy Wash queue.",
          false,
        );
      },
    );
  }

  // ====================================================
  // WASH DAY SETTINGS
  // ====================================================

  async function loadWashSettings() {
    const settings = await getWashSettings();

    updateWashDayControls(settings.isOpen);
  }

  function updateWashDayControls(isOpen) {
    washIsOpen = Boolean(isOpen);

    badge.textContent =
      washIsOpen ? "OPEN" : "CLOSED";

    openBtn.disabled = washIsOpen;
    closeBtn.disabled = !washIsOpen;

    renderCombinedQueue();
  }

  openBtn.addEventListener("click", async () => {
    try {
      const settings = await setWashOpen(true);

      updateWashDayControls(settings.isOpen);

      setMsg("Wash day opened.");
    } catch (error) {
      console.error(error);

      setMsg(
        "Could not open the wash day.",
        false,
      );
    }
  });

  closeBtn.addEventListener("click", async () => {
    try {
      const settings = await setWashOpen(false);

      updateWashDayControls(settings.isOpen);

      setMsg("Wash day closed.");
    } catch (error) {
      console.error(error);

      setMsg(
        "Could not close the wash day.",
        false,
      );
    }
  });

  // ====================================================
  // QUEUE ACTIONS
  // ====================================================

  rowsEl.addEventListener("click", async (event) => {
    const button =
      event.target.closest("button");

    const row =
      event.target.closest("tr[data-id]");

    if (!button || !row) {
      return;
    }

    const ticketId = row.dataset.id;
    const sourceType = row.dataset.source;

    const courtesy =
      sourceType === "courtesy";

    try {
      if (
        button.classList.contains(
          "startWashBtn",
        )
      ) {
        if (!washIsOpen) {
          setMsg("Wash is closed.", false);
          return;
        }

        if (courtesy) {
          await setCourtesyWashStatus(
            ticketId,
            "washing",
          );
        } else {
          await setRoWashStatus(
            ticketId,
            "washing",
          );
        }

        setMsg("Marked as washing.");
      }

      if (
        button.classList.contains(
          "markWashedBtn",
        )
      ) {
        if (courtesy) {
          await setCourtesyWashStatus(
            ticketId,
            "washed",
          );
        } else {
          await setRoWashStatus(
            ticketId,
            "washed",
          );
        }

        setMsg("Marked as washed.");
      }

      if (
        button.classList.contains(
          "removeWashBtn",
        )
      ) {
        const confirmed = confirm(
          "Remove this vehicle from the wash queue?",
        );

        if (!confirmed) {
          return;
        }

        if (courtesy) {
          await removeCourtesyWashFromQueue(
            ticketId,
          );
        } else {
          await removeRoFromWashQueue(
            ticketId,
          );
        }

        setMsg(
          "Vehicle removed from wash queue.",
        );
      }
    } catch (error) {
      console.error(error);

      setMsg(
        error?.message ||
          "Error updating wash ticket.",
        false,
      );
    }
  });

  // ====================================================
  // INITIALIZE
  // ====================================================

  await loadWashSettings();

  listenRoWashRows();
  listenCourtesyWashRows();
});