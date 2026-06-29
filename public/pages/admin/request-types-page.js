// public/pages/admin/request-types-page.js
// Admin page for dealer-specific request type settings.

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

import { getNotificationGroups } from "../../js/services/firestore/notification-groups-service.js";

import {
  createRequestType,
  deleteRequestType,
  getRequestTypes,
  updateRequestType,
} from "../../js/services/firestore/request-types-service.js";

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

const requestTypesMessage = document.getElementById("requestTypesMessage");
const requestTypeNameInput = document.getElementById("requestTypeNameInput");
const requestTypeKeyInput = document.getElementById("requestTypeKeyInput");
const requestTypeTargetGroupSelect = document.getElementById(
  "requestTypeTargetGroupSelect",
);
const requestTypeSortOrderInput = document.getElementById(
  "requestTypeSortOrderInput",
);
const requestTypeDefaultMessageInput = document.getElementById(
  "requestTypeDefaultMessageInput",
);
const addRequestTypeButton = document.getElementById("addRequestTypeButton");
const activeRequestTypesTableBody = document.getElementById(
  "activeRequestTypesTableBody",
);
const inactiveRequestTypesTableBody = document.getElementById(
  "inactiveRequestTypesTableBody",
);

let notificationGroups = [];
let requestTypes = [];

window.addEventListener("dexp-session-ready", () => {
  initializeRequestTypesPage();
});

async function initializeRequestTypesPage() {
  renderAppHeader({
    pageTitle: "Request Types",
  });

  addRequestTypeButton.addEventListener("click", handleCreateRequestType);
  requestTypeNameInput.addEventListener("input", () => {
  requestTypeKeyInput.value = buildRequestKey(requestTypeNameInput.value);
});

  notificationGroups = await getNotificationGroups();

  populateTargetGroupSelect();

  await loadRequestTypes();
}

function populateTargetGroupSelect() {
  requestTypeTargetGroupSelect.innerHTML = `
    <option value="">Select group...</option>
  `;

  notificationGroups.forEach((group) => {
    const option = document.createElement("option");

    option.value = group.id;
    option.textContent = group.name || group.id;

    requestTypeTargetGroupSelect.appendChild(option);
  });
}

async function handleCreateRequestType() {
  clearMessage();

  const name = requestTypeNameInput.value.trim();
  const requestType = requestTypeKeyInput.value.trim();
  const targetGroupId = requestTypeTargetGroupSelect.value;
  const targetGroup = notificationGroups.find(
    (group) => group.id === targetGroupId,
  );

  if (!name) {
    showMessage("Enter button name.");
    return;
  }

  if (!requestType) {
    showMessage("Enter request key.");
    return;
  }

  if (!targetGroup) {
    showMessage("Select target group.");
    return;
  }

  const sortOrder = Number(requestTypeSortOrderInput.value || 0);

  if (sortOrderExists(sortOrder)) {
    showMessage("That sort order is already used. Use a different number.");
    return;
  }

  try {
    await createRequestType({
      name,
      requestType,
      targetGroupId: targetGroup.id,
      targetGroupName: targetGroup.name || "",
      defaultMessage: requestTypeDefaultMessageInput.value.trim(),
      sortOrder,
    });

    requestTypeNameInput.value = "";
    requestTypeKeyInput.value = "";
    requestTypeTargetGroupSelect.value = "";
    requestTypeDefaultMessageInput.value = "";
    setNextSortOrder();

    await loadRequestTypes();

    showMessage("Request type added.");
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Could not add request type.");
  }
}

async function loadRequestTypes() {
  requestTypes = await getRequestTypes();

  renderRequestTypes();
  setNextSortOrder();
}

function getNextSortOrder() {
  const activeSorts = requestTypes
    .filter((item) => item.active !== false)
    .map((item) => Number(item.sortOrder || 0))
    .filter((value) => value > 0);

  if (!activeSorts.length) {
    return 10;
  }

  return Math.max(...activeSorts) + 10;
}

function setNextSortOrder() {
  requestTypeSortOrderInput.value = String(getNextSortOrder());
}

function sortOrderExists(sortOrder, excludeId = "") {
  return requestTypes.some((item) => {
    return (
      item.active !== false &&
      item.id !== excludeId &&
      Number(item.sortOrder || 0) === Number(sortOrder)
    );
  });
}

function renderRequestTypes() {
  const active = requestTypes.filter((item) => item.active !== false);
  const inactive = requestTypes.filter((item) => item.active === false);

  renderRequestTypeTable(activeRequestTypesTableBody, active, false);
  renderRequestTypeTable(inactiveRequestTypesTableBody, inactive, true);
}

function renderRequestTypeTable(tableBody, rows, inactive) {
  if (!rows.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">No ${inactive ? "inactive" : "active"} request types.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows
    .map((requestType) => {
      return buildRequestTypeRow(requestType, inactive);
    })
    .join("");

  bindRequestTypeButtons(tableBody);
}

function buildRequestTypeRow(requestType, inactive) {
  const statusButton = inactive
    ? `
      <button
        class="small-button reactivate-request-type-button"
        data-id="${requestType.id}"
        type="button"
      >
        Reactivate
      </button>

      <button
        class="small-button secondary delete-request-type-button"
        data-id="${requestType.id}"
        type="button"
      >
        Delete
      </button>
    `
    : `
      <button
        class="small-button secondary deactivate-request-type-button"
        data-id="${requestType.id}"
        type="button"
      >
        Deactivate
      </button>
    `;

  return `
    <tr>
      <td data-label="Name">
        <input
          class="request-type-name-input"
          data-original="${escapeHtml(requestType.name || "")}"
          value="${escapeHtml(requestType.name || "")}"
          disabled
        />
      </td>

      <td data-label="Key">
        <input
          class="request-type-key-input"
          data-original="${escapeHtml(requestType.requestType || "")}"
          value="${escapeHtml(requestType.requestType || "")}"
          disabled
        />
      </td>

      <td data-label="Target Group">
        <select
          class="request-type-target-group-select"
          data-original="${escapeHtml(requestType.targetGroupId || "")}"
          disabled
        >
          ${renderTargetGroupOptions(requestType.targetGroupId)}
        </select>
      </td>

      <td data-label="Sort">
        <input
          class="request-type-sort-input"
          type="number"
          data-original="${Number(requestType.sortOrder || 0)}"
          value="${Number(requestType.sortOrder || 0)}"
          disabled
        />
      </td>

      <td data-label="Message">
        <input
          class="request-type-message-input"
          data-original="${escapeHtml(requestType.defaultMessage || "")}"
          value="${escapeHtml(requestType.defaultMessage || "")}"
          disabled
        />
      </td>

      <td data-label="Actions">
        <button
          class="small-button secondary edit-request-type-button"
          data-id="${requestType.id}"
          type="button"
        >
          Edit
        </button>

        <button
          class="small-button save-request-type-button"
          data-id="${requestType.id}"
          type="button"
          disabled
        >
          Save
        </button>

        <button
          class="small-button secondary cancel-request-type-button"
          data-id="${requestType.id}"
          type="button"
          disabled
        >
          Cancel
        </button>

        ${statusButton}
      </td>
    </tr>
  `;
}

function renderTargetGroupOptions(selectedGroupId = "") {
  return notificationGroups
    .map((group) => {
      const selected = group.id === selectedGroupId ? "selected" : "";

      return `
        <option value="${escapeHtml(group.id)}" ${selected}>
          ${escapeHtml(group.name || group.id)}
        </option>
      `;
    })
    .join("");
}

function bindRequestTypeButtons(tableBody) {
  tableBody.querySelectorAll("tr").forEach((row) => {
    bindEditRow(row);
  });

  tableBody
    .querySelectorAll(".deactivate-request-type-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await updateRequestType(button.dataset.id, {
          active: false,
        });

        await loadRequestTypes();

        showMessage("Request type deactivated.");
      });
    });

  tableBody
    .querySelectorAll(".reactivate-request-type-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await updateRequestType(button.dataset.id, {
          active: true,
        });

        await loadRequestTypes();

        showMessage("Request type reactivated.");
      });
    });

  tableBody
    .querySelectorAll(".delete-request-type-button")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = confirm("Delete this request type?");

        if (!confirmed) {
          return;
        }

        await deleteRequestType(button.dataset.id);

        await loadRequestTypes();

        showMessage("Request type deleted.");
      });
    });
}

function bindEditRow(row) {
  const inputs = [
    row.querySelector(".request-type-name-input"),
    row.querySelector(".request-type-key-input"),
    row.querySelector(".request-type-target-group-select"),
    row.querySelector(".request-type-sort-input"),
    row.querySelector(".request-type-message-input"),
  ].filter(Boolean);

  const editButton = row.querySelector(".edit-request-type-button");
  const saveButton = row.querySelector(".save-request-type-button");
  const cancelButton = row.querySelector(".cancel-request-type-button");

  if (!editButton || !saveButton || !cancelButton || !inputs.length) {
    return;
  }

  const checkChanged = () => {
    const changed = inputs.some((input) => {
      return String(input.value || "") !== String(input.dataset.original || "");
    });

    saveButton.disabled = !changed;
  };

  editButton.addEventListener("click", () => {
    inputs.forEach((input) => {
      input.disabled = false;
    });

    cancelButton.disabled = false;
    inputs[0]?.focus();
  });

  inputs.forEach((input) => {
    input.addEventListener("input", checkChanged);
    input.addEventListener("change", checkChanged);
  });

  cancelButton.addEventListener("click", () => {
    inputs.forEach((input) => {
      input.value = input.dataset.original;
      input.disabled = true;
    });

    saveButton.disabled = true;
    cancelButton.disabled = true;
  });

  saveButton.addEventListener("click", async () => {
    const targetGroupSelect = row.querySelector(
      ".request-type-target-group-select",
    );

    const targetGroup = notificationGroups.find(
      (group) => group.id === targetGroupSelect.value,
    );

    if (!targetGroup) {
      showMessage("Select target group.");
      return;
    }

    const sortOrder = Number(
      row.querySelector(".request-type-sort-input").value || 0,
    );

    if (sortOrderExists(sortOrder, saveButton.dataset.id)) {
      showMessage("That sort order is already used. Use a different number.");
      return;
    }

    await updateRequestType(saveButton.dataset.id, {
      name: row.querySelector(".request-type-name-input").value.trim(),
      requestType: row.querySelector(".request-type-key-input").value.trim(),
      targetGroupId: targetGroup.id,
      targetGroupName: targetGroup.name || "",
      sortOrder,
      defaultMessage: row
        .querySelector(".request-type-message-input")
        .value.trim(),
    });

    await loadRequestTypes();

    showMessage("Request type updated.");
  });
}

function buildRequestKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function showMessage(message) {
  requestTypesMessage.textContent = message;
}

function clearMessage() {
  requestTypesMessage.textContent = "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
