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
  updateArea,
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
        <td colspan="2">No areas created.</td>
      </tr>
    `;
    return;
  }

  areas.forEach((area) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>
        <input
          class="area-edit-input"
          data-original="${escapeHtml(area.label || "")}"
          value="${escapeHtml(area.label || "")}"
          disabled
        />
      </td>

      <td>
        <button class="small-button secondary edit-area-button" data-id="${area.id}">
          Edit
        </button>

        <button class="small-button save-area-button" data-id="${area.id}" disabled>
          Save
        </button>

        <button class="small-button secondary cancel-area-button" data-id="${area.id}" disabled>
          Cancel
        </button>

        <button class="small-button secondary delete-area-button" data-id="${area.id}">
          Delete
        </button>
      </td>
    `;

    areasTableBody.appendChild(row);
  });

  bindAreaEditButtons();
  bindDeleteAreaButtons();
}

function bindAreaEditButtons() {
  areasTableBody.querySelectorAll("tr").forEach((row) => {
    const input = row.querySelector(".area-edit-input");
    const saveButton = row.querySelector(".save-area-button");
    const cancelButton = row.querySelector(".cancel-area-button");
    const editButton = row.querySelector(".edit-area-button");

    if (!input || !saveButton || !cancelButton || !editButton) {
      return;
    }

    editButton.addEventListener("click", () => {
      input.disabled = false;
      cancelButton.disabled = false;
      input.focus();
    });

    input.addEventListener("input", () => {
      const changed = input.value.trim() !== input.dataset.original.trim();

      saveButton.disabled = !changed;
    });

    cancelButton.addEventListener("click", () => {
      input.value = input.dataset.original;
      input.disabled = true;
      saveButton.disabled = true;
      cancelButton.disabled = true;
    });

    saveButton.addEventListener("click", async () => {
      const newLabel = input.value.trim();

      if (!newLabel) {
        showMessage("Area name cannot be empty.");
        return;
      }

      await updateArea(saveButton.dataset.id, {
        label: newLabel,
      });

      await loadAreas();

      showMessage("Area updated.");
    });
  });
}

function bindDeleteAreaButtons() {
  document.querySelectorAll(".delete-area-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = confirm("Delete this area?");

      if (!confirmed) {
        return;
      }

      await deleteArea(button.dataset.id);
      await loadAreas();

      showMessage("Area deleted.");
    });
  });
}

function populateAreaDropdown(areas = []) {
  const currentValue = locationAreaSelect.value;

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

  if (currentValue) {
    locationAreaSelect.value = currentValue;
  }
}

async function handleCreateLocation() {
  clearMessage();

  const capacity = Number(locationCapacityInput.value || 0);
  const label = locationNameInput.value.trim();
  const area = locationAreaSelect.value;

  if (!area) {
    showMessage("Select area.");
    return;
  }

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

  renderActiveLocations(sortLocations(active));
  renderInactiveLocations(sortLocations(inactive));
}

function renderActiveLocations(locations = []) {
  activeLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    activeLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="4">No active locations.</td>
      </tr>
    `;
    return;
  }

  locations.forEach((location) => {
    const row = document.createElement("tr");

    row.innerHTML = buildLocationRow({
      location,
      inactive: false,
    });

    activeLocationsTableBody.appendChild(row);
  });

  bindLocationEditButtons(activeLocationsTableBody);
  bindDeactivateButtons();
}

function renderInactiveLocations(locations = []) {
  inactiveLocationsTableBody.innerHTML = "";

  if (!locations.length) {
    inactiveLocationsTableBody.innerHTML = `
      <tr>
        <td colspan="4">No inactive locations.</td>
      </tr>
    `;
    return;
  }

  locations.forEach((location) => {
    const row = document.createElement("tr");

    row.innerHTML = buildLocationRow({
      location,
      inactive: true,
    });

    inactiveLocationsTableBody.appendChild(row);
  });

  bindLocationEditButtons(inactiveLocationsTableBody);
  bindReactivateButtons();
  bindDeleteLocationButtons();
}

function buildLocationRow({ location, inactive }) {
  const statusButton = inactive
    ? `
      <button class="small-button reactivate-location-button" data-id="${location.id}">
        Reactivate
      </button>

      <button class="small-button secondary delete-location-button" data-id="${location.id}">
        Delete
      </button>
    `
    : `
      <button class="small-button secondary deactivate-location-button" data-id="${location.id}">
        Deactivate
      </button>
    `;

  return `
    <td data-label="Area">
      ${escapeHtml(formatArea(location.area))}
    </td>

    <td data-label="Lot Name">
      <input
        class="location-label-edit-input"
        data-original="${escapeHtml(location.label || "")}"
        value="${escapeHtml(location.label || "")}"
        disabled
      />
    </td>

    <td data-label="Capacity">
      <input
        class="location-capacity-edit-input"
        type="number"
        min="0"
        data-original="${location.capacity || 0}"
        value="${location.capacity || 0}"
        disabled
      />
    </td>

    <td data-label="Actions">
      <button class="small-button secondary edit-location-button" data-id="${location.id}">
        Edit
      </button>

      <button class="small-button save-location-button" data-id="${location.id}" disabled>
        Save
      </button>

      <button class="small-button secondary cancel-location-button" data-id="${location.id}" disabled>
        Cancel
      </button>

      ${statusButton}
    </td>
  `;
}

function bindLocationEditButtons(tableBody) {
  tableBody.querySelectorAll("tr").forEach((row) => {
    const labelInput = row.querySelector(".location-label-edit-input");
    const capacityInput = row.querySelector(".location-capacity-edit-input");
    const editButton = row.querySelector(".edit-location-button");
    const saveButton = row.querySelector(".save-location-button");
    const cancelButton = row.querySelector(".cancel-location-button");

    if (
      !labelInput ||
      !capacityInput ||
      !editButton ||
      !saveButton ||
      !cancelButton
    ) {
      return;
    }

    function checkForChanges() {
      const labelChanged =
        labelInput.value.trim() !== labelInput.dataset.original.trim();

      const capacityChanged =
        Number(capacityInput.value || 0) !==
        Number(capacityInput.dataset.original || 0);

      saveButton.disabled = !labelChanged && !capacityChanged;
    }

    editButton.addEventListener("click", () => {
      labelInput.disabled = false;
      capacityInput.disabled = false;
      cancelButton.disabled = false;
      labelInput.focus();
    });

    labelInput.addEventListener("input", checkForChanges);
    capacityInput.addEventListener("input", checkForChanges);

    cancelButton.addEventListener("click", () => {
      labelInput.value = labelInput.dataset.original;
      capacityInput.value = capacityInput.dataset.original;

      labelInput.disabled = true;
      capacityInput.disabled = true;
      saveButton.disabled = true;
      cancelButton.disabled = true;
    });

    saveButton.addEventListener("click", async () => {
      const newLabel = labelInput.value.trim();
      const newCapacity = Number(capacityInput.value || 0);

      if (!newLabel) {
        showMessage("Location name cannot be empty.");
        return;
      }

      await updateLocation(saveButton.dataset.id, {
        label: newLabel,
        capacity: newCapacity,
      });

      await loadLocations();

      showMessage("Location updated.");
    });
  });
}

function bindDeactivateButtons() {
  document.querySelectorAll(".deactivate-location-button").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateLocation(button.dataset.id, {
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
        await updateLocation(button.dataset.id, {
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
        const confirmed = confirm("Delete this parking lot?");

        if (!confirmed) {
          return;
        }

        await deleteLocation(button.dataset.id);

        await loadLocations();

        showMessage("Location deleted.");
      });
    });
}

function sortLocations(locations = []) {
  return [...locations].sort((a, b) => {
    const areaCompare = formatArea(a.area).localeCompare(formatArea(b.area));

    if (areaCompare !== 0) {
      return areaCompare;
    }

    return String(a.label || "").localeCompare(String(b.label || ""));
  });
}

function formatArea(area) {
  return String(area || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function showMessage(message) {
  locationSettingsMessage.textContent = message;
}

function clearMessage() {
  locationSettingsMessage.textContent = "";
}