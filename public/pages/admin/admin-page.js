// public/pages/admin/admin-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { MODULE_CONFIG } from "../../js/config/modules.js";
import { renderAppHeader } from "../../js/shared/app-header.js";
import { getAdminUserGroups } from "../../js/services/firestore/users-service.js";
import {
  createNotificationGroup,
  getNotificationGroups,
  updateNotificationGroupMembers,
} from "../../js/services/firestore/notification-groups-service.js";

import {
  approveUser,
  bootstrapAdmin,
  setUserActive,
  setUserAssignedModules,
  setUserRole,
} from "../../js/services/firebase/admin-functions-service.js";

let currentAdminUsers = [];
let currentNotificationGroups = [];

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

renderAppHeader({
  pageTitle: "Admin",
});

const pendingUsersContainer = document.getElementById("pendingUsersContainer");
const allUsersContainer = document.getElementById("allUsersContainer");
const notificationGroupsContainer = document.getElementById(
  "notificationGroupsContainer",
);

initializeAdminPage();

async function initializeAdminPage() {
  try {
    await bootstrapAdmin();
  } catch (error) {
    console.warn("bootstrapAdmin skipped or failed:", error);
  }

  await loadAdminUsers();
  await loadNotificationGroups();
}

async function loadAdminUsers() {
  pendingUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading pending users...</div>
  `;

  allUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading users...</div>
  `;

  const { pendingUsers, activeUsers, inactiveUsers } =
    await getAdminUserGroups();

  currentAdminUsers = [...pendingUsers, ...activeUsers, ...inactiveUsers];

  pendingUsersContainer.innerHTML = renderUsersTable(pendingUsers, "pending");

  allUsersContainer.innerHTML = `
    <h2>Active Users</h2>
    ${renderUsersTable(activeUsers, "active")}

    <h2 style="margin-top:24px;">Inactive Users</h2>
    ${renderUsersTable(inactiveUsers, "inactive")}
  `;

  attachAdminUserEvents();
}

async function loadNotificationGroups() {
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
        .map(
          (group) => `
            <tr>
              <td>${group.name || ""}</td>
              <td>${group.groupType || ""}</td>
              <td>${Array.isArray(group.memberUids) ? group.memberUids.length : 0}</td>
              <td>
                <button
                  class="notification-group-members-btn"
                  data-group-id="${group.id}"
                >
                  Manage Members
                </button>
              </td>
            </tr>
          `,
        )
        .join("")
    : `
        <tr>
          <td colspan="4">No notification groups found.</td>
        </tr>
      `;

  return `
    <div class="dexp-admin-card">
      <div style="display:flex; gap:10px; margin-bottom:12px;">
        <input
          id="notificationGroupNameInput"
          type="text"
          placeholder="Group name"
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
}

function openNotificationGroupMembersModal(groupId) {
  if (!groupId) {
    alert("Notification group not found.");
    return;
  }

  window.location.href =
    `/pages/notification-groups/index.html?groupId=${encodeURIComponent(groupId)}`;
}

function renderUsersTable(users, tableType) {
  if (!users.length) {
    return `
      <div class="dexp-admin-card">
        No users found.
      </div>
    `;
  }

  const roleOptions = Object.values(ROLES)
    .filter((role) => role !== ROLES.PENDING)
    .map((role) => `<option value="${role}">${role}</option>`)
    .join("");

  const rows = users
    .map(
      (user) => `
        <tr>
          <td>${user.displayName || ""}</td>
          <td>${user.email || ""}</td>
          <td>
            <select class="admin-role-select" data-user-id="${user.id}">
              <option value="${ROLES.PENDING}" ${
                user.role === ROLES.PENDING ? "selected" : ""
              }>
                pending
              </option>
              ${roleOptions.replace(
                `value="${user.role}"`,
                `value="${user.role}" selected`,
              )}
            </select>
          </td>
          <td>${user.dealerId || ""}</td>
          <td>${formatDate(user.createdAt)}</td>
          <td>${formatDate(user.approvedAt)}</td>
          <td>${formatDate(user.inactiveAt)}</td>
          <td>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${renderActionButton(user, tableType)}

              ${
                tableType !== "pending"
                  ? `
                    <button
                      class="admin-modules-btn"
                      data-user-id="${user.id}"
                    >
                      Manage Modules
                    </button>
                  `
                  : ""
              }
            </div>
          </td>
        </tr>
      `,
    )
    .join("");

  return `
    <div class="dexp-admin-card">
      <table class="dexp-admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Dealer</th>
            <th>Requested</th>
            <th>Approved</th>
            <th>Inactive</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderActionButton(user, tableType) {
  if (tableType === "pending") {
    return `
      <button class="admin-approve-btn" data-user-id="${user.id}">
        Approve
      </button>
    `;
  }

  if (tableType === "active") {
    return `
      <button class="admin-deactivate-btn" data-user-id="${user.id}">
        Deactivate
      </button>
    `;
  }

  if (tableType === "inactive") {
    return `
      <button class="admin-reactivate-btn" data-user-id="${user.id}">
        Reactivate
      </button>
    `;
  }

  return "";
}

function attachAdminUserEvents() {
  document
    .querySelectorAll("#allUsersContainer .admin-role-select")
    .forEach((select) => {
      select.addEventListener("change", async () => {
        await setUserRole({
          uid: select.dataset.userId,
          role: select.value,
        });

        await loadAdminUsers();
      });
    });

  document.querySelectorAll(".admin-approve-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const roleSelect = row.querySelector(".admin-role-select");

      const selectedRole = roleSelect?.value || ROLES.ADVISOR;

      if (selectedRole === ROLES.PENDING) {
        alert("Select a role before approving.");
        return;
      }

      await approveUser({
        uid: button.dataset.userId,
        role: selectedRole,
      });

      await loadAdminUsers();
    });
  });

  document.querySelectorAll(".admin-deactivate-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await setUserActive({
        uid: button.dataset.userId,
        active: false,
      });

      await loadAdminUsers();
    });
  });

  document.querySelectorAll(".admin-reactivate-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await setUserActive({
        uid: button.dataset.userId,
        active: true,
      });

      await loadAdminUsers();
    });
  });

  document.querySelectorAll(".admin-modules-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openModulesModal(button.dataset.userId);
    });
  });
}

function openModulesModal(uid) {
  const user = currentAdminUsers.find((item) => item.id === uid);

  if (!user) {
    alert("User not found.");
    return;
  }

  const assignedModules = Array.isArray(user.assignedModules)
    ? user.assignedModules
    : [];

  const existingModal = document.getElementById("adminModulesModal");

  if (existingModal) {
    existingModal.remove();
  }

  const moduleCheckboxes = Object.entries(MODULE_CONFIG)
    .map(([moduleKey, config]) => {
      const checked = assignedModules.includes(moduleKey) ? "checked" : "";

      return `
        <label style="display:flex; gap:8px; align-items:center;">
          <input
            type="checkbox"
            class="admin-module-checkbox"
            value="${moduleKey}"
            ${checked}
          />
          <span>${config.label}</span>
        </label>
      `;
    })
    .join("");

  const modal = document.createElement("div");
  modal.id = "adminModulesModal";

  modal.innerHTML = `
    <div
      style="
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.45);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9999;
      "
    >
      <div
        style="
          background:white;
          width:min(700px, 94vw);
          max-height:85vh;
          overflow:auto;
          border-radius:10px;
          padding:18px;
          border:1px solid #cfd6df;
        "
      >
        <h2 style="margin-top:0;">Manage Modules</h2>

        <p style="margin-top:0;">
          ${user.displayName || user.email || uid}
        </p>

        <div
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
            gap:10px;
            margin:16px 0;
          "
        >
          ${moduleCheckboxes}
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
          "
        >
          <button id="adminModulesCancelBtn" type="button">
            Cancel
          </button>

          <button id="adminModulesSaveBtn" type="button">
            Save Modules
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document
    .getElementById("adminModulesCancelBtn")
    .addEventListener("click", () => {
      modal.remove();
    });

  document
    .getElementById("adminModulesSaveBtn")
    .addEventListener("click", async () => {
      const selectedModules = Array.from(
        modal.querySelectorAll(".admin-module-checkbox:checked"),
      ).map((checkbox) => checkbox.value);

      await setUserAssignedModules({
        uid,
        assignedModules: selectedModules,
      });

      modal.remove();

      await loadAdminUsers();
    });
}

function formatDate(value) {
  if (!value) return "";

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return "";
}
