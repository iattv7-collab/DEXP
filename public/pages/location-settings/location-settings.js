// public/pages/location-settings/location-settings.js

import { renderAppHeader } from "/js/shared/app-header.js";

import { protectRoute } from "/js/core/router.js";

import { MODULES } from "/js/config/modules.js";

import {
  getAllLocations,
  createLocation,
  updateLocation
} from "/js/services/firestore/locations-service.js";

protectRoute({
  allowedModules: [MODULES.MOVE_LOCATE]
});

const locationNameInput =
  document.getElementById("locationNameInput");

const locationAreaSelect =
  document.getElementById("locationAreaSelect");

const addLocationButton =
  document.getElementById("addLocationButton");

const locationSettingsMessage =
  document.getElementById("locationSettingsMessage");

const activeLocationsTableBody =
  document.getElementById("activeLocationsTableBody");

const inactiveLocationsTableBody =
  document.getElementById("inactiveLocationsTableBody");

window.addEventListener(
  "dexp-session-ready",
  () => {
    initializeLocationSettings();
  }
);

function initializeLocationSettings() {
  renderAppHeader({
    title: "Location Settings"
  });

  addLocationButton.addEventListener(
    "click",
    async () => {
      await handleCreateLocation();
    }
  );

  loadLocations();
}

async function handleCreateLocation() {
  clearMessage();

  const label =
    locationNameInput.value.trim();

  const area =
    locationAreaSelect.value;

  if (!label) {
    showMessage("Enter location name.");
    return;
  }

  try {
    await createLocation({
      label,
      area
    });

    locationNameInput.value = "";

    await loadLocations();

    showMessage("Location added.");
  } catch (error) {
    console.error(error);

    showMessage(
      "Could not create location."
    );
  }
}

async function loadLocations() {
  try {
    const locations =
      await getAllLocations();

    renderLocationTables(locations);
  } catch (error) {
    console.error(error);

    showMessage(
      "Could not load locations."
    );
  }
}

function renderLocationTables(
  locations = []
) {
  const active =
    locations.filter(
      (location) => location.active !== false
    );

  const inactive =
    locations.filter(
      (location) => location.active === false
    );

  renderActiveLocations(active);

  renderInactiveLocations(inactive);
}

function renderActiveLocations(
  locations = []
) {
  activeLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    activeLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="4">
          No active locations.
        </td>
      </tr>
    `;

    return;
  }

  locations.forEach((location) => {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td data-label="Location">
        ${location.label || ""}
      </td>

      <td data-label="Area">
        ${formatArea(location.area)}
      </td>

      <td data-label="Status">
        Active
      </td>

      <td data-label="Actions">
        <button
          class="small-button secondary deactivate-location-button"
          data-id="${location.id}"
        >
          Deactivate
        </button>
      </td>
    `;

    activeLocationsTableBody.appendChild(
      row
    );
  });

  bindDeactivateButtons();
}

function renderInactiveLocations(
  locations = []
) {
  inactiveLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    inactiveLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="4">
          No inactive locations.
        </td>
      </tr>
    `;

    return;
  }

  locations.forEach((location) => {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td data-label="Location">
        ${location.label || ""}
      </td>

      <td data-label="Area">
        ${formatArea(location.area)}
      </td>

      <td data-label="Status">
        Inactive
      </td>

      <td data-label="Actions">
        <button
          class="small-button"
          data-id="${location.id}"
        >
          Reactivate
        </button>
      </td>
    `;

    inactiveLocationsTableBody.appendChild(
      row
    );
  });

  bindReactivateButtons();
}

function bindDeactivateButtons() {
  document
    .querySelectorAll(
      ".deactivate-location-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.id;

          await updateLocation(
            id,
            {
              active: false
            }
          );

          await loadLocations();

          showMessage(
            "Location deactivated."
          );
        }
      );
    });
}

function bindReactivateButtons() {
  inactiveLocationsTableBody
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          const id =
            button.dataset.id;

          await updateLocation(
            id,
            {
              active: true
            }
          );

          await loadLocations();

          showMessage(
            "Location reactivated."
          );
        }
      );
    });
}

function formatArea(area) {
  if (area === "annex") {
    return "Annex";
  }

  return "Main Store";
}

function showMessage(message) {
  locationSettingsMessage.textContent =
    message;
}

function clearMessage() {
  locationSettingsMessage.textContent =
    "";
}