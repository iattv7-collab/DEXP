// ======================================================
// FILE: /public/js/modules/qc/qc-page.js
// MODULE: QC
// PURPOSE:
// DEXP QC work queue.
// Shows active QC tickets, allows QC to start/complete,
// and shows completed QC work for today.
// ======================================================

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  collection,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  startQc,
  releaseQc,
  markQcComplete,
  reopenQc,
} from "/js/modules/shared/qc-actions-service.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["qc"] });
  renderAppHeader();

  const session = await waitForSession();
  const dealerId = session?.dealerId || "";

  const tableEl = $("qcTable");
  const searchEl = $("searchInput");
  const msgEl = $("msg");

  let rows = [];

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

  function fmtTime(ms) {
    if (!ms) return "";
    return new Date(ms).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function isToday(ms) {
    if (!ms) return false;

    const d = new Date(ms);
    const now = new Date();

    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  }

  function render() {
    const search = clean(searchEl.value).toLowerCase();

    const activeRows = rows.filter((t) =>
      ["requested", "working"].includes(clean(t.qcStatus).toLowerCase()),
    );

    const completedTodayRows = rows.filter(
      (t) =>
        clean(t.qcStatus).toLowerCase() === "complete" && isToday(t.qcDoneAtMs),
    );

    const filterBySearch = (list) =>
      list.filter((t) => {
        if (!search) return true;

        return (
          roValue(t).toLowerCase().includes(search) ||
          tagValue(t).toLowerCase().includes(search)
        );
      });

    const active = filterBySearch(activeRows);
    const completedToday = filterBySearch(completedTodayRows);

    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Section</th>
          <th>Tag</th>
          <th>RO</th>
          <th>Model</th>
          <th>Customer</th>
          <th>Location</th>
          <th>QC Status</th>
          <th>Requested</th>
          <th>Started</th>
          <th>Done</th>
          <th>Action</th>
        </tr>
      </thead>

      <tbody>
        ${renderSection("Active QC", active, true)}
        ${renderSection("Completed Today", completedToday, false)}
      </tbody>
    `;
  }

  function renderSection(sectionName, list, activeSection) {
    if (!list.length) {
      return `
        <tr>
          <td>${escapeHtml(sectionName)}</td>
          <td colspan="10">No records.</td>
        </tr>
      `;
    }

    return list
      .map((t) => {
        const status = clean(t.qcStatus).toLowerCase();

        let actionHtml = "";

        if (activeSection && status === "requested") {
          actionHtml = `<button class="startQcBtn">Start QC</button>`;
        }

        if (activeSection && status === "working") {
          actionHtml = `
          <button class="releaseQcBtn">Release</button>
          <button class="completeQcBtn">Complete QC</button>
        `;
        }

        if (!activeSection) {
          actionHtml = `
          <button class="reopenQcBtn">Reopen</button>
        `;
        }

        return `
        <tr data-id="${escapeHtml(t.id)}">
          <td>${escapeHtml(sectionName)}</td>
          <td><b>${escapeHtml(tagValue(t))}</b></td>
          <td>${escapeHtml(roValue(t))}</td>
          <td>${escapeHtml(t.model || "")}</td>
          <td>${escapeHtml(t.customerName || "")}</td>
          <td>${escapeHtml(t.currentLocation || t.location || "")}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(fmtTime(t.qcRequestedAtMs))}</td>
          <td>${escapeHtml(fmtTime(t.qcStartedAtMs))}</td>
          <td>${escapeHtml(fmtTime(t.qcDoneAtMs))}</td>
          <td>${actionHtml}</td>
        </tr>
      `;
      })
      .join("");
  }

  tableEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    const tr = e.target.closest("tr[data-id]");

    if (!btn || !tr) return;

    const id = tr.dataset.id;

    try {
      if (btn.classList.contains("startQcBtn")) {
        await startQc(id);
        setMsg("QC started.");
      }

      if (btn.classList.contains("releaseQcBtn")) {
        await releaseQc(id);
        setMsg("QC released back to active queue.");
      }

      if (btn.classList.contains("completeQcBtn")) {
        await markQcComplete(id);
        setMsg("QC completed.");
      }

      if (btn.classList.contains("reopenQcBtn")) {
        await reopenQc(id);
        setMsg("QC reopened.");
      }
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "QC action failed.", false);
    }
  });

  searchEl.addEventListener("input", render);

  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", dealerId),
    where("qcRequired", "==", true),
  );

  onSnapshot(q, (snap) => {
    rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    rows.sort(
      (a, b) =>
        Number(b.qcRequestedAtMs || b.qcDoneAtMs || 0) -
        Number(a.qcRequestedAtMs || a.qcDoneAtMs || 0),
    );

    render();
  });
});

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
