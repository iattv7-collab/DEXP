// ======================================================
// FILE: /public/js/modules/advisor/advisor-wash-queue.js
// MODULE: Advisor
// PURPOSE:
// Advisor view of the live wash line.
// Same order as the Wash Team board.
// Set Need By, clear Need By, request rewash.
// No QC. No booking. No courtesy.
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
import { pickDateTimeMs } from "/js/shared/date-time-picker.js";
import { getWashSettings } from "/js/services/firestore/wash-settings-service.js";
import {
  canAcceptNeedBy,
  isWaiterTicket,
  projectWashQueue,
} from "/js/services/firestore/wash-capacity-service.js";

const $ = (id) => document.getElementById(id);
const ACTIVE = ["pending", "washing", "rewash_requested"];

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["advisor"] });
  renderAppHeader();

  const session = await waitForSession();
  const canSetNeedBy = hasPermission(PERMISSIONS.WASH_NEED_BY_SET);
  const canRequestRewash = hasPermission(PERMISSIONS.WASH_REWASH_REQUEST);

  const tableEl = $("ticketsTable");
  const msgEl = $("msg");
  const searchEl = $("searchInput");
  const myRosButton = $("myRosBtn");
  const allRosButton = $("allRosBtn");
  const viewLabel = $("advisorViewLabel");

  let rows = [];
  let settings = null;
  let view = session?.role === "advisor" ? "mine" : "all";

  $("advisorRosBtn")?.addEventListener("click", () => {
    window.location.href = "/pages/advisor/advisor.html";
  });
  $("washQueueBtn")?.addEventListener("click", () => {
    window.location.href = "/pages/advisor/wash-queue.html";
  });
  myRosButton?.addEventListener("click", () => setView("mine"));
  allRosButton?.addEventListener("click", () => setView("all"));
  searchEl?.addEventListener("input", render);

  tableEl?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    const row = event.target.closest("tr[data-id]");
    if (!button || !row) return;

    const ticket = rows.find((item) => item.id === row.dataset.id);
    if (!ticket) return;

    button.disabled = true;
    try {
      if (button.classList.contains("needByBtn")) {
        await setNeedBy(ticket.id, ticket, button);
      } else if (button.classList.contains("clearNeedByBtn")) {
        await clearNeedBy(ticket.id, ticket);
      } else if (button.classList.contains("rewashBtn")) {
        await requestRewash(ticket.id);
      }
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Could not save.", false);
    } finally {
      button.disabled = false;
    }
  });

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

  function advisorId(ticket) {
    return clean(ticket.advisorId);
  }

  function advisorName(ticket) {
    return clean(
      ticket.advisorName ||
        ticket.advisorDisplayName ||
        ticket.advisorEmail ||
        ticket.advisorCompanyId ||
        "",
    );
  }

  function vehicle(ticket) {
    return [ticket.year, ticket.make, ticket.model].filter(Boolean).join(" ");
  }

  function washStatus(ticket) {
    return clean(ticket.washStatus).toLowerCase();
  }

  function fmtTime(value) {
    const ms = Number(value || 0);
    if (!ms) return "";
    return new Date(ms).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "\u0026amp;")
      .replace(/</g, "\u0026lt;")
      .replace(/>/g, "\u0026gt;")
      .replace(/"/g, "\u0026quot;")
      .replace(/'/g, "\u0026#039;");
  }

  function auditPatch(fields) {
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

  function statusLabel(ticket) {
    const status = washStatus(ticket);
    if (status === "pending") return "Pending";
    if (status === "washing") return "Washing";
    if (status === "rewash_requested") return "Rewash Requested";
    if (status === "washed") return "Washed";
    return "";
  }

  function priorityLabel(ticket) {
    if (isWaiterTicket(ticket)) return "WAITER";
    if (Number(ticket.needByAtMs || 0) > 0) return "NEED BY";
    return "NORMAL";
  }

  function setView(next) {
    view = next;
    render();
  }

  function visibleRows() {
    const search = clean(searchEl?.value).toLowerCase();
    let list = rows.filter((ticket) => {
      const status = washStatus(ticket);
      return ACTIVE.includes(status) || status === "washed";
    });

    if (view === "mine") {
      list = list.filter((ticket) => advisorId(ticket) === session?.uid);
    }

    if (search) {
      list = list.filter((ticket) => {
        return [roValue(ticket), tagValue(ticket), ticket.customerName, vehicle(ticket)]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });
    }

    const active = list.filter((ticket) => ACTIVE.includes(washStatus(ticket)));
    const washed = list.filter((ticket) => washStatus(ticket) === "washed");
    const ordered = projectWashQueue(active, settings || {});

    return [...ordered, ...washed];
  }

  function confirmOtherAdvisor(ticket, actionLabel) {
    const ownerId = advisorId(ticket);
    const actorId = clean(session?.uid);
    if (!ownerId || ownerId === actorId) return true;

    return confirm(
      `This RO belongs to ${advisorName(ticket) || "another advisor"}.\n\n` +
        `You are about to ${actionLabel}. This action is recorded under ${
          clean(session?.displayName || session?.email) || "you"
        }.\n\nContinue?`,
    );
  }

  async function setNeedBy(id, ticket, anchorButton) {
    if (!ACTIVE.includes(washStatus(ticket))) {
      throw new Error("The vehicle must be in Wash before setting Need By.");
    }
    if (isWaiterTicket(ticket)) {
      throw new Error("Waiter cars cannot take a Need By slot.");
    }
    if (ticket.pickedUpAtMs) {
      throw new Error("This vehicle is already picked up.");
    }
    if (!confirmOtherAdvisor(ticket, "change Need By")) return;

    const fresh = await getWashSettings();
    settings = fresh;

    const schedule = {
      monFri: Number(fresh.mfBays || 0) > 0
        ? { start: fresh.mfOpen || "07:30", end: fresh.mfClose || "19:00" }
        : null,
      sat: Number(fresh.satBays || 0) > 0
        ? { start: fresh.satOpen || "08:00", end: fresh.satClose || "15:00" }
        : null,
      sun: Number(fresh.sunBays || 0) > 0
        ? { start: fresh.sunOpen || "00:00", end: fresh.sunClose || "00:00" }
        : null,
    };

    const selectedMs = await pickDateTimeMs(
      "Need By",
      Number(ticket.needByAtMs || 0) || null,
      15,
      { schedule, anchorEl: anchorButton },
    );
    if (!selectedMs) return;
    if (selectedMs <= Date.now()) {
      setMsg("Need By must be in the future.", false);
      return;
    }

    const washRows = rows.filter((row) => ACTIVE.includes(washStatus(row)));
    const check = canAcceptNeedBy({
      tickets: washRows,
      settings: fresh,
      proposedFinishAtMs: selectedMs,
      ticketId: id,
    });
    if (!check.ok) {
      const reason = check.reason || "That wash slot is not available.";
      setMsg(reason, false);
      alert(reason);
      return;
    }

    const preview = projectWashQueue(
      washRows.map((row) => (row.id === id ? { ...row, needByAtMs: selectedMs } : row)),
      fresh,
    );
    const projectedFinish = Number(
      preview.find((row) => row.id === id)?.projectedFinishAtMs || 0,
    );
    if (projectedFinish > selectedMs) {
      const confirmed = confirm(
        `This Need By cannot be met. Estimated finish is ${fmtTime(projectedFinish)}. Save it anyway?`,
      );
      if (!confirmed) return;
    }

    const currentNeedBy = Number(ticket.needByAtMs || 0);
    if (currentNeedBy && selectedMs > currentNeedBy) {
      const confirmed = confirm(
        `Wash may not finish by ${fmtTime(currentNeedBy)}. Move Need By later to ${fmtTime(selectedMs)}?`,
      );
      if (!confirmed) return;
    }

    await updateDoc(doc(db, "ros", id), {
      needByAtMs: selectedMs,
      needBySlotEndMs: check.slotEndMs || selectedMs,
      needBySetBy: auth.currentUser?.uid || "",
      washEvents: arrayUnion(washEvent("wash_need_by_set")),
      ...auditPatch(["needByAtMs", "needBySlotEndMs", "needBySetBy"]),
    });
    setMsg(`Need By set for ${fmtTime(selectedMs)}.`);
  }

  async function clearNeedBy(id, ticket) {
    const currentNeedBy = Number(ticket.needByAtMs || 0);
    if (!currentNeedBy) {
      setMsg("No Need By to clear.", false);
      return;
    }
    if (!confirmOtherAdvisor(ticket, "clear Need By")) return;
    if (!confirm(`Remove Need By for RO ${roValue(ticket)}? This car goes back to normal wash order.`)) {
      return;
    }

    await updateDoc(doc(db, "ros", id), {
      needByAtMs: null,
      needBySlotEndMs: null,
      needBySetBy: null,
      washEvents: arrayUnion(washEvent("wash_need_by_cleared")),
      ...auditPatch(["needByAtMs", "needBySlotEndMs", "needBySetBy"]),
    });

    try {
      await updateDoc(doc(db, "notificationRequests", `needby-late-${id}-${currentNeedBy}`), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        resolvedAtMs: Date.now(),
        resolvedBy: auth.currentUser?.uid || "",
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      });
    } catch (error) {
      console.warn("Need By late alert was not open:", error?.message);
    }

    setMsg("Need By removed.");
  }

  async function requestRewash(id) {
    await updateDoc(doc(db, "ros", id), {
      priorityType: "rewash",
      isRewashCycle: true,
      rewashRequestedAtMs: Date.now(),
      rewashRequestedBy: auth.currentUser?.uid || "",
      washStatus: "rewash_requested",
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

  function render() {
    myRosButton?.classList.toggle("active-view", view === "mine");
    allRosButton?.classList.toggle("active-view", view === "all");
    viewLabel.textContent = view === "mine"
      ? `Viewing: ${session?.displayName || session?.email || "My"} wash cars`
      : "Viewing: all wash cars";

    const list = visibleRows();
    if (!list.length) {
      tableEl.innerHTML = `<tr><td>No cars in wash.</td></tr>`;
      return;
    }

    const body = list.map((ticket) => {
      const status = washStatus(ticket);
      const projected = ticket.projectedFinishAtMs;
      const late = ticket.needByMissed === true;
      const lateStyle = late ? "color:crimson;font-weight:700;" : "";
      const inWash = ACTIVE.includes(status);
      const needByDisabled = !canSetNeedBy || !inWash || isWaiterTicket(ticket) || ticket.pickedUpAtMs;
      const showClear = canSetNeedBy && inWash && Number(ticket.needByAtMs || 0) > 0 && !ticket.pickedUpAtMs;
      const rewashDisabled = !canRequestRewash || status !== "washed";

      return `
        <tr data-id="${escapeHtml(ticket.id)}">
          <td><b>${escapeHtml(tagValue(ticket))}</b></td>
          <td>${escapeHtml(roValue(ticket))}</td>
          <td>${escapeHtml(ticket.customerName || "")}</td>
          <td>${escapeHtml(vehicle(ticket))}</td>
          <td>${escapeHtml(priorityLabel(ticket))}</td>
          <td>
            <button class="needByBtn" type="button" style="${lateStyle}" ${needByDisabled ? "disabled" : ""}>
              ${ticket.needByAtMs ? escapeHtml(fmtTime(ticket.needByAtMs)) : "Need By"}
            </button>
            ${showClear ? `<button class="clearNeedByBtn" type="button">Clear</button>` : ""}
          </td>
          <td style="${lateStyle}">${escapeHtml(fmtTime(projected))}</td>
          <td>${escapeHtml(statusLabel(ticket))}</td>
          <td><button class="rewashBtn" type="button" ${rewashDisabled ? "disabled" : ""}>Request Rewash</button></td>
        </tr>
      `;
    }).join("");

    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Tag</th>
          <th>RO</th>
          <th>Customer</th>
          <th>Model</th>
          <th>Priority</th>
          <th>Need By</th>
          <th>Projected</th>
          <th>Status</th>
          <th>Rewash</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    `;
  }

  watchDealerROs((dealerRows) => {
    rows = Array.isArray(dealerRows) ? dealerRows : [];
    render();
  });

  getWashSettings()
    .then((loaded) => {
      settings = loaded;
      render();
    })
    .catch((error) => console.error(error));
});

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();
    if (existing?.dealerId) {
      resolve(existing);
      return;
    }
    window.addEventListener("dexp-session-ready", () => resolve(getSession()), { once: true });
  });
}
