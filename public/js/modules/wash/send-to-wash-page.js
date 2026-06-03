// ======================================================
// FILE: /public/js/modules/wash/send-to-wash-page.js
// MODULE: Wash
// PURPOSE:
// DEXP Send to Wash page.
// Migrated from ArrowFlow Send to Wash while preserving
// the same search, preview, waiter, notes, duplicate
// wash prevention, queue display, and send-to-wash flow.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["send-to-wash"]
  });

  renderAppHeader();

  const $ = (id) => document.getElementById(id);

  const searchInputEl = $("searchInput");
  const findBtn = $("findBtn");
  const notesEl = $("notes");
  const waiterEl = $("waiter");
  const msgEl = $("msg");
  const rowsEl = $("rows");
  const sendBtn = $("sendBtn");

  const previewCard = $("previewCard");
  const alreadyInWashMsg = $("alreadyInWashMsg");

  const pRo = $("pRo");
  const pTag = $("pTag");
  const pModel = $("pModel");
  const pWashStatus = $("pWashStatus");
  const pLocation = $("pLocation");
  const pWaiter = $("pWaiter");

  let selectedTicket = null;
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

  function clean(v) {
    return String(v || "").trim();
  }

  function roValue(ticket) {
    return clean(ticket.roNumber || ticket.ro || "");
  }

  function tagValue(ticket) {
    return clean(ticket.tagNumber || ticket.tag || "");
  }

  function modelValue(ticket) {
    return clean(ticket.model || ticket.yearModel || "");
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

  function fmtTime(value) {
    if (!value) return "";

    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString([], {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    if (typeof value === "number") {
      return new Date(value).toLocaleString([], {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    return "";
  }

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  function resetPreview() {
    selectedTicket = null;
    previewCard.style.display = "none";
    alreadyInWashMsg.style.display = "none";
    sendBtn.disabled = false;

    pRo.textContent = "";
    pTag.textContent = "";
    pModel.textContent = "";
    pWashStatus.textContent = "";
    pLocation.textContent = "";
    pWaiter.textContent = "";

    notesEl.value = "";
    waiterEl.value = "false";
  }

  function fillPreview(ticket) {
    const washStatus = clean(ticket.washStatus).toLowerCase();

    selectedTicket = ticket;
    previewCard.style.display = "block";

    pRo.textContent = roValue(ticket);
    pTag.textContent = tagValue(ticket);
    pModel.textContent = modelValue(ticket);
    pWashStatus.textContent = washStatus || "not in wash";
    pLocation.textContent = clean(ticket.location || "");
    pWaiter.textContent = ticket.customerWaiting ? "Yes" : "No";

    waiterEl.value = ticket.customerWaiting ? "true" : "false";

    const alreadyInWash = ["queued", "washing"].includes(washStatus);
    alreadyInWashMsg.style.display = alreadyInWash ? "block" : "none";
    sendBtn.disabled = alreadyInWash;
  }

  async function findByField(fieldName, value) {
    const snap = await getDocs(
      query(
        collection(db, "ros"),
        where("dealerId", "==", currentDealerId),
        where(fieldName, "==", value)
      )
    );

    return snap;
  }

  async function findTicket() {
    setMsg("");
    resetPreview();

    const search = clean(searchInputEl.value);

    if (!search) {
      setMsg("Enter an RO # or Tag #.", false);
      searchInputEl.focus();
      return;
    }

    if (!currentDealerId) {
      setMsg("Dealer session not ready.", false);
      return;
    }

    try {
      let snap = await findByField("roNumber", search);

      if (snap.empty) {
        snap = await findByField("ro", search);
      }

      if (!snap.empty) {
        if (snap.size > 1) {
          setMsg("Multiple tickets found for that RO.", false);
          return;
        }

        const docSnap = snap.docs[0];
        fillPreview({ id: docSnap.id, ...docSnap.data() });
        setMsg("Ticket found.");
        return;
      }

      snap = await findByField("tagNumber", search);

      if (snap.empty) {
        snap = await findByField("tag", search);
      }

      if (snap.empty) {
        setMsg("No RO found. Please create it first in Scanner.", false);
        return;
      }

      if (snap.size > 1) {
        setMsg("Multiple tickets found for that Tag. Search by RO.", false);
        return;
      }

      const docSnap = snap.docs[0];
      fillPreview({ id: docSnap.id, ...docSnap.data() });
      setMsg("Ticket found.");
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Error searching ticket.", false);
    }
  }

  function makeWashEvent({ type, user }) {
    return {
      type,
      atMs: Date.now(),
      by: user?.uid || "",
      role: currentSession?.role || "unknown",
      cycle: "wash"
    };
  }

  async function createWashTicket(ticket, { waiter, notes }) {
    const user = auth.currentUser;

    if (!user) {
      throw new Error("Not authenticated.");
    }

    const tag = tagValue(ticket);

    if (!tag) {
      throw new Error("Tag is required.");
    }

    const nowMs = Date.now();

    await updateDoc(doc(db, "ros", ticket.id), {
      customerWaiting: waiter,
      washNotes: notes,
      washStatus: "queued",
      washQueuedAt: serverTimestamp(),
      washQueuedAtMs: nowMs,
      washQueuedBy: user.uid,
      priorityType: waiter ? "waiter" : "normal",
      washWaiterAtMs: waiter ? nowMs : null,
      updatedAt: serverTimestamp(),

      updatedByUid: user.uid,
      updatedByName: clean(user.displayName || ""),
      updatedByEmail: clean(user.email || ""),

      washEvents: arrayUnion(
        makeWashEvent({
          type: "wash_queued",
          user
        })
      ),

      lastEditedAtMs: nowMs,
      lastEditedBy: user.uid,
      lastEditedRole: currentSession?.role || "unknown",
      lastEditedFields: [
        "customerWaiting",
        "washNotes",
        "washStatus",
        "washQueuedAt",
        "washQueuedAtMs",
        "washQueuedBy",
        "priorityType",
        "washWaiterAtMs"
      ]
    });

    return ticket.id;
  }

  findBtn.addEventListener("click", findTicket);

  searchInputEl.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await findTicket();
    }
  });

  sendBtn.addEventListener("click", async () => {
    setMsg("");

    if (!selectedTicket) {
      setMsg("Find a ticket first.", false);
      return;
    }

    const waiter = waiterEl.value === "true";
    const notes = clean(notesEl.value);

    try {
      sendBtn.disabled = true;

      const id = await createWashTicket(selectedTicket, {
        waiter,
        notes
      });

      setMsg(`Sent to wash: ${id}`);

      searchInputEl.value = "";
      resetPreview();
      searchInputEl.focus();
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Error sending ticket to wash.", false);
    } finally {
      sendBtn.disabled = false;
    }
  });

  function listenQueuedTickets() {
    if (!currentDealerId) return;

    const q = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where("washStatus", "==", "queued")
    );

    onSnapshot(q, (snap) => {
      const rows = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      rows.sort((a, b) => {
        const aMs = Number(a.washQueuedAtMs || 0);
        const bMs = Number(b.washQueuedAtMs || 0);
        return aMs - bMs;
      });

      rowsEl.innerHTML = rows.map((r) => `
        <tr>
          <td><b>${escapeHtml(tagValue(r))}</b></td>
          <td>${escapeHtml(roValue(r))}</td>
          <td>${r.customerWaiting ? "Yes" : "No"}</td>
          <td>${escapeHtml(r.location || "")}</td>
          <td>${escapeHtml(r.washStatus || "")}</td>
          <td>${escapeHtml(fmtTime(r.washQueuedAtMs))}</td>
          <td>${escapeHtml(r.washNotes || r.notes || "")}</td>
        </tr>
      `).join("") || `
        <tr>
          <td colspan="7">No queued tickets.</td>
        </tr>
      `;
    });
  }

  resetPreview();
  listenQueuedTickets();
});