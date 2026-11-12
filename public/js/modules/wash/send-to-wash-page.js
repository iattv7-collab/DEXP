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
import { getActiveLocations, groupLocationsByArea } from "/js/services/firestore/locations-service.js";
import {
  createRequest,
  completeRequest,
} from "/js/services/firestore/requests-service.js";
import { getActiveRequestTypes } from "/js/services/firestore/request-types-service.js";
import {
  openNotificationRequest,
  releaseNotificationRequest,
  resolveNotificationRequest,
} from "/js/services/firestore/notification-requests-service.js";

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

const finishParams = new URLSearchParams(window.location.search);
const finishRequestId = String(finishParams.get("requestId") || "").trim();
const finishNotificationId = String(finishParams.get("notificationId") || "").trim();

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: finishRequestId ? [] : ["send-to-wash"],
  });

  renderAppHeader();

  const $ = (id) => document.getElementById(id);

  const searchInputEl = $("searchInput");
  const findBtn = $("findBtn");
  const notesEl = $("notes");
  const msgEl = $("msg");
  const keyAlreadyAtWashCheck = $("keyAlreadyAtWashCheck");
  const updateLocationBtn = $("updateLocationBtn");
  const locationPanel = $("locationPanel");
  const locationAreaSelect = $("locationAreaSelect");
  const locationLotSelect = $("locationLotSelect");
  const locationBlockingInput = $("locationBlockingInput");
  const saveBtn = $("saveBtn");
  const finishActions = $("finishActions");
  const finishBtn = $("finishBtn");
  const cancelBtn = $("cancelBtn");

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
  let finishMode = false;
  let activeRequest = null;
  let activeNotificationId = "";

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

  function isPickedUp(ticket) {
    return Boolean(ticket?.pickedUpAtMs);
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

  let groupedLocations = {};

  function resetPreview() {
    selectedTicket = null;
    previewCard.style.display = "none";
    alreadyInWashMsg.style.display = "none";
    if (keyAlreadyAtWashCheck) keyAlreadyAtWashCheck.checked = false;
    if (saveBtn) saveBtn.disabled = false;
    if (locationPanel) locationPanel.style.display = "none";
    if (locationAreaSelect) locationAreaSelect.innerHTML = '<option value="">Select area...</option>';
    if (locationLotSelect) locationLotSelect.innerHTML = '<option value="">Select lot...</option>';
    if (locationBlockingInput) locationBlockingInput.value = "";

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
    const pickedUp = isPickedUp(ticket);

    alreadyInWashMsg.style.display =
      alreadyInWash && !finishMode ? "block" : "none";

    if (!washIsOpen) {
      setMsg("Wash is closed. This car will wait until the next open day.", true);
    }

    if (pickedUp) {
      previewCard.style.display = "none";
      if (saveBtn) saveBtn.disabled = true;
      setMsg("This car was picked up.", false);
      return { alreadyInWash, canSend: false };
    }

    if (alreadyInWash && !finishMode) {
      if (saveBtn) saveBtn.disabled = true;
      setMsg("This ticket is already in the Wash queue.", false);
      return { alreadyInWash, canSend: false };
    }

    if (saveBtn) saveBtn.disabled = false;
    setMsg("Ticket found.");
    return { alreadyInWash, canSend: true };
  }

  async function loadLocationCatalog() {
    try {
      const locations = await getActiveLocations();
      groupedLocations = groupLocationsByArea(locations);
      populateAreaSelect();
    } catch (error) {
      console.error(error);
    }
  }

  function populateAreaSelect() {
    if (!locationAreaSelect) return;
    locationAreaSelect.innerHTML = '<option value="">Select area...</option>';
    Object.keys(groupedLocations).forEach((area) => {
      const opt = document.createElement("option");
      opt.value = area;
      opt.textContent = area;
      locationAreaSelect.appendChild(opt);
    });
  }

  function populateLotSelect() {
    if (!locationLotSelect) return;
    const area = locationAreaSelect?.value || "";
    locationLotSelect.innerHTML = '<option value="">Select lot...</option>';
    if (!area || !groupedLocations[area]) return;
    groupedLocations[area].forEach((loc) => {
      const opt = document.createElement("option");
      opt.value = loc.label || "";
      opt.textContent = loc.label || "";
      locationLotSelect.appendChild(opt);
    });
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

    if (keyAlreadyAtWashCheck) keyAlreadyAtWashCheck.checked = false;
    if (locationPanel) locationPanel.style.display = "none";

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

    if (isPickedUp(ticket)) {
      throw new Error("This vehicle is already picked up. It cannot be sent to wash.");
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
      washQueuedByName: clean(user.displayName || user.email || ""),
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
        "washQueuedByName",
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

  async function locationBlocksWash(ticket) {
    const locLabel = locationValue(ticket);
    if (!locLabel) return null;

    const locations = await getActiveLocations();
    const match = locations.find(
      (loc) => String(loc.label || "").trim().toLowerCase() === locLabel.toLowerCase(),
    );

    if (!match) return null;

    const label = String(match.label || "").toLowerCase();

    if (match.remote === true) {
      return "Car is at a remote location. Move it to the main shop first.";
    }

    if (label.includes("annex")) {
      return "Car is at the Annex. Move it to the main shop first.";
    }

    if (label.includes("key box") || label.includes("keybox") || match.isKeyBox === true) {
      return "Key is in a key box. Move the car first.";
    }

    return null;
  }

  updateLocationBtn.addEventListener("click", async () => {
    if (!locationPanel) return;
    const open = locationPanel.style.display !== "none";
    if (open) {
      locationPanel.style.display = "none";
      return;
    }
    if (!Object.keys(groupedLocations).length) {
      await loadLocationCatalog();
    }
    locationPanel.style.display = "block";
  });

  locationAreaSelect.addEventListener("change", populateLotSelect);

  saveBtn.addEventListener("click", async () => {
    await handleSave();
  });

  async function updateLocationIfChanged(ticket) {
    if (!locationPanel || locationPanel.style.display === "none") return ticket;
    const area = clean(locationAreaSelect?.value);
    const lot = clean(locationLotSelect?.value);
    if (!lot) return ticket;
    if (lot.toLowerCase() === locationValue(ticket).toLowerCase()) return ticket;

    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    await updateDoc(doc(db, "ros", ticket.id), {
      currentLocation: lot,
      location: lot,
      currentLocationArea: area || "",
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
      updatedByName: clean(user.displayName || ""),
      updatedByEmail: clean(user.email || ""),
      lastEditedAtMs: Date.now(),
      lastEditedBy: user.uid,
      lastEditedRole: currentSession?.role || "unknown",
      lastEditedFields: ["currentLocation", "location", "currentLocationArea"],
    });

    return { ...ticket, currentLocation: lot, location: lot, currentLocationArea: area || "" };
  }

  async function handleSave() {
    setMsg("");

    if (!selectedTicket) {
      setMsg("Find a ticket first.", false);
      return;
    }

    try {
      if (saveBtn) saveBtn.disabled = true;

      const open = await refreshWashOpen();
      if (!open) {
        setMsg("Wash is closed. This car will wait until the next open day.");
      }

      const freshSnap = await getDoc(doc(db, "ros", selectedTicket.id));
      if (!freshSnap.exists()) {
        setMsg("This ticket no longer exists.", false);
        resetPreview();
        return;
      }

      const keyAlready = keyAlreadyAtWashCheck?.checked === true;

      let freshTicket = { id: freshSnap.id, ...freshSnap.data() };
      freshTicket = await updateLocationIfChanged(freshTicket);
      selectedTicket = freshTicket;
      fillPreview(freshTicket);

      if (isPickedUp(freshTicket)) {
        setMsg("This vehicle is already picked up. It cannot be sent to wash.", false);
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      if (isActiveWash(freshTicket)) {
        return;
      }

      const blockMsg = await locationBlocksWash(freshTicket);
      if (blockMsg) {
        setMsg("Update location. " + blockMsg, false);
        if (saveBtn) saveBtn.disabled = false;
        return;
      }

      const waiter = isWaiterTicket(freshTicket);
      const notes = clean(notesEl.value);
      const tag = tagValue(freshTicket);
      const roNum = roValue(freshTicket);

      if (keyAlready) {
        const id = await createWashTicket(freshTicket, { waiter, notes });
        setMsg(`Key already at wash. Sent to wash board: ${id}`);
      } else {
        const types = await getActiveRequestTypes();
        const washType = types.find(
          (item) => String(item.requestType || "").trim() === "move-to-wash",
        );

        if (!washType?.targetGroupId) {
          setMsg("Move to Wash request type is not set.", false);
          if (saveBtn) saveBtn.disabled = false;
          return;
        }

        await createRequest({
          roId: freshTicket.id,
          roNumber: roNum,
          tagNumber: tag,
          requestType: washType.requestType,
          sourceModule: "send-to-wash",
          targetGroupId: washType.targetGroupId,
          targetGroupName: washType.targetGroupName || "",
          title: washType.name || "Move to Wash",
          message: `Tag ${tag} — take key to wash`,
          route: "/pages/send-to-wash/send-to-wash.html",
        });

        setMsg("Request sent. Key will land on wash board when it is finished.");
      }

      searchInputEl.value = "";
      resetPreview();
      searchInputEl.focus();
    } catch (error) {
      console.error(error);
      if (saveBtn) saveBtn.disabled = false;
      setMsg(error?.message || "Error saving.", false);
    }
  }

  function enterFinishChrome() {
    const findRow = document.querySelector(".form-row");
    if (findRow) findRow.style.display = "none";
    if (keyAlreadyAtWashCheck) {
      const label = keyAlreadyAtWashCheck.closest("label");
      if (label) label.style.display = "none";
    }
    if (saveBtn) saveBtn.style.display = "none";
    if (finishActions) finishActions.style.display = "block";
    const heading = document.querySelector("h1");
    if (heading) heading.textContent = "Take key to wash";
  }

  function goHome() {
    window.location.replace("/pages/dashboard/index.html");
  }

  async function loadFinishRequest() {
    if (!finishRequestId) return;

    finishMode = true;
    enterFinishChrome();
    setMsg("Loading key...");

    try {
      const requestSnap = await getDoc(doc(db, "requests", finishRequestId));
      if (!requestSnap.exists()) {
        setMsg("This key request is gone.", false);
        if (finishActions) finishActions.style.display = "none";
        window.setTimeout(goHome, 1800);
        return;
      }

      activeRequest = { id: requestSnap.id, ...requestSnap.data() };
      activeNotificationId =
        finishNotificationId || clean(activeRequest.notificationRequestId);

      if (clean(activeRequest.status) === "completed") {
        setMsg("Someone already finished this key.", false);
        if (finishActions) finishActions.style.display = "none";
        window.setTimeout(goHome, 1800);
        return;
      }

      if (activeNotificationId) {
        const noteSnap = await getDoc(
          doc(db, "notificationRequests", activeNotificationId),
        );
        const note = noteSnap.exists() ? noteSnap.data() || {} : {};
        const openedBy = clean(note.openedBy);
        const me = clean(currentSession?.uid || auth.currentUser?.uid);

        if (openedBy && openedBy !== me) {
          setMsg(
            `Someone else already has this key (${note.openedByName || "another valet"}).`,
            false,
          );
          if (finishActions) finishActions.style.display = "none";
          window.setTimeout(goHome, 2200);
          return;
        }

        try {
          await openNotificationRequest(activeNotificationId);
        } catch (error) {
          if (String(error?.message || "").includes("already opened")) {
            setMsg("Someone else already has this key.", false);
            if (finishActions) finishActions.style.display = "none";
            window.setTimeout(goHome, 2200);
            return;
          }
          throw error;
        }
      }

      if (!activeRequest.roId) {
        setMsg("No RO on this request.", false);
        return;
      }

      const roSnap = await getDoc(doc(db, "ros", activeRequest.roId));
      if (!roSnap.exists()) {
        setMsg("This RO no longer exists.", false);
        return;
      }

      fillPreview({ id: roSnap.id, ...roSnap.data() });
      setMsg("Take the key to wash, then Finish.");
    } catch (error) {
      console.error(error);
      setMsg(error?.message || "Could not open this key.", false);
    }
  }

  finishBtn?.addEventListener("click", async () => {
    if (!finishMode || !selectedTicket || !activeRequest) return;

    try {
      if (finishBtn) finishBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      const open = await refreshWashOpen();
      if (!open) {
        setMsg("Wash is closed. This car will wait until the next open day.");
      }

      let freshTicket = selectedTicket;
      freshTicket = await updateLocationIfChanged(freshTicket);
      selectedTicket = freshTicket;
      fillPreview(freshTicket);

      const blockMsg = await locationBlocksWash(freshTicket);
      if (blockMsg) {
        setMsg("Update location. " + blockMsg, false);
        if (finishBtn) finishBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        return;
      }

      if (isPickedUp(freshTicket)) {
        setMsg("This vehicle is already picked up. It cannot be sent to wash.", false);
        if (finishBtn) finishBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        return;
      }

      if (!isActiveWash(freshTicket)) {
        await createWashTicket(freshTicket, {
          waiter: isWaiterTicket(freshTicket),
          notes: clean(notesEl.value),
        });
      }

      if (freshTicket.keyMissingAtWash) {
        const user = auth.currentUser;
        await updateDoc(doc(db, "ros", freshTicket.id), {
          keyMissingAtWash: false,
          keyMissingAtWashAtMs: null,
          keyMissingAtWashBy: null,
          keyMissingAtWashByName: null,
          updatedAt: serverTimestamp(),
          updatedByUid: user?.uid || "",
          updatedByName: clean(user?.displayName || ""),
          updatedByEmail: clean(user?.email || ""),
          lastEditedAtMs: Date.now(),
          lastEditedBy: user?.uid || "",
          lastEditedRole: currentSession?.role || "unknown",
          lastEditedFields: [
            "keyMissingAtWash",
            "keyMissingAtWashAtMs",
            "keyMissingAtWashBy",
            "keyMissingAtWashByName",
          ],
        });
      }

      await completeRequest(activeRequest.id);
      if (activeNotificationId) {
        await resolveNotificationRequest(activeNotificationId);
      }

      const advisorAlertId = `key-missing-advisor-${freshTicket.id}`;
      const advisorAlert = await getDoc(doc(db, "notificationRequests", advisorAlertId));
      if (advisorAlert.exists() && advisorAlert.data()?.status === "active") {
        await resolveNotificationRequest(advisorAlertId);
      }

      setMsg("Key at wash. Sent to the wash board.");
      window.setTimeout(goHome, 1400);
    } catch (error) {
      console.error(error);
      if (finishBtn) finishBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      setMsg(error?.message || "Could not finish.", false);
    }
  });

  cancelBtn?.addEventListener("click", async () => {
    if (!finishMode) return;

    try {
      if (cancelBtn) cancelBtn.disabled = true;
      if (finishBtn) finishBtn.disabled = true;

      if (activeNotificationId) {
        await releaseNotificationRequest(activeNotificationId);
      }

      setMsg("Sent back to the group.");
      window.setTimeout(goHome, 1000);
    } catch (error) {
      console.error(error);
      if (cancelBtn) cancelBtn.disabled = false;
      if (finishBtn) finishBtn.disabled = false;
      setMsg(error?.message || "Could not cancel.", false);
    }
  });

  if (finishRequestId) {
    await loadFinishRequest();
  } else {
    resetPreview();
  }
});