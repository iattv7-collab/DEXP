// public/pages/admin/notification-groups-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

import { getAllUsers } from "../../js/services/firestore/users-service.js";

import {
  createNotificationGroup,
  deleteNotificationGroup,
  getNotificationGroups,
  updateNotificationGroup,
} from "../../js/services/firestore/notification-groups-service.js";

const GROUP_TYPES = [
  "custom",
  "advisor",
  "valet",
  "technician",
  "foreman",
  "wash",
  "qc",
  "booker",
];

function groupTypeOptions(selected = "custom") {
  const current = String(selected || "custom");
  return GROUP_TYPES.map((type) => {
    const chosen = type === current ? " selected" : "";
    return `<option value="${type}"${chosen}>${type}</option>`;
  }).join("");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let currentAdminUsers = [];
let currentNotificationGroups = [];

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

window.addEventListener("dexp-session-ready", () => {
  initializeNotificationGroupsPage();
});

async function initializeNotificationGroupsPage() {
  renderAppHeader({
    pageTitle: "Notification Groups",
  });

  currentAdminUsers = await getAllUsers();

  await loadNotificationGroups();
}

async function loadNotificationGroups() {
  const notificationGroupsContainer = document.getElementById(
    "notificationGroupsContainer",
  );

  notificationGroupsContainer.innerHTML = `
    <div class="dexp-admin-card">Loading notification groups...</div>
  `;

  const groups = await getNotificationGroups();

  currentNotificationGroups = groups;

  notificationGroupsContainer.innerHTML = renderNotificationGroups(groups);

  attachNotificationGroupEvents();
}

function renderNotificationGroups(groups = []) {
  const groupRows = groups.length
    ? groups
        .map((group) => {
          const memberUids = Array.isArray(group.memberUids)
            ? group.memberUids
            : [];

          const memberNames = memberUids.map((uid) => {
            const user = currentAdminUsers.find(
              (item) => item.uid === uid || item.id === uid,
            );

            return user?.displayName || user?.email || uid;
          });

          const membersCell = memberNames.length
            ? `
              <details>
                <summary>${memberNames.length} members</summary>

                <div style="margin-top:6px;">
                  ${memberNames
                    .map(
                      (name) => `
                        <div>${name}</div>
                      `,
                    )
                    .join("")}
                </div>
              </details>
            `
            : "0 members";

          return `
            <tr data-group-id="${group.id}">
              <td>
                <input
                  class="js-group-name"
                  value="${escapeHtml(group.name || "")}"
                  data-original="${escapeHtml(group.name || "")}"
                  disabled
                />
              </td>
              <td>
                <select class="js-group-type" data-original="${escapeHtml(group.groupType || "custom")}" disabled>
                  ${groupTypeOptions(group.groupType || "custom")}
                </select>
              </td>
              <td>${membersCell}</td>

              <td>
                <button
                  class="notification-group-edit-btn"
                  type="button"
                  data-group-id="${group.id}"
                >
                  Edit
                </button>
                <button
                  class="notification-group-save-btn"
                  type="button"
                  data-group-id="${group.id}"
                  disabled
                >
                  Save
                </button>
                <button
                  class="notification-group-cancel-btn"
                  type="button"
                  data-group-id="${group.id}"
                  disabled
                >
                  Cancel
                </button>
                <button
                  class="notification-group-members-btn"
                  data-group-id="${group.id}"
                >
                  Manage Members
                </button>

                <button
                  class="notification-group-delete-btn"
                  data-group-id="${group.id}"
                >
                  Delete
                </button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="4">No notification groups found.</td>
      </tr>
    `;

  return `
    <div class="dexp-admin-card">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
        <strong>Create New Notification Group:</strong>

          <input
          id="notificationGroupNameInput"
          type="text"
          placeholder="New group name"
        />

        <select id="notificationGroupTypeInput">
          <option value="custom">Custom</option>
          <option value="advisor">Advisor</option>
          <option value="valet">Valet</option>
          <option value="technician">Technician</option>
          <option value="foreman">Foreman</option>
          <option value="wash">Wash</option>
          <option value="qc">QC</option>
          <option value="booker">Booker</option>
        </select>

        <button id="createNotificationGroupBtn" type="button">
          Create Group
        </button>
      </div>

      <table class="dexp-admin-table">
        <thead>
          <tr>
            <th>Group Name</th>
            <th>Type</th>
            <th>Members</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${groupRows}
        </tbody>
      </table>
    </div>
  `;
}

function attachNotificationGroupEvents() {
  document
    .getElementById("createNotificationGroupBtn")
    ?.addEventListener("click", async () => {
      const nameInput = document.getElementById("notificationGroupNameInput");
      const typeInput = document.getElementById("notificationGroupTypeInput");

      const name = String(nameInput?.value || "").trim();
      const groupType = String(typeInput?.value || "custom").trim();

      if (!name) {
        alert("Enter a group name.");
        return;
      }

      await createNotificationGroup({
        name,
        groupType,
      });

      await loadNotificationGroups();
    });

  document.querySelectorAll(".notification-group-edit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      if (!row) return;
      const nameInput = row.querySelector(".js-group-name");
      const typeInput = row.querySelector(".js-group-type");
      const saveButton = row.querySelector(".notification-group-save-btn");
      const cancelButton = row.querySelector(".notification-group-cancel-btn");
      if (nameInput) nameInput.disabled = false;
      if (typeInput) typeInput.disabled = false;
      if (saveButton) saveButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      nameInput?.focus();
    });
  });

  document.querySelectorAll(".notification-group-cancel-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest("tr");
      if (!row) return;
      const nameInput = row.querySelector(".js-group-name");
      const typeInput = row.querySelector(".js-group-type");
      const saveButton = row.querySelector(".notification-group-save-btn");
      if (nameInput) {
        nameInput.value = nameInput.dataset.original || "";
        nameInput.disabled = true;
      }
      if (typeInput) {
        typeInput.value = typeInput.dataset.original || "custom";
        typeInput.disabled = true;
      }
      if (saveButton) saveButton.disabled = true;
      button.disabled = true;
    });
  });

  document.querySelectorAll(".notification-group-save-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      if (!row) return;
      const nameInput = row.querySelector(".js-group-name");
      const typeInput = row.querySelector(".js-group-type");
      const name = String(nameInput?.value || "").trim();
      const groupType = String(typeInput?.value || "custom").trim();
      if (!name) {
        alert("Enter a group name.");
        return;
      }
      button.disabled = true;
      try {
        await updateNotificationGroup(button.dataset.groupId, {
          name,
          groupType,
        });
        await loadNotificationGroups();
      } catch (error) {
        button.disabled = false;
        alert(error?.message || "Could not update group.");
      }
    });
  });

    document
    .querySelectorAll(".notification-group-members-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        openNotificationGroupMembersModal(button.dataset.groupId);
      });
    });

  document
    .querySelectorAll(".notification-group-delete-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = confirm(
          "Delete this notification group?",
        );

        if (!confirmed) {
          return;
        }

        await deleteNotificationGroup(button.dataset.groupId);

        await loadNotificationGroups();
      });
    });
}

function openNotificationGroupMembersModal(groupId) {
  if (!groupId) {
    alert("Notification group not found.");
    return;
  }

  window.location.href = `/pages/notification-groups/index.html?groupId=${encodeURIComponent(
    groupId,
  )}`;
}
