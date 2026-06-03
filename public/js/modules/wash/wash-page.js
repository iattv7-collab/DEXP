// ======================================================
// FILE: /public/js/modules/wash/wash-page.js
// MODULE: Wash
// PURPOSE:
// DEXP Wash Team page.
// Migrated from ArrowFlow Wash process using the same
// master ROS wash fields: washStatus, washQueuedAtMs,
// washingStartedAtMs, washedAtMs, customerWaiting,
// priorityType, needByAtMs, washNotes, and washEvents.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["wash"]
  });

  renderAppHeader();

  const rowsEl = $("washRows");
  const msgEl = $("msg");
  const openBtn = $("openWashBtn");
  const closeBtn = $("closeWashBtn");
  const badge = $("isOpenBadge");

  let currentSession = await waitForSession();
  let currentDealerId = currentSession?.dealerId || "";

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
        { once: true }
      );
    });
  }

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  function clean(v) {
    return String(v || "").trim();
  }

  function roValue(t) {
    return clean(t.roNumber || t.ro || "");
  }

  function tagValue(t) {
    return clean(t.tagNumber || t.tag || "");
  }

  function fmtTime(value) {
    if (!value) return "";

    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    if (typeof value === "number") {
      return new Date(value).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    return "";
  }

  function priorityLabel(t) {
    if (t.customerWaiting === true) return "WAITER";

    if (
      typeof t.needByAtMs === "number" &&
      t.needByAtMs > 0
    ) {
      return "NEED BY";
    }

    if (String(t.priorityType || "").toLowerCase() === "rewash") {
      return "REWASH";
    }

    return "NORMAL";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c]));
  }

  function washEvent(type) {
    return {
      type,
      atMs: Date.now(),
      by: auth.currentUser?.uid || "",
      role: currentSession?.role || "unknown",
      cycle: "wash"
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
      lastEditedRole: currentSession?.role || "unknown"
    };
  }

  async function setWashStatus(ticketId, nextStatus) {
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
      ...auditPatch()
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
        "washingStartedBy"
      ];
    }

    if (status === "washed") {
      patch.washedAt = serverTimestamp();
      patch.washedAtMs = nowMs;
      patch.washedBy = user.uid;
      patch.priorityType = "normal";
      patch.customerWaiting = false;
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
        "customerWaiting",
        "washWaiterAtMs"
      ];
    }

    await updateDoc(ref, patch);
  }

  async function removeFromWashQueue(ticketId) {
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
      customerWaiting: false,
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
        "customerWaiting",
        "needByAtMs",
        "needBySetBy",
        "isRewashCycle",
        "rewashRequestedAtMs",
        "rewashRequestedBy"
      ]
    });
  }

  function sortWashRows(rows) {
    return [...rows].sort((a, b) => {
      const aStatus = clean(a.washStatus).toLowerCase();
      const bStatus = clean(b.washStatus).toLowerCase();

      if (aStatus !== bStatus) {
        if (aStatus === "washing") return -1;
        if (bStatus === "washing") return 1;
      }

      const aWaiter = a.customerWaiting === true;
      const bWaiter = b.customerWaiting === true;

      if (aWaiter !== bWaiter) {
        return aWaiter ? -1 : 1;
      }

      const aNeedBy =
        typeof a.needByAtMs === "number" && a.needByAtMs > 0
          ? a.needByAtMs
          : null;

      const bNeedBy =
        typeof b.needByAtMs === "number" && b.needByAtMs > 0
          ? b.needByAtMs
          : null;

      if (aNeedBy && bNeedBy) return aNeedBy - bNeedBy;
      if (aNeedBy) return -1;
      if (bNeedBy) return 1;

      return Number(a.washQueuedAtMs || 0) - Number(b.washQueuedAtMs || 0);
    });
  }

  function renderRows(rows) {
    const sorted = sortWashRows(rows);

    if (!sorted.length) {
      rowsEl.innerHTML = `
        <tr>
          <td colspan="13">No active wash tickets.</td>
        </tr>
      `;
      return;
    }

    rowsEl.innerHTML = sorted.map((t) => {
      const status = clean(t.washStatus).toLowerCase();
      const startDisabled = status !== "queued" ? "disabled" : "";
      const doneDisabled = status !== "washing" ? "disabled" : "";

      return `
        <tr data-id="${escapeHtml(t.id)}">
          <td><b>${escapeHtml(tagValue(t))}</b></td>
          <td>${escapeHtml(roValue(t))}</td>
          <td>${escapeHtml(t.model || "")}</td>
          <td>${escapeHtml(t.location || "")}</td>
          <td>${escapeHtml(priorityLabel(t))}</td>
          <td>${escapeHtml(fmtTime(t.needByAtMs))}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(fmtTime(t.washQueuedAtMs))}</td>
          <td>${escapeHtml(fmtTime(t.washingStartedAtMs))}</td>
          <td>${escapeHtml(t.washNotes || t.notes || "")}</td>
          <td>
            <button class="startWashBtn" ${startDisabled}>Start</button>
          </td>
          <td>
            <button class="markWashedBtn" ${doneDisabled}>Done</button>
          </td>
          <td>
            <button class="removeWashBtn">Remove</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function listenWashRows() {
    const q = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where("washStatus", "in", ["queued", "washing"])
    );

    onSnapshot(q, (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      renderRows(rows);
    });
  }

  function listenWashSettings() {
    const ref = doc(db, "settings", "system");

    onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      badge.textContent = data.isOpen === false ? "CLOSED" : "OPEN";
    });
  }

  openBtn.addEventListener("click", async () => {
    await updateDoc(doc(db, "settings", "system"), {
      isOpen: true,
      updatedAt: serverTimestamp()
    });

    setMsg("Wash day opened.");
  });

  closeBtn.addEventListener("click", async () => {
    await updateDoc(doc(db, "settings", "system"), {
      isOpen: false,
      updatedAt: serverTimestamp()
    });

    setMsg("Wash day closed.");
  });

  rowsEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    const tr = event.target.closest("tr[data-id]");

    if (!btn || !tr) return;

    const ticketId = tr.dataset.id;

    try {
      if (btn.classList.contains("startWashBtn")) {
        await setWashStatus(ticketId, "washing");
        setMsg("Marked as washing.");
      }

      if (btn.classList.contains("markWashedBtn")) {
        await setWashStatus(ticketId, "washed");
        setMsg("Marked as washed.");
      }

      if (btn.classList.contains("removeWashBtn")) {
        const ok = confirm(
          "Remove this vehicle from the wash queue?"
        );

        if (!ok) return;

        await removeFromWashQueue(ticketId);
        setMsg("Vehicle removed from wash queue.");
      }
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Error updating wash ticket.", false);
    }
  });

  listenWashSettings();
  listenWashRows();
});