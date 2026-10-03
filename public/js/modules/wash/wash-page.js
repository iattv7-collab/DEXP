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
  updateWashSettings,
} from "/js/services/firestore/wash-settings-service.js";

import { getDayPlan } from "/js/services/firestore/wash-capacity-service.js";

import { projectWashQueue } from "/js/services/firestore/wash-capacity-service.js";

import {
  listenToActiveCourtesyWashes,
  setCourtesyWashStatus,
  removeCourtesyWashFromQueue,
} from "/js/services/firestore/courtesy-wash-service.js";

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
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
  const autoFollowEl = $("autoFollowHours");
  const saveHoursBtn = $("saveHoursBtn");

  let currentSession = await waitForSession();
  let currentDealerId = currentSession?.dealerId || "";
  let washIsOpen = true;
  let currentWashSettings = null;

  let roWashRows = [];
  let courtesyWashRows = [];
  const lateNeedByNotified = new Set();

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

  function isWaiterTicket(ticket) {
    return ticket?.customerWaiting === true || ticket?.isWaiter === true;
  }

  function isFutureAtRiskNeedBy(ticket, nowMs = Date.now()) {
    const needBy =
      typeof ticket.needByAtMs === "number" && ticket.needByAtMs > 0
        ? ticket.needByAtMs
        : 0;

    if (!needBy) return false;

    return needBy > nowMs && needBy <= nowMs + 45 * 60 * 1000;
  }

  function vehicleValue(ticket) {
    return [ticket.year, ticket.make, ticket.model].filter(Boolean).join(" ");
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
    if (isFutureAtRiskNeedBy(ticket)) {
      return "NEED BY";
    }

    if (isWaiterTicket(ticket)) {
      return "WAITER";
    }

    if (isCourtesyWash(ticket)) {
      return "COURTESY";
    }

    if (typeof ticket.needByAtMs === "number" && ticket.needByAtMs > 0) {
      return "NEED BY";
    }

    if (
      clean(ticket.priorityType).toLowerCase() === "rewash" ||
      clean(ticket.washStatus).toLowerCase() === "rewash_requested"
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
      lastEditedRole: currentSession?.role || "unknown",
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

      patch.washEvents = arrayUnion(washEvent("wash_start"));

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

      patch.washEvents = arrayUnion(washEvent("wash_complete"));

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

      washEvents: arrayUnion(washEvent("wash_removed")),

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

  async function notifyAdvisorNeedByLate(tickets) {
    for (const ticket of tickets) {
      if (!ticket?.needByMissed) {
        continue;
      }

      if (isCourtesyWash(ticket)) {
        continue;
      }

      const advisorId = clean(ticket.advisorId);

      if (!advisorId) {
        continue;
      }

      const needBy = Number(ticket.needByAtMs || 0);
      const alertId = `needby-late-${ticket.id}-${needBy}`;

      if (lateNeedByNotified.has(alertId)) {
        continue;
      }

      const alertRef = doc(db, "notificationRequests", alertId);
      const existing = await getDoc(alertRef);

      if (existing.exists()) {
        lateNeedByNotified.add(alertId);
        continue;
      }

      const roNumber = roValue(ticket);
      const projectedLabel = fmtTime(ticket.projectedFinishAtMs);
      const needByLabel = fmtTime(needBy);

      await setDoc(alertRef, {
        id: alertId,
        dealerId: currentDealerId,
        module: "advisor",
        eventType: "needby_late",
        title: "Wash late for Need By",
        message: `RO ${roNumber} Need By ${needByLabel}, projected ${projectedLabel}.`,
        status: "active",
        targetType: "user",
        targetUserId: advisorId,
        targetUserName: clean(ticket.advisorName || ""),
        route: "/pages/advisor/advisor.html",
        routeParams: {
          roId: ticket.id,
          roNumber,
        },
        relatedRoId: ticket.id,
        relatedRoNumber: roNumber,
        relatedTagNumber: tagValue(ticket),
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
        createdBy: auth.currentUser?.uid || "",
        createdByName: clean(auth.currentUser?.displayName || ""),
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
        resolvedAt: null,
        resolvedAtMs: null,
        openedBy: "",
        openedAtMs: null,
      });

      lateNeedByNotified.add(alertId);
    }
  }

  function getCombinedRows() {
    return [...roWashRows, ...courtesyWashRows];
  }

  function getCombinedRows() {
    return [...roWashRows, ...courtesyWashRows];
  }

  function sortWashRows(rows) {
    function sentAt(ticket) {
      return Number(ticket.washQueuedAtMs || ticket.createdAtMs || 0);
    }

    function hasNeedBy(ticket) {
      return Number(ticket.needByAtMs || 0) > 0;
    }

    // Waiter, courtesy, or a set Need By holds the spot.
    // A car with none of those can be pushed back.
    function lane(ticket) {
      if (isWaiterTicket(ticket) || isCourtesyWash(ticket)) return 0;
      if (hasNeedBy(ticket)) return 1;
      return 2;
    }

    return [...rows].sort((a, b) => {
      const aStatus = clean(a.washStatus).toLowerCase();
      const bStatus = clean(b.washStatus).toLowerCase();

      if (aStatus === "washing" && bStatus !== "washing") return -1;
      if (bStatus === "washing" && aStatus !== "washing") return 1;

      const aLane = lane(a);
      const bLane = lane(b);

      if (aLane !== bLane) return aLane - bLane;

      return sentAt(a) - sentAt(b);
    });
  }

  function renderCombinedQueue() {
    renderRows(getCombinedRows());
  }

  function renderRows(rows) {
    const sorted = projectWashQueue(
      sortWashRows(rows),
      currentWashSettings || {},
    );

    notifyAdvisorNeedByLate(sorted).catch((error) => {
      console.error("Need By late alert failed:", error);
    });

    if (!sorted.length) {
      rowsEl.innerHTML = `
        <tr>
          <td colspan="15">
            No active wash tickets.
          </td>
        </tr>
      `;

      return;
    }

    rowsEl.innerHTML = sorted
      .map((ticket) => {
        const status = clean(ticket.washStatus).toLowerCase();

        const courtesy = isCourtesyWash(ticket);

        const statusLabel =
          status === "rewash_requested" ? "Rewash Requested" : status;

        const startDisabled =
          !washIsOpen || !["pending", "rewash_requested"].includes(status)
            ? "disabled"
            : "";

        const doneDisabled = status !== "washing" ? "disabled" : "";

        const removeButton = canEditWashSettings()
          ? `<button class="removeWashBtn" type="button">Remove</button>`
          : "";

        const tagDisplay = courtesy ? "COURTESY" : tagValue(ticket);

        const roDisplay = courtesy
          ? clean(ticket.vinLast8 || "")
          : roValue(ticket);

        const modelDisplay = courtesy
          ? vehicleValue(ticket)
          : clean(ticket.model || "");

        const locationDisplay = courtesy
          ? ""
          : clean(ticket.currentLocation || ticket.location || "");

        const notesDisplay = courtesy
          ? [ticket.customerName, ticket.customerPhone]
            .filter(Boolean)
            .join(" • ")
          : clean(ticket.washNotes || ticket.notes || "");

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
              ${escapeHtml(fmtTime(ticket.needByAtMs))}
            </td>

            <td style="${
              ticket.needByMissed
                ? "color:crimson;font-weight:700;"
                : ""
            }">
              ${escapeHtml(fmtTime(ticket.projectedFinishAtMs))}
            </td>

            <td>
              ${escapeHtml(statusLabel)}
            </td>

            <td>
              ${escapeHtml(fmtTime(ticket.washQueuedAtMs))}
            </td>

            <td>
              ${escapeHtml(
                ticket.washQueuedByName ||
                  ticket.updatedByName ||
                  ticket.createdByName ||
                  "",
              )}
            </td>

            <td>
              ${escapeHtml(fmtTime(ticket.washingStartedAtMs))}
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
      where("washStatus", "in", ["pending", "rewash_requested", "washing"]),
    );

    return onSnapshot(
      activeQuery,
      (snapshot) => {
        roWashRows = snapshot.docs.map((documentSnapshot) => ({
          id: documentSnapshot.id,
          sourceType: "ro",
          ...documentSnapshot.data(),
        }));

        renderCombinedQueue();
      },
      (error) => {
        console.error("RO Wash listener failed:", error);

        setMsg(error?.message || "Could not load RO wash queue.", false);
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
        setMsg(error?.message || "Could not load Courtesy Wash queue.", false);
      },
    );
  }

  // ====================================================
  // WASH DAY SETTINGS
  // ====================================================

  const hourFields = ["mfOpen", "mfClose", "satOpen", "satClose", "sunOpen", "sunClose"];
  let savedHours = null;

  function canEditWashSettings() {
    const modules = currentSession?.assignedModules || currentSession?.modules || [];

    return (
      currentSession?.role === "admin" ||
      modules.includes("wash-settings")
    );
  }

  function currentHours() {
    return {
      autoFollowHours: Boolean(autoFollowEl.checked),
      crewCanControlDay: Boolean($("crewCanControlDay").checked),
      mfOpen: $("mfOpen").value,
      mfClose: $("mfClose").value,
      satOpen: $("satOpen").value,
      satClose: $("satClose").value,
      sunOpen: $("sunOpen").value,
      sunClose: $("sunClose").value,
    };
  }

  function hoursDirty() {
    return JSON.stringify(currentHours()) !== JSON.stringify(savedHours);
  }

  function refreshSaveButton() {
    saveHoursBtn.disabled = !hoursDirty();
  }

  function fillHourFields(settings) {
    autoFollowEl.checked = Boolean(settings?.autoFollowHours);
    $("crewCanControlDay").checked = Boolean(settings?.crewCanControlDay);

    hourFields.forEach((field) => {
      const input = $(field);

      if (input) {
        input.value = settings?.[field] || "";
      }
    });

    savedHours = currentHours();
    refreshSaveButton();
  }

  function insideShopHours(settings, nowMs = Date.now()) {
    const plan = getDayPlan(settings, nowMs);

    return Boolean(plan.bays) && nowMs >= plan.openMs && nowMs < plan.closeMs;
  }

  async function loadWashSettings() {
    currentWashSettings = await getWashSettings();
    fillHourFields(currentWashSettings);

    if (currentWashSettings.autoFollowHours) {
      const shouldOpen = insideShopHours(currentWashSettings);

      if (Boolean(currentWashSettings.isOpen) !== shouldOpen) {
        if (!shouldOpen) {
          await clearOvernightWaiters();
        }

        currentWashSettings = await setWashOpen(shouldOpen);
      }
    }

    updateWashDayControls(currentWashSettings.isOpen);
  }

  function updateWashDayControls(isOpen) {
    washIsOpen = Boolean(isOpen);

    badge.textContent = washIsOpen ? "OPEN" : "CLOSED";

    const automatic = Boolean(autoFollowEl?.checked);
    const crewCan = Boolean(currentWashSettings?.crewCanControlDay);
    const crewBox = $("crewDayControl");

    if (crewBox) {
      crewBox.hidden = !crewCan || canEditWashSettings();
    }

    openBtn.disabled = automatic || washIsOpen;
    closeBtn.disabled = automatic || !washIsOpen;

    const openCrew = $("openWashBtnCrew");
    const closeCrew = $("closeWashBtnCrew");

    if (openCrew) openCrew.disabled = automatic || washIsOpen;
    if (closeCrew) closeCrew.disabled = automatic || !washIsOpen;

    renderCombinedQueue();
  }

  $("openWashBtnCrew")?.addEventListener("click", () => openBtn.click());
  $("closeWashBtnCrew")?.addEventListener("click", () => closeBtn.click());

  openBtn.addEventListener("click", async () => {
    try {
      const settings = await setWashOpen(true);

      currentWashSettings = settings;

      updateWashDayControls(settings.isOpen);

      setMsg("Wash day opened.");
    } catch (error) {
      console.error(error);

      setMsg("Could not open the wash day.", false);
    }
  });

  saveHoursBtn.addEventListener("click", async () => {
    try {
      const settings = await updateWashSettings({
        autoFollowHours: autoFollowEl.checked,
        mfOpen: $("mfOpen").value,
        mfClose: $("mfClose").value,
        satOpen: $("satOpen").value,
        satClose: $("satClose").value,
        sunOpen: $("sunOpen").value,
        sunClose: $("sunClose").value,
      });

      currentWashSettings = settings;
      await loadWashSettings();
      savedHours = currentHours();
      refreshSaveButton();
      setMsg("Shop hours saved.");
    } catch (error) {
      console.error(error);
      setMsg("Could not save shop hours.", false);
    }
  });

  async function clearOvernightWaiters() {
    const activeQuery = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where("washStatus", "in", ["pending", "rewash_requested", "washing"]),
    );

    const snapshot = await getDocs(activeQuery);

    await Promise.all(
      snapshot.docs
        .filter((documentSnapshot) => {
          const ticket = documentSnapshot.data();

          return ticket.customerWaiting === true || ticket.isWaiter === true;
        })
        .map((documentSnapshot) =>
          updateDoc(documentSnapshot.ref, {
            customerWaiting: false,
            isWaiter: false,
            washWaiterAtMs: null,
            priorityType: "normal",
            ...auditPatch(),
            lastEditedFields: [
              "customerWaiting",
              "isWaiter",
              "washWaiterAtMs",
              "priorityType",
            ],
          }),
        ),
    );
  }

  closeBtn.addEventListener("click", async () => {
    try {
      await clearOvernightWaiters();

      const settings = await setWashOpen(false);

      currentWashSettings = settings;

      updateWashDayControls(settings.isOpen);

      setMsg("Wash day closed. Waiters left on the board are now normal.");
    } catch (error) {
      console.error(error);

      setMsg("Could not close the wash day.", false);
    }
  });

  // ====================================================
  // QUEUE ACTIONS
  // ====================================================

  rowsEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button");

    const row = event.target.closest("tr[data-id]");

    if (!button || !row) {
      return;
    }

    const ticketId = row.dataset.id;
    const sourceType = row.dataset.source;

    const courtesy = sourceType === "courtesy";

    try {
      if (button.classList.contains("startWashBtn")) {
        const settings = await getWashSettings();
        updateWashDayControls(settings.isOpen);

        if (!washIsOpen) {
          setMsg("Wash is closed.", false);
          return;
        }

        if (courtesy) {
          await setCourtesyWashStatus(ticketId, "washing");
        } else {
          await setRoWashStatus(ticketId, "washing");
        }

        setMsg("Marked as washing.");
      }

      if (button.classList.contains("markWashedBtn")) {
        if (courtesy) {
          await setCourtesyWashStatus(ticketId, "washed");
        } else {
          await setRoWashStatus(ticketId, "washed");
        }

        setMsg("Marked as washed.");
      }

      if (button.classList.contains("removeWashBtn")) {
        if (!canEditWashSettings()) {
          setMsg("Only wash admin can remove a wash ticket.", false);
          return;
        }

        const actorName =
          clean(auth.currentUser?.displayName || auth.currentUser?.email) ||
          "this user";

        const confirmed = confirm(
          `This removal is recorded under ${actorName}. Remove this vehicle from the wash queue?`,
        );

        if (!confirmed) {
          return;
        }

        if (courtesy) {
          await removeCourtesyWashFromQueue(ticketId);
        } else {
          await removeRoFromWashQueue(ticketId);
        }

        setMsg("Vehicle removed from wash queue.");
      }
    } catch (error) {
      console.error(error);

      setMsg(error?.message || "Error updating wash ticket.", false);
    }
  });

  // ====================================================
  // INITIALIZE
  // ====================================================

  const settingsTab = $("washSettingsTab");
  const hoursPanel = $("washHoursPanel");

  if (canEditWashSettings()) {
    settingsTab.hidden = false;

    settingsTab.addEventListener("click", (event) => {
      event.preventDefault();
      hoursPanel.hidden = !hoursPanel.hidden;
    });
  }

  [autoFollowEl, ...hourFields.map((field) => $(field))].forEach((input) => {
    input.addEventListener("input", () => {
      refreshSaveButton();
      updateWashDayControls(washIsOpen);
    });
  });

  await loadWashSettings();

  listenRoWashRows();
  listenCourtesyWashRows();
});
