// public/js/modules/ro-tracker-sharing/ro-tracker-sharing-ui.js

import {
  getDealerAdvisors,
  getMyROTrackerSharing,
  saveROTrackerSharing
} from "./ro-tracker-sharing-service.js";

import { getSession } from "/js/core/session.js";

export async function openROTrackerSharingModal() {
  const session = getSession();

  const advisors = await getDealerAdvisors();
  const currentSharing = await getMyROTrackerSharing();

  const existingCompanyIds = Array.isArray(
    currentSharing?.sharedWithCompanyIds
  )
    ? currentSharing.sharedWithCompanyIds
    : [];

  const otherAdvisors = advisors.filter((advisor) => {
    return advisor.id !== session.uid;
  });

  const overlay = document.createElement("div");

  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.45)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";

  const modal = document.createElement("div");

  modal.className = "tool-card";
  modal.style.width = "420px";
  modal.style.maxWidth = "92vw";
  modal.style.padding = "24px";

  modal.innerHTML = `
    <h2 style="margin-bottom:10px;">
      Share My RO Tracker
    </h2>

    <p class="tool-help" style="margin-bottom:18px;">
      Select advisors who can access your tracker.
    </p>

    <div id="sharingAdvisorList"></div>

    <div
      style="
        display:flex;
        justify-content:flex-end;
        gap:10px;
        margin-top:24px;
      "
    >
      <button
        id="btnCloseShareModal"
        type="button"
        class="secondary"
      >
        Cancel
      </button>

      <button
        id="btnSaveSharing"
        type="button"
      >
        Save
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const advisorList = modal.querySelector("#sharingAdvisorList");

  otherAdvisors.forEach((advisor) => {
    const companyId = advisor.companyId || "";
    const checked = existingCompanyIds.includes(companyId);

    const row = document.createElement("label");

    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.marginBottom = "12px";

    row.innerHTML = `
      <input
        type="checkbox"
        value="${companyId}"
        ${checked ? "checked" : ""}
      />

      <span>
        ${advisor.displayName || ""}
        (${companyId || "No ID"})
      </span>
    `;

    advisorList.appendChild(row);
  });

  modal
    .querySelector("#btnCloseShareModal")
    ?.addEventListener("click", () => {
      overlay.remove();
    });

  modal
    .querySelector("#btnSaveSharing")
    ?.addEventListener("click", async () => {
      try {
        const selectedCompanyIds = Array.from(
          modal.querySelectorAll('input[type="checkbox"]:checked')
        )
          .map((checkbox) => checkbox.value)
          .filter(Boolean);

        await saveROTrackerSharing({
          sharedWithCompanyIds: selectedCompanyIds
        });

        alert("RO Tracker sharing updated.");

        overlay.remove();
      } catch (error) {
        console.error("Sharing save failed:", error);

        alert("Could not save sharing settings.");
      }
    });
}