// ======================================================
// FILE: /public/js/modules/team-leader/team-leader-page.js
// MODULE: Team leader
// PURPOSE: Team dispatch list and this tech's own cars.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { getAdminUserGroups } from "/js/services/firestore/users-service.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let session = null;
let users = [];
let rows = [];
let view = "team";
let extraFilter = "";

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["foreman", "tech"] });
  renderAppHeader();
  session = await waitForSession();
  users = (await getAdminUserGroups()).activeUsers.filter((user) => user.dealerId === session.dealerId);
  document.getElementById("leaderViews").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    view = button.dataset.view;
    document.querySelectorAll("#leaderViews button[data-view]").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === view);
    });
    render();
  });
  document.getElementById("shopFilters")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    extraFilter = extraFilter === button.dataset.filter ? "" : button.dataset.filter;
    document.querySelectorAll("#shopFilters button").forEach((item) => {
      item.classList.toggle("active", item.dataset.filter === extraFilter);
    });
    render();
  });
  document.getElementById("teamTableBody").addEventListener("click", onClick);
  onSnapshot(query(collection(db, "ros"), where("dealerId", "==", session.dealerId)), (snapshot) => {
    rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  });
});

function render() {
  const me = users.find((user) => String(user.uid || user.id) === String(session.uid));
  const shopFilters = document.getElementById("shopFilters");
  if (shopFilters) shopFilters.hidden = view !== "shop";
  const mine = rows.filter((ro) => !isArchived(ro)).filter((ro) => inMyShop(ro, me)).filter((ro) => {
    if (view === "shop") return !ro.techId && matchesExtra(ro);
    if (!ro.techId) return false;
    const tech = users.find((user) => String(user.uid || user.id) === String(ro.techId));
    return String(tech?.teamId || "") === String(me?.teamId || "");
  }).sort(sortRows);
  document.getElementById("teamTableBody").innerHTML = mine.length
    ? mine.map(renderRow).join("")
    : `<tr><td colspan="9">No vehicles in this view.</td></tr>`;
  document.getElementById("msg").textContent = me?.shopId
    ? ""
    : "No shop on this user. Set it in Shop setup.";
}

function isArchived(ro) {
  return String(ro.status || "").toLowerCase() === "archived" || Boolean(ro.archivedAtMs) || Boolean(ro.archivedAt);
}

function matchesExtra(ro) {
  if (!extraFilter) return true;
  if (extraFilter === "waiters") return Boolean(ro.isWaiter);
  if (extraFilter === "pastDue") return isPastDue(ro);
  if (extraFilter === "dueSoon") return isDueSoon(ro);
  return true;
}

function dueMs(ro) {
  return Number(ro.dueTimeMs || ro.promiseTimeMs || ro.nextUpdateTimeMs || 0);
}

function isPastDue(ro) {
  const ms = dueMs(ro);
  return ms > 0 && ms < Date.now();
}

function isDueSoon(ro) {
  const ms = dueMs(ro);
  return ms >= Date.now() && ms <= Date.now() + 60 * 60 * 1000;
}

function dueText(ro) {
  const ms = dueMs(ro);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function priority(ro) {
  if (ro.isWaiter) return `<span class="priority-badge waiter">WAITER</span>`;
  if (isPastDue(ro)) return `<span class="priority-badge waiter">PAST DUE</span>`;
  if (isDueSoon(ro)) return `<span class="priority-badge due">DUE SOON</span>`;
  return "";
}

function sortRows(a, b) {
  if (!!b.isWaiter !== !!a.isWaiter) return Number(!!b.isWaiter) - Number(!!a.isWaiter);
  return dueMs(a) - dueMs(b);
}

function inMyShop(ro, me) {
  if (!me?.shopId) return false;
  const advisor = users.find((user) =>
    user.role === "advisor" &&
    String(user.displayName || "").toLowerCase() === String(ro.advisorName || "").toLowerCase()
  );
  return advisor?.shopId === me.shopId;
}

function renderRow(ro) {
  const vehicle = [ro.year, ro.make, ro.model].filter(Boolean).join(" ");
  const action = `<select data-role="techSelect"><option value="">Select tech</option>${users.filter((user) => user.role === "tech").map((user) => `<option value="${user.uid || user.id}">${user.displayName || user.email}</option>`).join("")}</select><button type="button" data-action="assignTech">Assign</button>`;
  return `<tr data-ro-id="${ro.id}"><td>${priority(ro)}</td><td>${dueText(ro)}</td><td>${ro.roNumber || ""}</td><td>${ro.tagNumber || ""}</td><td>${vehicle}</td><td>${ro.advisorName || ""}</td><td>${ro.techName || "Unassigned"}</td><td>${ro.techStatus || "Unassigned"}</td><td>${action}</td></tr>`;
}

async function onClick(event) {
  const button = event.target.closest("button[data-action]");
  const row = event.target.closest("tr[data-ro-id]");
  if (!button || !row) return;
  if (button.dataset.action === "assignTech") {
    const tech = users.find((user) => String(user.uid || user.id) === row.querySelector("select").value);
    if (!tech) return;
    await updateDoc(doc(db, "ros", row.dataset.roId), {
      techId: tech.uid || tech.id,
      techName: tech.displayName || tech.email || "",
      techStatus: "assigned",
      teamId: tech.teamId || "",
      updatedAt: serverTimestamp(),
      updatedBy: session.uid,
    });
  }
}

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();
    if (existing?.dealerId) return resolve(existing);
    window.addEventListener("dexp-session-ready", () => resolve(getSession()), { once: true });
  });
}