// ======================================================
// FILE: /public/js/modules/wash/send-to-wash-page.js
// MODULE: Wash
// PURPOSE:
// Send an existing RO to the Wash Team queue.
// Same RO and Tag lookup as before, with one lock rule:
// already in wash cannot be sent again from either search.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { getWashSettings } from "/js/services/firestore/wash-settings-service.js";

import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const ACTIVE_WASH_STATUSES = [
  "queued",
  "pending",
  "rewash_requested",
  "washing",
];

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["send-to-wash"],
  });

  renderAppHeader();

  const $ = (id) => document.getElementById(id);

  const searchInputEl = $("searchInput");
  const findBtn = $("findBtn");
  const notesEl = $("notes");
  const msgEl = $("msg");
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
  let washIsOpen = true;

  await refreshWashOpen();

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

  function locationValue(ticket) {
    return clean(ticket.currentLocation || ticket.location || "");
  }

  function washStatusOf(ticket) {
    return clean(ticket?.washStatus).toLowerCase();
  }

  function isActiveWash(ticket) {
    return ACTIVE_WASH_STATUSES.includes(washStatusOf(ticket));
  }

  function isWaiterTicket(ticket) {
    return ticket?.isWaiter === true || ticket?.customerWaiting === true;
  }

  function setMsg(text, ok = true) {
    msgEl.textContent = text || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  async function refreshWashOpen() {
    const settings = await getWashSettings();
    washIsOpen = Boolean(settings.isOpen);
    return washIsOpen;
  }

  function resetPreview() {
    selectedTicket = null;
    previewCard.style.display = "none";
    alreadyInWashMsg.style.display = "none";
    sendBtn.disabled = true;

    pRo.textContent = "";
    pTag.textContent = "";
    pModel.textContent = "";
    pWashStatus.textContent = "";
    pLocation.textContent = "";
    pWaiter.textContent = "";

    notesEl.value = "";
  }

  function applyPreviewLocks(ticket) {
    const alreadyInWash = isActiveWash(ticket);

    alreadyInWashMsg.style.display = alreadyInWash ? "block" : "none";

    if (!washIsOpen) {
      sendBtn.disabled = true;
      setMsg("Wash is currently closed.", false);
      return { alreadyInWash, canSend: false };
    }

    if (alreadyInWash) {
      sendBtn.disabled = true;
      setMsg("This ticket is already in the Wash queue.", false);
      return { alreadyInWash, canSend: false };
    }

    sendBtn.disabled = false;
    setMsg("Ticket found.");
    return { alreadyInWash, canSend: true };
  }

  function fillPreview(ticket) {
    selectedTicket = ticket;
    previewCard.style.display = "block";

    pRo.textContent = roValue(ticket);
    pTag.textContent = tagValue(ticket);
    pModel.textContent = modelValue(ticket);
    pWashStatus.textContent = washStatusOf(ticket) || "not in wash";
    pLocation.textContent = locationValue(ticket);
    pWaiter.textContent = isWaiterTicket(ticket) ? "Yes" : "No";

    return applyPreviewLocks(ticket);
  }

  async function findByField(fieldName, value) {
    const snap = await getDocs(
      query(
        collection(db, "ros"),
        where("dealerId", "==", currentDealerId),
        where(fieldName, "==", value),
      ),
    );

    return snap;
  }

  async function showFoundTicket(docSnap) {
    fillPreview({
      id: docSnap.id,
      ...docSnap.data(),
    });
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
      await refreshWashOpen();

      let snap = await findByField("roNumber", search);

      if (snap.empty) {
        snap = await findByField("ro", search);
      }

      if (!snap.empty) {
        if (snap.size > 1) {
          setMsg("Multiple tickets found for that RO.", false);
          return;
        }

        await showFoundTicket(snap.docs[0]);
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

      await showFoundTicket(snap.docs[0]);
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
      cycle: "wash",
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
      isWaiter: waiter,
      washNotes: notes,
      washStatus: "pending",
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
          user,
        }),
      ),

      lastEditedAtMs: nowMs,
      lastEditedBy: user.uid,
      lastEditedRole: currentSession?.role || "unknown",
      lastEditedFields: [
        "customerWaiting",
        "isWaiter",
        "washNotes",
        "washStatus",
        "washQueuedAt",
        "washQueuedAtMs",
        "washQueuedBy",
        "priorityType",
        "washWaiterAtMs",
      ],
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

    try {
      sendBtn.disabled = true;

      const open = await refreshWashOpen();

      if (!open) {
        setMsg("Wash is currently closed.", false);
        return;
      }

      const freshSnap = await getDoc(doc(db, "ros", selectedTicket.id));

      if (!freshSnap.exists()) {
        setMsg("This ticket no longer exists.", false);
        resetPreview();
        return;
      }

      const freshTicket = {
        id: freshSnap.id,
        ...freshSnap.data(),
      };

      selectedTicket = freshTicket;
      fillPreview(freshTicket);

      if (isActiveWash(freshTicket)) {
        return;
      }

      const waiter = isWaiterTicket(freshTicket);
      const notes = clean(notesEl.value);

      const id = await createWashTicket(freshTicket, {
        waiter,
        notes,
      });

      setMsg(`Sent to wash: ${id}`);

      searchInputEl.value = "";
      resetPreview();
      searchInputEl.focus();
    } catch (error) {
      console.error(error);
      sendBtn.disabled = false;
      setMsg(error?.message || "Error sending ticket to wash.", false);
    }
  });

  resetPreview();
});