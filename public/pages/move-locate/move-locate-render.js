// public/pages/move-locate/move-locate-render.js
// UI rendering helpers for Move & Locate.
// This file only updates the DOM. It does not read or write Firestore.

import {
  escapeHtml,
  formatAreaLabel,
  formatAreaLot,
} from "./move-locate-helpers.js";

export function hideOldSingleSaveUi({
  singleFinalLocationControls,
  singleSaveLocationRow,
  saveLocationButton,
}) {
  if (singleFinalLocationControls) {
    singleFinalLocationControls.classList.add("hidden");
  }

  if (singleSaveLocationRow) {
    singleSaveLocationRow.classList.add("hidden");
  }

  if (saveLocationButton) {
    saveLocationButton.disabled = true;
  }
}

export function showUnifiedSaveButton({ groupSaveLocationRow }) {
  if (groupSaveLocationRow) {
    groupSaveLocationRow.classList.remove("hidden");
  }
}

export function hideUnifiedSaveButton({
  groupSaveLocationRow,
  saveGroupLocationsButton,
}) {
  if (groupSaveLocationRow) {
    groupSaveLocationRow.classList.add("hidden");
  }

  if (saveGroupLocationsButton) {
    saveGroupLocationsButton.disabled = true;
  }
}

export function updateUnifiedSaveButtonState({
  saveGroupLocationsButton,
  currentMoveGroup,
  groupFinalLocationList,
}) {
  if (!saveGroupLocationsButton) {
    return;
  }

  if (!currentMoveGroup.length) {
    saveGroupLocationsButton.disabled = true;
    return;
  }

  const allHaveFinalLocation = currentMoveGroup.every((ro) => {
    const areaSelect = groupFinalLocationList.querySelector(
      `.group-area-select[data-id="${ro.id}"]`,
    );

    const lotSelect = groupFinalLocationList.querySelector(
      `.group-lot-select[data-id="${ro.id}"]`,
    );

    return Boolean(areaSelect?.value && lotSelect?.value);
  });

  saveGroupLocationsButton.disabled = !allHaveFinalLocation;
}

export function renderUnifiedMoveCardsView({
  currentMoveGroup,
  groupFinalLocationList,
  groupedLocations,
  getROTag,
  getROArea,
  getROLot,
  getRORONumber,
  hideOldSingleSaveUi,
  showUnifiedSaveButton,
  updateUnifiedSaveButtonState,
  normalizeTag,
}) {
  groupFinalLocationList.innerHTML = "";

  hideOldSingleSaveUi();
  showUnifiedSaveButton();

  if (!currentMoveGroup.length) {
    updateUnifiedSaveButtonState();
    return;
  }

  currentMoveGroup.forEach((ro) => {
    const card = document.createElement("div");

    card.className = "tool-preview";
    card.style.marginBottom = "10px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div>
          <div><b>TAG</b> ${escapeHtml(getROTag(ro))}</div>
          <div><b>RO</b> ${escapeHtml(getRORONumber(ro))}</div>
          <div><b>Current Area/Lot:</b> ${escapeHtml(formatAreaLot(getROArea(ro), getROLot(ro)) || "")}</div>
          <div><b>Status:</b> ${escapeHtml(ro.moveStatus || "")}</div>
        </div>

        <div>
          <label>
            Final Area
            <select class="group-area-select" data-id="${escapeHtml(ro.id)}">
              <option value="">Select area...</option>
              ${Object.keys(groupedLocations)
                .map(
                  (area) =>
                    `<option value="${escapeHtml(area)}">${escapeHtml(
                      formatAreaLabel(area),
                    )}</option>`,
                )
                .join("")}
            </select>
          </label>

          <label>
            Final Lot
            <select class="group-lot-select" data-id="${escapeHtml(ro.id)}">
              <option value="">Select area first...</option>
            </select>
          </label>

          <label>
            Blocking Tag
            <input
              class="group-blocking-input"
              data-id="${escapeHtml(ro.id)}"
              type="text"
              placeholder="Tag this car is blocking"
            />
          </label>
        </div>
      </div>
    `;

    groupFinalLocationList.appendChild(card);
  });

  groupFinalLocationList
    .querySelectorAll(".group-area-select")
    .forEach((select) => {
      select.addEventListener("change", () => {
        const roId = select.dataset.id;
        const lotSelect = groupFinalLocationList.querySelector(
          `.group-lot-select[data-id="${roId}"]`,
        );

        lotSelect.innerHTML = `<option value="">Select lot...</option>`;

        const lots = groupedLocations[select.value] || [];

        lots.forEach((lot) => {
          const option = document.createElement("option");

          option.value = lot.label;
          option.textContent = lot.label;

          lotSelect.appendChild(option);
        });

        updateUnifiedSaveButtonState();
      });
    });

  groupFinalLocationList
    .querySelectorAll(".group-lot-select")
    .forEach((select) => {
      select.addEventListener("change", updateUnifiedSaveButtonState);
    });

  groupFinalLocationList
    .querySelectorAll(".group-blocking-input")
    .forEach((input) => {
      input.addEventListener("input", () => {
        input.value = normalizeTag(input.value);
      });
    });

  updateUnifiedSaveButtonState();
}