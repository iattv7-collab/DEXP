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
let searchText = "";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["tech"] });
  renderAppHeader();
  session = await waitForSession();

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

function isArchived(ro) {
  return (
    String(ro.status || "").toLowerCase() === "archived" ||
    Boolean(ro.archivedAtMs) ||
    Boolean(ro.archivedAt)
  );
}

function techStatus(ro) {
  return String(ro.techStatus || "assigned").toLowerCase();
}

function statusLabel(ro) {
  const status = techStatus(ro);
  if (status === "working") return "Working";
  if (status === "hold") return "Hold";
  if (status === "parked") return "Parked";
  if (status === "completed") return "Done";
  return "Assigned";
}

function matchesSearch(ro) {
  if (!searchText) return true;
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const hay = [ro.tagNumber, ro.roNumber, vehicle, ro.advisorName]
    .join(" ")
    .toLowerCase();
  return hay.includes(searchText);
}

function requestKey(type) {
  return `${type.requestType || ""} ${type.name || ""}`.toLowerCase();
}

function isWashType(type) {
  const key = requestKey(type);
  return key.includes("wash") && !key.includes("park");
}

function isParkType(type) {
  return requestKey(type).includes("park");
}

function requestLabel(type) {
  if (isWashType(type)) return "Done, send to wash";
  if (isParkType(type)) return "Send to park";
  return type.name || type.requestType || "Request";
}

function firstType(predicate) {
  return (requestTypes || []).find((type) => type.showOnTech === true && predicate(type));
}

function requestButton(type, label, enabled) {
  if (!type) {
    return `<button type="button" class="small-button" disabled>${escapeHtml(label)}</button>`;
  }

  return `
    <button
      type="button"
      class="small-button"
      data-action="requestType"
      data-request-type-id="${escapeHtml(type.id)}"
      ${enabled ? "" : "disabled"}
    >
      ${escapeHtml(label)}
    </button>`;
}

function renderActions(ro) {
  const status = techStatus(ro);
  const hasOpenRequest = Boolean(openRequestForRo(ro));
  const washType = firstType(isWashType);
  const parkType = firstType(isParkType);

  const startEnabled = status === "assigned" || status === "completed" || status === "parked";
  const holdEnabled = status === "working" || status === "parked";
  const resumeEnabled = status === "hold";
  const parkEnabled =
    (status === "working" || status === "hold") && Boolean(parkType) && !hasOpenRequest;
  const washEnabled =
    (status === "working" || status === "hold" || status === "parked" || status === "completed") &&
    Boolean(washType) &&
    !hasOpenRequest;

  const startLabel =
    status === "completed" || status === "parked" ? "Start work again" : "Start";

  return `
    <button type="button" class="small-button" data-action="start" ${startEnabled ? "" : "disabled"}>
      ${startLabel}
    </button>
    <button type="button" class="small-button" data-action="hold" ${holdEnabled ? "" : "disabled"}>
      Hold
    </button>
    <button type="button" class="small-button" data-action="resume" ${resumeEnabled ? "" : "disabled"}>
      Resume
    </button>
    ${requestButton(parkType, "Send to park", parkEnabled)}
    ${requestButton(washType, "Done, send to wash", washEnabled)}`;
}

function sortRows(list) {
  const order = { working: 0, assigned: 1, hold: 2, parked: 3, completed: 4 };
  return [...list].sort((a, b) => {
    const statusDiff = (order[techStatus(a)] ?? 9) - (order[techStatus(b)] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return String(a.roNumber || "").localeCompare(String(b.roNumber || ""), undefined, {
      numeric: true,
    });
  });
}

function setMsg(text) {
  const el = $("msg");
  if (el) el.textContent = text || "";
}

function liveRows() {
  return rows.filter((ro) => !isArchived(ro) && matchesSearch(ro));
}

function updateTabCounts(list) {
  const tabs = $("techTabs");
  if (!tabs) return;

  const counts = { assigned: 0, working: 0, hold: 0, parked: 0, completed: 0 };
  list.forEach((ro) => {
    const status = techStatus(ro);
    if (counts[status] !== undefined) counts[status] += 1;
  });

  const labels = {
    assigned: "Assigned",
    working: "Working",
    hold: "Hold",
    parked: "Parked",
    completed: "Done",
  };

  tabs.querySelectorAll("button[data-tab]").forEach((tab) => {
    const key = tab.dataset.tab;
    const count = counts[key] || 0;
    tab.textContent = `${labels[key]} (${count})`;
    tab.disabled = true;
    tab.classList.toggle("has-rows", count > 0);
    tab.classList.toggle("active", count > 0);
  });
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

  const list = sortRows(liveRows());
  updateTabCounts(list);

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8">No live repair orders.</td></tr>`;
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
    if (action === "start") {
      await updateTechStatus(roId, "working", "tech_started", {
        techCompletedAtMs: null,
      });
    }
    if (action === "hold") await updateTechStatus(roId, "hold", "tech_hold");
    if (action === "resume") await updateTechStatus(roId, "working", "tech_resumed");
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

  if (isWashType(requestType)) {
    const ok = window.confirm(
      `RO ${ro.roNumber || ""} • Tag ${ro.tagNumber || ""}\n\nTake completed paperwork to Booking before you leave the stall.\n\nMark Done and send to wash?`,
    );
    if (!ok) {
      setMsg("Done / wash canceled.");
      return;
    }
  }

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

  if (isWashType(requestType)) {
    await updateTechStatus(roId, "completed", "tech_completed", {
      techCompletedAtMs: Date.now(),
    });
    setMsg("Sent to wash. Job marked Done.");
    return;
  }

  if (isParkType(requestType)) {
    await updateTechStatus(roId, "parked", "tech_parked");
    setMsg("Sent to park. Job is Parked — not Done.");
    return;
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


