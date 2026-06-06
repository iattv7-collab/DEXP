// ======================================================
// FILE: /public/js/modules/tech/tech-page.js
// MODULE: Tech
// PURPOSE:
// DEXP Tech page.
// Shows assigned work for technician.
// Reads and updates Master ROS tech workflow fields.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";

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
let activeTab = "assigned";

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["tech"] });

  renderAppHeader();

  session = await waitForSession();

  initializeTabs();
  initializeWorkflow();
  listenToAssignedRos();
});

function initializeTabs() {
  const tabs = document.querySelectorAll(".tech-tab");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const label = tab.textContent.toLowerCase();

      if (label.includes("assigned")) activeTab = "assigned";
      if (label.includes("working")) activeTab = "working";
      if (label.includes("hold")) activeTab = "hold";
      if (label.includes("done")) activeTab = "completed";

      render();
    });
  });
}

function initializeWorkflow() {
  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest(".tech-card");

    if (!button || !card) return;

    const roId = card.dataset.roId;
    const action = button.dataset.action;

    if (!roId) return;

    if (action === "start") {
      await updateTechStatus(roId, "working", "tech_started");
    }

    if (action === "hold") {
      await updateTechStatus(roId, "hold", "tech_hold");
    }

    if (action === "resume") {
      await updateTechStatus(roId, "working", "tech_resumed");
    }

    if (action === "complete") {
      await updateTechStatus(roId, "completed", "tech_completed", {
        techCompletedAtMs: Date.now(),
      });
    }

    if (action === "sendToWash") {
      await updateTechStatus(roId, "completed", "tech_sent_to_wash", {
        techCompletedAtMs: Date.now(),
        sentToWashAtMs: Date.now(),
      });
    }

    if (action === "returnToWorking") {
      await updateTechStatus(roId, "working", "tech_reopened");
    }

    if (action === "bringToShop") {
      await logActivity(roId, "tech_requested_vehicle_to_shop");
      alert("Bring To Shop request will be connected to Requests next.");
    }
  });

  document.body.addEventListener("blur", async (event) => {
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
  }, true);
}

function listenToAssignedRos() {
  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
    where("techId", "==", session.uid)
  );

  onSnapshot(q, (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    render();
  });
}

function render() {
  const assignedContainer = document.getElementById("assignedContainer");
  const workingContainer = document.getElementById("workingContainer");
  const waitingContainer = document.getElementById("waitingContainer");
  const doneContainer = document.getElementById("doneContainer");

  assignedContainer.style.display = activeTab === "assigned" ? "block" : "none";
  workingContainer.style.display = activeTab === "working" ? "block" : "none";
  waitingContainer.style.display = activeTab === "hold" ? "block" : "none";
  doneContainer.style.display = activeTab === "completed" ? "block" : "none";

  assignedContainer.innerHTML = renderCards("assigned");
  workingContainer.innerHTML = renderCards("working");
  waitingContainer.innerHTML = renderCards("hold");
  doneContainer.innerHTML = renderCards("completed");

  updateTabCounts();
}

function renderCards(status) {
  const filtered = rows.filter((ro) => {
    const techStatus = String(ro.techStatus || "assigned").toLowerCase();

    return techStatus === status;
  });

  if (!filtered.length) {
    return `
      <div class="tech-card">
        No vehicles in this view.
      </div>
    `;
  }

  return filtered.map((ro) => renderCard(ro, status)).join("");
}

function renderCard(ro, status) {
  const vehicle = [
    ro.year,
    ro.make,
    ro.model,
  ].filter(Boolean).join(" ");

  return `
    <div class="tech-card" data-ro-id="${escapeHtml(ro.id)}">
      <div class="tech-card-header">
        <strong>RO ${escapeHtml(ro.roNumber || "")}</strong>
        <span>Tag ${escapeHtml(ro.tagNumber || "")}</span>
      </div>

      <div class="tech-card-vehicle">
        ${escapeHtml(vehicle)}
      </div>

      <div class="tech-card-advisor">
        Advisor: ${escapeHtml(ro.advisorName || "")}
      </div>

      <div class="tech-card-concern">
        ${escapeHtml(ro.concern || "")}
      </div>

      ${renderNotes(ro, status)}
      ${renderActions(status)}
    </div>
  `;
}

function renderNotes(ro, status) {
  if (status === "assigned") {
    return "";
  }

  if (status === "completed") {
    return `
      <div class="tech-card-concern">
        Tech Notes: ${escapeHtml(ro.techNotes || "")}
      </div>
    `;
  }

  return `
    <textarea
      class="tech-notes"
      data-ro-id="${escapeHtml(ro.id)}"
      placeholder="Tech notes..."
    >${escapeHtml(ro.techNotes || "")}</textarea>
  `;
}

function renderActions(status) {
  if (status === "assigned") {
    return `
      <div class="tech-card-actions">
        <button class="tech-btn-primary" data-action="start">Start</button>
        <button class="tech-btn-secondary" data-action="bringToShop">Bring To Shop</button>
      </div>
    `;
  }

  if (status === "working") {
    return `
      <div class="tech-card-actions">
        <button data-action="hold">Waiting Parts</button>
        <button data-action="complete">Complete</button>
        <button data-action="sendToWash">Send To Wash</button>
      </div>
    `;
  }

  if (status === "hold") {
    return `
      <div class="tech-card-actions">
        <button data-action="resume">Resume Work</button>
        <button data-action="complete">Complete</button>
        <button data-action="sendToWash">Send To Wash</button>
      </div>
    `;
  }

  if (status === "completed") {
    return `
      <div class="tech-card-actions">
        <button data-action="returnToWorking">Return To Working</button>
      </div>
    `;
  }

  return "";
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

function updateTabCounts() {
  const counts = {
    assigned: 0,
    working: 0,
    hold: 0,
    completed: 0,
  };

  rows.forEach((ro) => {
    const status = String(ro.techStatus || "assigned").toLowerCase();

    if (counts[status] !== undefined) {
      counts[status] += 1;
    }
  });

  setTabText("assigned", `Assigned (${counts.assigned})`);
  setTabText("working", `Working (${counts.working})`);
  setTabText("hold", `Hold (${counts.hold})`);
  setTabText("done", `Done (${counts.completed})`);
}

function setTabText(match, text) {
  const tab = Array.from(document.querySelectorAll(".tech-tab")).find((item) =>
    item.textContent.toLowerCase().includes(match)
  );

  if (tab) {
    tab.textContent = text;
  }
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

    window.addEventListener("dexp-session-ready", () => resolve(getSession()), {
      once: true,
    });
  });
}