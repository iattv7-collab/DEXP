// public/pages/location-settings/location-settings.js

import { renderAppHeader } from "/js/shared/app-header.js";

import { protectRoute } from "/js/core/router.js";

import { MODULES } from "/js/config/modules.js";

import {
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from "/js/services/firestore/locations-service.js";

import {
  getAreas,
  createArea,
  deleteArea,
} from "/js/services/firestore/areas-service.js";

protectRoute({
  allowedModules: [MODULES.MOVE_LOCATE],
});

const locationCapacityInput = document.getElementById("locationCapacityInput");

const locationNameInput = document.getElementById("locationNameInput");

const locationAreaSelect = document.getElementById("locationAreaSelect");

const areaNameInput = document.getElementById("areaNameInput");

const addAreaButton = document.getElementById("addAreaButton");

const areasTableBody = document.getElementById("areasTableBody");

const addLocationButton = document.getElementById("addLocationButton");

const locationSettingsMessage = document.getElementById(
  "locationSettingsMessage",
);

const activeLocationsTableBody = document.getElementById(
  "activeLocationsTableBody",
);

const inactiveLocationsTableBody = document.getElementById(
  "inactiveLocationsTableBody",
);

window.addEventListener("dexp-session-ready", () => {
  initializeLocationSettings();
});

function initializeLocationSettings() {
  renderAppHeader({
    title: "Location Settings",
  });

  addLocationButton.addEventListener("click", async () => {
    await handleCreateLocation();
  });

  addAreaButton.addEventListener("click", async () => {
    await handleCreateArea();
  });

  loadAreas();
  loadLocations();
}

async function handleCreateArea() {
  clearMessage();

  const label = areaNameInput.value.trim();

  if (!label) {
    showMessage("Enter area name.");
    return;
  }

  try {
    await createArea(label);

    areaNameInput.value = "";

    await loadAreas();

    showMessage("Area added.");
  } catch (error) {
    console.error(error);

    showMessage("Could not create area.");
  }
}

async function loadAreas() {
  try {
    const areas = await getAreas();

    renderAreas(areas);
    populateAreaDropdown(areas);
  } catch (error) {
    console.error(error);

    showMessage("Could not load areas.");
  }
}

function renderAreas(areas = []) {
  areasTableBody.innerHTML = "";

  if (!areas.length) {
    areasTableBody.innerHTML = `
      <tr>
        <td colspan="2">
          No areas created.
        </td>
      </tr>
    `;

    return;
  }

  areas.forEach((area) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        ${area.label || ""}
      </td>

      <td>
        <button
          class="small-button secondary delete-area-button"
          data-id="${area.id}"
        >
          Delete
        </button>
      </td>
    `;

    areasTableBody.appendChild(row);
  });

  bindDeleteAreaButtons();
}

function bindDeleteAreaButtons() {
  document.querySelectorAll(".delete-area-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;

      await deleteArea(id);

      await loadAreas();

      showMessage("Area deleted.");
    });
  });
}

function populateAreaDropdown(areas = []) {
  locationAreaSelect.innerHTML = "";

  const placeholder = document.createElement("option");

  placeholder.value = "";
  placeholder.textContent = "Select area...";

  locationAreaSelect.appendChild(placeholder);

  areas.forEach((area) => {
    const option = document.createElement("option");

    option.value = area.value;
    option.textContent = area.label;

    locationAreaSelect.appendChild(option);
  });
}

async function handleCreateLocation() {
  clearMessage();

  const capacity = Number(locationCapacityInput.value || 0);

  const label = locationNameInput.value.trim();

  const area = locationAreaSelect.value;

  if (!label) {
    showMessage("Enter location name.");
    return;
  }

  try {
    await createLocation({
      label,
      area,
      capacity,
    });

    locationNameInput.value = "";
    locationCapacityInput.value = "";

    await loadLocations();

    showMessage("Location added.");
  } catch (error) {
    console.error(error);

    showMessage("Could not create location.");
  }
}

async function loadLocations() {
  try {
    const locations = await getAllLocations();

    renderLocationTables(locations);
  } catch (error) {
    console.error(error);

    showMessage("Could not load locations.");
  }
}

function renderLocationTables(locations = []) {
  const active = locations.filter((location) => location.active !== false);

  const inactive = locations.filter((location) => location.active === false);

  renderActiveLocations(active);

  renderInactiveLocations(inactive);
}

function renderActiveLocations(locations = []) {
  activeLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    activeLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          No active locations.
        </td>
      </tr>
    `;

    return;
  }

  locations.forEach((location) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td data-label="Location">
        ${location.label || ""}
      </td>

      <td data-label="Area">
        ${formatArea(location.area)}
      </td>

      <td data-label="Capacity">
        ${location.capacity || 0}
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

    activeLocationsTableBody.appendChild(row);
  });

  bindDeactivateButtons();
}

function renderInactiveLocations(locations = []) {
  inactiveLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    inactiveLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="5">
          No inactive locations.
        </td>
      </tr>
    `;

    return;
  }

  locations.forEach((location) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td data-label="Location">
        ${location.label || ""}
      </td>

      <td data-label="Area">
        ${formatArea(location.area)}
      </td>

      <td data-label="Capacity">
        ${location.capacity || 0}
      </td>

      <td data-label="Status">
        Inactive
      </td>

      <td data-label="Actions">
        <button
          class="small-button reactivate-location-button"
          data-id="${location.id}"
        >
          Reactivate
        </button>

        <button
          class="small-button secondary delete-location-button"
          data-id="${location.id}"
        >
          Delete
        </button>
      </td>
    `;

    inactiveLocationsTableBody.appendChild(row);
  });

  bindReactivateButtons();
  bindDeleteLocationButtons();
}

function bindDeactivateButtons() {
  document.querySelectorAll(".deactivate-location-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;

      await updateLocation(id, {
        active: false,
      });

      await loadLocations();

      showMessage("Location deactivated.");
    });
  });
}

function bindReactivateButtons() {
  inactiveLocationsTableBody
    .querySelectorAll(".reactivate-location-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.id;

        await updateLocation(id, {
          active: true,
        });

        await loadLocations();

        showMessage("Location reactivated.");
      });
    });
}

function bindDeleteLocationButtons() {
  inactiveLocationsTableBody
    .querySelectorAll(".delete-location-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.id;

        await deleteLocation(id);

        await loadLocations();

        showMessage("Location deleted.");
      });
    });
}

function formatArea(area) {
  return String(area || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function showMessage(message) {
  locationSettingsMessage.textContent = message;
}

function clearMessage() {
  locationSettingsMessage.textContent = "";
}
