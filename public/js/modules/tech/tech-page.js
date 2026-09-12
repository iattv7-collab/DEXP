// ======================================================
// FILE: /public/js/modules/tech/tech-page.js

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  createRequest,
  watchActiveRequests,
} from "/js/services/firestore/requests-service.js";
import { getActiveRequestTypes } from "/js/services/firestore/request-types-service.js";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let session = null;
let rows = [];
let requestTypes = [];
let openRequestsByRoId = {};
let activeTab = "assigned";
let searchText = "";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["tech"] });
  renderAppHeader();
  session = await waitForSession();

  $("techTabs").addEventListener("click", onTabClick);
  $("techTableBody").addEventListener("click", onTableClick);
  $("techTableBody").addEventListener("blur", onNotesBlur, true);
  $("techSearchInput").addEventListener("input", (event) => {
    searchText = String(event.target.value || "").trim().toLowerCase();
    render();
  });

  listenToAssignedRos();
  listenToOpenRequests();

  try {
    requestTypes = await getActiveRequestTypes();
    render();
  } catch (error) {
    console.error(error);
    setMsg("Could not load request types.");
  }
});

function onTabClick(event) {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;

  activeTab = button.dataset.tab;
  $("techTabs")
    .querySelectorAll("button[data-tab]")
    .forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === activeTab));
  render();
}

function listenToAssignedRos() {
  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
    where("techId", "==", session.uid),
  );

  onSnapshot(q, (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    render();
  });
}

function listenToOpenRequests() {
  watchActiveRequests((list) => {
    openRequestsByRoId = {};

    (list || []).forEach((request) => {
      if (request.roId) openRequestsByRoId[String(request.roId)] = request;
    });

    render();
  });
}

function openRequestForRo(ro) {
  return openRequestsByRoId[ro.id] || null;
}

function openRequestLabel(ro) {
  const request = openRequestForRo(ro);
  if (!request) return "";
  return request.title || request.requestType || "Open request";
}

function techStatus(ro) {
  return String(ro.techStatus || "assigned").toLowerCase();
}

function statusLabel(ro) {
  const status = techStatus(ro);
  if (status === "working") return "Working";
  if (status === "hold") return "Hold";
  if (status === "completed") return "Done";
  return "Assigned";
}

function isPickedUp(ro) {
  return Boolean(
    ro.pickedUp === true ||
      ro.pickedUpAtMs ||
      String(ro.pickupStatus || "").toLowerCase() === "picked_up",
  );
}

function matchesSearch(ro) {
  if (!searchText) return true;
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const hay = [ro.tagNumber, ro.roNumber, vehicle, ro.advisorName]
    .join(" ")
    .toLowerCase();
  return hay.includes(searchText);
}

function renderRequestButtons(ro) {
  const status = techStatus(ro);
  const hasOpenRequest = Boolean(openRequestForRo(ro));

  return (requestTypes || [])
    .filter((type) => type.showOnTech === true)
    .map((type) => {
      const marksDone = type.techMarksDone === true;
      const allowed = marksDone
        ? status === "working" || status === "hold"
        : status === "assigned" || status === "working" || status === "hold";

      if (!allowed) return "";

      return `
        <button
          type="button"
          class="small-button"
          data-action="requestType"
          data-request-type-id="${escapeHtml(type.id)}"
          ${hasOpenRequest ? "disabled" : ""}
        >
          ${escapeHtml(type.name || type.requestType)}
        </button>`;
    })
    .join("");
}

function renderActions(ro) {
  const status = techStatus(ro);
  const buttons = [];

  if (status === "assigned") {
    buttons.push(`<button type="button" class="small-button" data-action="start">Start</button>`);
  }
  if (status === "working") {
    buttons.push(
      `<button type="button" class="small-button" data-action="hold">Waiting Parts</button>`,
    );
    buttons.push(`<button type="button" class="small-button" data-action="complete">Done</button>`);
  }
  if (status === "hold") {
    buttons.push(`<button type="button" class="small-button" data-action="resume">Resume</button>`);
    buttons.push(`<button type="button" class="small-button" data-action="complete">Done</button>`);
  }
  if (status === "completed") {
    buttons.push(
      `<button type="button" class="small-button" data-action="returnToWorking">Return to Working</button>`,
    );
  }

  return `${buttons.join("")}${renderRequestButtons(ro)}`;
}

function sortRows(list) {
  return [...list].sort((a, b) =>
    String(a.roNumber || "").localeCompare(String(b.roNumber || ""), undefined, {
      numeric: true,
    }),
  );
}

function setMsg(text) {
  const el = $("msg");
  if (el) el.textContent = text || "";
}

function render() {
  const body = $("techTableBody");
  if (!body) return;

  const activeNotes = document.activeElement?.classList?.contains("tech-notes")
    ? document.activeElement
    : null;
  const activeRoId = activeNotes?.dataset?.roId;
  const activeValue = activeNotes?.value;
  const activePos = activeNotes?.selectionStart;

  const counts = { assigned: 0, working: 0, hold: 0, completed: 0 };
  rows.forEach((ro) => {
    if (isPickedUp(ro) && techStatus(ro) !== "completed") return;
    const status = techStatus(ro);
    if (counts[status] !== undefined) counts[status] += 1;
  });

  $("techTabs")
    .querySelectorAll("button[data-tab]")
    .forEach((tab) => {
      const key = tab.dataset.tab;
      const labels = {
        assigned: "Assigned",
        working: "Working",
        hold: "Hold",
        completed: "Done",
      };
      tab.textContent = `${labels[key]} (${counts[key] || 0})`;
    });

  const list = sortRows(
    rows.filter((ro) => {
      if (techStatus(ro) !== activeTab) return false;
      if (activeTab !== "completed" && isPickedUp(ro)) return false;
      return matchesSearch(ro);
    }),
  );

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8">No repair orders in this view.</td></tr>`;
    return;
  }

  body.innerHTML = list
    .map((ro) => {
      const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
      return `
        <tr data-ro-id="${escapeHtml(ro.id)}">
          <td><b>${escapeHtml(ro.tagNumber || "")}</b></td>
          <td>${escapeHtml(ro.roNumber || "")}</td>
          <td>${escapeHtml(vehicle)}</td>
          <td>${escapeHtml(ro.advisorName || "")}</td>
          <td>${escapeHtml(statusLabel(ro))}</td>
          <td>${escapeHtml(openRequestLabel(ro))}</td>
          <td>
            <input
              class="tech-notes"
              data-ro-id="${escapeHtml(ro.id)}"
              value="${escapeHtml(ro.techNotes || "")}"
              placeholder="Notes"
            />
          </td>
          <td class="action-cell">${renderActions(ro)}</td>
        </tr>`;
    })
    .join("");

  if (activeRoId) {
    const next = body.querySelector(`.tech-notes[data-ro-id="${activeRoId}"]`);
    if (next) {
      next.value = activeValue;
      next.focus();
      try {
        next.setSelectionRange(activePos, activePos);
      } catch (_err) {}
    }
  }
}

async function onTableClick(event) {
  const button = event.target.closest("button[data-action]");
  const row = event.target.closest("tr[data-ro-id]");
  if (!button || !row) return;

  const roId = row.dataset.roId;
  const action = button.dataset.action;

  try {
    if (action === "start") await updateTechStatus(roId, "working", "tech_started");
    if (action === "hold") await updateTechStatus(roId, "hold", "tech_hold");
    if (action === "resume") await updateTechStatus(roId, "working", "tech_resumed");
    if (action === "complete") {
      await updateTechStatus(roId, "completed", "tech_completed", {
        techCompletedAtMs: Date.now(),
      });
    }
    if (action === "returnToWorking") {
      await updateTechStatus(roId, "working", "tech_reopened", {
        techCompletedAtMs: null,
      });
    }
    if (action === "requestType") {
      await handleTechRequestType(roId, button.dataset.requestTypeId);
    }
  } catch (error) {
    console.error(error);
    setMsg(error?.message || "Action failed.");
  }
}

async function onNotesBlur(event) {
  const notes = event.target.closest(".tech-notes");
  if (!notes) return;
  const roId = notes.dataset.roId;
  if (!roId) return;

  const ro = rows.find((row) => row.id === roId);
  if ((ro?.techNotes || "") === notes.value) return;

  await updateDoc(doc(db, "ros", roId), {
    techNotes: notes.value,
    updatedAt: serverTimestamp(),
    updatedBy: session?.uid || "",
  });
  await logActivity(roId, "tech_note_updated");
}

async function handleTechRequestType(roId, requestTypeId) {
  const ro = rows.find((row) => row.id === roId);
  const requestType = requestTypes.find((type) => type.id === requestTypeId);
  if (!ro) throw new Error("Repair order not found.");
  if (!requestType?.targetGroupId) throw new Error("Request type is missing a target group.");

  await createRequest({
    roId: ro.id,
    roNumber: ro.roNumber || "",
    tagNumber: ro.tagNumber || "",
    vinLast8: ro.vinLast8 || "",
    requestType: requestType.requestType,
    sourceModule: "tech",
    targetGroupId: requestType.targetGroupId,
    targetGroupName: requestType.targetGroupName || "",
    title: requestType.name || requestType.requestType,
    message:
      requestType.defaultMessage ||
      `Tech ${session?.displayName || session?.email || ""} requested ${requestType.name}. RO ${ro.roNumber || ""} • Tag ${ro.tagNumber || ""}`,
    route: requestType.route || "/pages/operations/operations.html",
    routeParams: { tagNumber: ro.tagNumber || "" },
  });

  await logActivity(roId, `tech_request_${requestType.requestType || requestType.id}`);

  if (requestType.techMarksDone === true) {
    await updateTechStatus(roId, "completed", "tech_completed", {
      techCompletedAtMs: Date.now(),
    });
  }

  setMsg(`${requestType.name || "Request"} sent.`);
}

async function updateTechStatus(roId, nextStatus, activityType, extraFields = {}) {
  await updateDoc(doc(db, "ros", roId), {
    techStatus: nextStatus,
    updatedAt: serverTimestamp(),
    updatedBy: session?.uid || "",
    ...extraFields,
  });
  await logActivity(roId, activityType);
}

async function logActivity(roId, type) {
  await addDoc(collection(db, "ros", roId, "activityLog"), {
    type,
    module: "tech",
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    createdBy: session?.uid || "",
    createdByName: session?.displayName || session?.email || "",
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

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
