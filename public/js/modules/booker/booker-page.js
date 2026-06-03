// ======================================================
// FILE: /public/js/modules/booker/booker-page.js
// MODULE: Booker
// PURPOSE:
// DEXP Booker page.
// Shows washed vehicles and allows booking/QC workflow
// actions: CP booked, warranty booked, request QC,
// and no QC required.
// ======================================================

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  collection,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  markCpBooked,
  markWarrantyBooked
} from "/js/modules/shared/booking-actions-service.js";

import {
  requestQc,
  markNoQcRequired
} from "/js/modules/shared/qc-actions-service.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({ allowedModules: ["booker"] });
  renderAppHeader();

  const session = await waitForSession();
  const dealerId = session?.dealerId || "";

  const tableEl = $("bookerTable");
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
      minute: "2-digit"
    });
  }

  function qcLabel(t) {
    const status = clean(t.qcStatus).toLowerCase();

    if (status === "requested") return "Requested";
    if (status === "working") return "Working";
    if (status === "complete") return "Done";
    if (status === "not_required") return "No QC";

    return "";
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

  function render() {
    const search = clean(searchEl.value).toLowerCase();

    const filtered = rows.filter((t) => {
      if (!search) return true;

      return (
        roValue(t).toLowerCase().includes(search) ||
        tagValue(t).toLowerCase().includes(search)
      );
    });

    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>Tag</th>
          <th>RO</th>
          <th>Model</th>
          <th>Customer</th>
          <th>Location</th>
          <th>Washed</th>
          <th>CP</th>
          <th>WTY</th>
          <th>QC</th>
          <th>CP Booked</th>
          <th>WTY Booked</th>
          <th>Request QC</th>
          <th>No QC</th>
        </tr>
      </thead>

      <tbody>
        ${
          filtered.length
            ? filtered.map((t) => {
              const cpDone = !!t.cpBookedAtMs || !!t.cpBookedAt;
              const wtyDone = !!t.wtyBookedAtMs || !!t.wtyBookedAt;

              const qcStatus = clean(t.qcStatus).toLowerCase();
              const qcLocked =
                qcStatus === "requested" ||
                qcStatus === "working" ||
                qcStatus === "complete" ||
                qcStatus === "not_required";

              return `
                <tr data-id="${escapeHtml(t.id)}">
                  <td><b>${escapeHtml(tagValue(t))}</b></td>
                  <td>${escapeHtml(roValue(t))}</td>
                  <td>${escapeHtml(t.model || "")}</td>
                  <td>${escapeHtml(t.customerName || "")}</td>
                  <td>${escapeHtml(t.currentLocation || t.location || "")}</td>
                  <td>${escapeHtml(fmtTime(t.washedAtMs))}</td>

                  <td>${cpDone ? "✅" : ""}</td>
                  <td>${wtyDone ? "✅" : ""}</td>
                  <td>${escapeHtml(qcLabel(t))}</td>

                  <td>
                    <button class="cpBookedBtn" ${cpDone ? "disabled" : ""}>
                      CP Booked
                    </button>
                  </td>

                  <td>
                    <button class="wtyBookedBtn" ${wtyDone ? "disabled" : ""}>
                      WTY Booked
                    </button>
                  </td>

                  <td>
                    <button class="requestQcBtn" ${qcLocked ? "disabled" : ""}>
                      Request QC
                    </button>
                  </td>

                  <td>
                    <button class="noQcBtn" ${qcLocked ? "disabled" : ""}>
                      No QC Required
                    </button>
                  </td>
                </tr>
              `;
            }).join("")
            : `<tr><td colspan="13">No booking records.</td></tr>`
        }
      </tbody>
    `;
  }

  tableEl.addEventListener("click", async (event) => {
    const btn = event.target.closest("button");
    const tr = event.target.closest("tr[data-id]");

    if (!btn || !tr) return;

    const id = tr.dataset.id;

    try {
      if (btn.classList.contains("cpBookedBtn")) {
        await markCpBooked(id);
        setMsg("CP booked.");
      }

      if (btn.classList.contains("wtyBookedBtn")) {
        await markWarrantyBooked(id);
        setMsg("Warranty booked.");
      }

      if (btn.classList.contains("requestQcBtn")) {
        await requestQc(id);
        setMsg("QC requested.");
      }

      if (btn.classList.contains("noQcBtn")) {
        await markNoQcRequired(id);
        setMsg("No QC required.");
      }
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Action failed.", false);
    }
  });

  searchEl.addEventListener("input", render);

  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", dealerId),
    where("washStatus", "==", "washed")
  );

  onSnapshot(q, (snap) => {
    rows = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));

    rows.sort((a, b) =>
      Number(b.washedAtMs || 0) - Number(a.washedAtMs || 0)
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

    window.addEventListener(
      "dexp-session-ready",
      () => resolve(getSession()),
      { once: true }
    );
  });
}