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

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["tech"] });
  renderAppHeader();
  session = await waitForSession();

  $("techTable").addEventListener("click", onTableClick);
  $("techTable").addEventListener("blur", onNotesBlur, true);

  listenToAssignedRos();
  listenToOpenRequests();

  try {
    requestTypes = await getActiveRequestTypes();
    render();
  } catch (error) {
    console.error(error);
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
      [request.roId, request.roNumber, request.tagNumber]
        .filter(Boolean)
        .forEach((key) => {
          openRequestsByRoId[String(key)] = request;
        });
    });

    render();
  });
}

function openRequestForRo(ro) {
  return (
    openRequestsByRoId[ro.id] ||
    openRequestsByRoId[String(ro.roNumber || "")] ||
    openRequestsByRoId[String(ro.tagNumber || "")] ||
    null
  );
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

function requestTypesForStatus(status) {
  return (requestTypes || []).filter((type) => {
    if (type.showOnTech !== true) return false;
    const marksDone = type.techMarksDone === true;
    if (status === "assigned") return !marksDone;
    if (status === "working" || status === "hold") return marksDone;
    return false;
  });
}

function renderRequestButtons(ro) {
  const status = techStatus(ro);
  const hasOpenRequest = Boolean(openRequestForRo(ro));

  return (requestTypes || [])
    .filter((type) => type.showOnTech === true)
    .map((type) => {
      const marksDone = type.techMarksDone === true;
      const allowed =
        (!marksDone && status === "assigned") ||
        (marksDone && (status === "working" || status === "hold"));

      const disabled = !allowed || hasOpenRequest;

      return `
        <button
          type="button"
          data-action="requestType"
          data-request-type-id="${escapeHtml(type.id)}"
          ${disabled ? "disabled" : ""}
        >
          ${escapeHtml(type.name || type.requestType)}
        </button>`;
    })
    .join("");
}

function renderActions(ro) {
  const status = techStatus(ro);

  return `
    <button type="button" data-action="start" ${status === "assigned" ? "" : "disabled"}>
      Start
    </button>
    <button type="button" data-action="hold" ${status === "working" ? "" : "disabled"}>
      Hold
    </button>
    <button type="button" data-action="resume" ${status === "hold" ? "" : "disabled"}>
      Resume
    </button>
    <button type="button" data-action="complete" ${
      status === "working" || status === "hold" ? "" : "disabled"
    }>
      Done
    </button>
    <button type="button" data-action="returnToWorking" ${
      status === "completed" ? "" : "disabled"
    }>
      Return to Working
    </button>
    ${renderRequestButtons(ro)}
  `;
}

function sortRows(list) {
  const order = { working: 0, hold: 1, assigned: 2, completed: 3 };
  return [...list].sort((a, b) => {
    const aOrder = order[techStatus(a)] ?? 9;
    const bOrder = order[techStatus(b)] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a.roNumber || "").localeCompare(String(b.roNumber || ""), undefined, {
      numeric: true,
    });
  });
}

function render() {
  const tableEl = $("techTable");
  const list = sortRows(rows);

  if (!list.length) {
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Tag</th><th>RO</th><th>Vehicle</th><th>Advisor</th>
          <th>Status</th><th>Open request</th><th>Notes</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="8">No repair orders assigned.</td></tr>
      </tbody>
    `;
    return;
  }

  tableEl.innerHTML = `
    <thead>
      <tr>
        <th>Tag</th>
        <th>RO</th>
        <th>Vehicle</th>
        <th>Advisor</th>
        <th>Status</th>
        <th>Open request</th>
        <th>Notes</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${list
        .map((ro) => {
          const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
          const status = techStatus(ro);
          const notes =
            status === "assigned" || status === "completed"
              ? escapeHtml(ro.techNotes || "")
              : `<input class="tech-notes" data-ro-id="${escapeHtml(ro.id)}" value="${escapeHtml(ro.techNotes || "")}" placeholder="Notes" />`;

          return `
            <tr data-ro-id="${escapeHtml(ro.id)}">
              <td><b>${escapeHtml(ro.tagNumber || "")}</b></td>
              <td>${escapeHtml(ro.roNumber || "")}</td>
              <td>${escapeHtml(vehicle)}</td>
              <td>${escapeHtml(ro.advisorName || "")}</td>
              <td>${escapeHtml(statusLabel(ro))}</td>
              <td>${escapeHtml(openRequestLabel(ro))}</td>
              <td>${notes}</td>
              <td>${renderActions(ro)}</td>
            </tr>
          `;
        })
        .join("")}
    </tbody>
  `;
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
    if (action === "returnToWorking") await updateTechStatus(roId, "working", "tech_reopened");
    if (action === "requestType") {
      await handleTechRequestType(roId, button.dataset.requestTypeId);
    }
  } catch (error) {
    console.error(error);
    window.alert(error?.message || "Action failed.");
  }
}

async function onNotesBlur(event) {
  const notes = event.target.closest(".tech-notes");
  if (!notes) return;
  const roId = notes.dataset.roId;
  if (!roId) return;

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
    route: requestType.route || "/pages/move-locate/move-locate.html",
    routeParams: { tagNumber: ro.tagNumber || "" },
  });

  await logActivity(roId, `tech_request_${requestType.requestType || requestType.id}`);

  if (requestType.techMarksDone === true) {
    await updateTechStatus(roId, "completed", "tech_completed", {
      techCompletedAtMs: Date.now(),
    });
  }

  window.alert(`${requestType.name || "Request"} sent.`);
}

async function updateTechStatus(roId, techStatus, activityType, extraFields = {}) {
  await updateDoc(doc(db, "ros", roId), {
    techStatus,
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