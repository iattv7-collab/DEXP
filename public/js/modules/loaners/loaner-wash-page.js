// ======================================================
// FILE: /public/js/modules/loaners/loaner-wash-page.js
// MODULE: Loaner Wash Queue
// PURPOSE:
// Display dealer loaners currently marked At Wash.
// Wash Complete changes the vehicle to Available.
// Real-time listening automatically removes vehicles
// changed to Available from Fleet or another screen.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { MODULES } from "/js/config/modules.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: [MODULES.LOANER_WASH],
  });

  renderAppHeader();

  let currentSession = getSession();
  let currentDealerId = currentSession?.dealerId || "";
  let washRows = [];
  let unsubscribeWashQueue = null;

  function waitForSession() {
    return new Promise((resolve) => {
      const existing = getSession();

      if (existing?.dealerId) {
        resolve(existing);
        return;
      }

      window.addEventListener(
        "dexp-session-ready",
        () => {
          resolve(getSession());
        },
        { once: true },
      );
    });
  }

  function timestampToMs(value) {
    if (!value) return 0;

    if (typeof value.toMillis === "function") {
      return value.toMillis();
    }

    if (typeof value.seconds === "number") {
      return value.seconds * 1000;
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function listenToWashQueue() {
    if (!currentDealerId || unsubscribeWashQueue) return;

    const fleetQuery = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
    );

    unsubscribeWashQueue = onSnapshot(
      fleetQuery,
      (snapshot) => {
        washRows = [];

        snapshot.forEach((documentSnapshot) => {
          const row = {
            id: documentSnapshot.id,
            ...documentSnapshot.data(),
          };

          const status = String(row.status || "")
            .trim()
            .toUpperCase();

          if (status !== "AT WASH") return;

          washRows.push(row);
        });

        washRows.sort((a, b) => {
          const aTime =
            timestampToMs(a.updatedAt) || timestampToMs(a.lastReturnedAt);

          const bTime =
            timestampToMs(b.updatedAt) || timestampToMs(b.lastReturnedAt);

          return bTime - aTime;
        });

        renderWashQueue();
        updateCount();
      },
      (error) => {
        console.error("Loaner wash listener failed:", error);

        $("loanerWashMessage").textContent =
          "The loaner wash queue could not be loaded.";
      },
    );
  }

  function renderWashQueue() {
    const tableBody = $("loanerWashTableBody");

    if (!tableBody) return;

    if (!washRows.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="loaner-wash-empty">
            No loaners are waiting for wash.
          </td>
        </tr>
      `;

      return;
    }

    tableBody.innerHTML = washRows
      .map((row) => {
        const vin = row.vin || row.id || "";

        return `
          <tr>
            <td>${escapeHtml(row.unitNumber || "")}</td>

            <td>
              ${escapeHtml(row.last8 || vin.slice(-8))}
            </td>

            <td>${escapeHtml(row.year || "")}</td>

            <td>${escapeHtml(row.model || "")}</td>

            <td>
              ${escapeHtml(row.lastReturnedAt || "")}
            </td>

            <td>
              ${escapeHtml(row.lastReceivedByName || "")}
            </td>

            <td>
              ${escapeHtml(row.lastMileage || "")}
            </td>

            <td>
              ${escapeHtml(row.lastFuelLevel || "")}
            </td>

            <td>
              ${escapeHtml(row.lastDamageNotes || "")}
            </td>

            <td class="center">
              <button
                type="button"
                class="wash-complete-button"
                data-vin="${escapeAttr(vin)}"
              >
                Wash Complete
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    bindWashActions();
  }

  function bindWashActions() {
    document.querySelectorAll(".wash-complete-button").forEach((button) => {
      button.addEventListener("click", async () => {
        await completeWash(button.dataset.vin, button);
      });
    });
  }

  async function completeWash(vin, button) {
    const cleanVin = String(vin || "").trim();

    if (!cleanVin) return;

    const row = washRows.find((item) => {
      return String(item.vin || item.id || "").trim() === cleanVin;
    });

    if (!row) {
      $("loanerWashMessage").textContent =
        "This loaner is no longer in the wash queue.";

      return;
    }

    const currentStatus = String(row.status || "")
      .trim()
      .toUpperCase();

    if (currentStatus !== "AT WASH") {
      $("loanerWashMessage").textContent =
        "This loaner is no longer marked At Wash.";

      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      await setDoc(
        doc(db, "loanerFleet", cleanVin),
        {
          status: "Available",

          washedAt: serverTimestamp(),

          washedByUid: currentSession?.uid || auth.currentUser?.uid || "",

          washedByName:
            currentSession?.displayName || auth.currentUser?.displayName || "",

          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      $("loanerWashMessage").textContent =
        "Wash completed. Loaner is now Available.";

      /*
       * Do not manually remove the row.
       * The Firestore listener receives the new Available
       * status and removes it from this queue automatically.
       */
    } catch (error) {
      console.error("Wash completion failed:", error);

      button.disabled = false;
      button.textContent = "Wash Complete";

      $("loanerWashMessage").textContent =
        "Wash completion could not be saved.";
    }
  }

    function updateCount() {
    const countElement = $("loanerWashCount");

    if (!countElement) return;

    countElement.textContent = String(washRows.length);
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[character],
    );
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  currentSession = await waitForSession();
  currentDealerId = currentSession?.dealerId || "";

  listenToWashQueue();

  window.addEventListener("beforeunload", () => {
    if (unsubscribeWashQueue) {
      unsubscribeWashQueue();
      unsubscribeWashQueue = null;
    }
  });
});
