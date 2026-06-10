// public/pages/admin/notification-groups-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

import { getAllUsers } from "../../js/services/firestore/users-service.js";

import {
  createNotificationGroup,
  deleteNotificationGroup,
  getNotificationGroups,
} from "../../js/services/firestore/notification-groups-service.js";

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
            <tr>
              <td>${group.name || ""}</td>
              <td>${group.groupType || ""}</td>
              <td>${membersCell}</td>

              <td>
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
