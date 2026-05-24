// public/pages/admin/admin-page.js

import { protectRoute } from "../../js/core/router.js";

import { ROLES } from "../../js/config/roles.js";

import { renderAppHeader }
  from "../../js/shared/app-header.js";

import {
  getAdminUserGroups
} from "../../js/services/firestore/users-service.js";

import {
  approveUser,
  bootstrapAdmin,
  setUserActive,
  setUserRole
} from "../../js/services/firebase/admin-functions-service.js";

protectRoute({
  allowedRoles: [
    ROLES.ADMIN,
    ROLES.MANAGER
  ]
});

renderAppHeader({
  pageTitle: "Admin"
});

const pendingUsersContainer =
  document.getElementById("pendingUsersContainer");

const allUsersContainer =
  document.getElementById("allUsersContainer");

initializeAdminPage();

async function initializeAdminPage() {
  try {
    await bootstrapAdmin();
  } catch (error) {
    console.warn("bootstrapAdmin skipped or failed:", error);
  }

  await loadAdminUsers();
}

async function loadAdminUsers() {
  pendingUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading pending users...</div>
  `;

  allUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading users...</div>
  `;

  const {
    pendingUsers,
    activeUsers,
    inactiveUsers
  } = await getAdminUserGroups();

  pendingUsersContainer.innerHTML =
    renderUsersTable(pendingUsers, "pending");

  allUsersContainer.innerHTML = `
    <h2>Active Users</h2>
    ${renderUsersTable(activeUsers, "active")}

    <h2 style="margin-top:24px;">Inactive Users</h2>
    ${renderUsersTable(inactiveUsers, "inactive")}
  `;

  attachAdminUserEvents();
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

  const rows = users.map((user) => `
    <tr>
      <td>${user.displayName || ""}</td>
      <td>${user.email || ""}</td>
      <td>
        <select class="admin-role-select" data-user-id="${user.id}">
          <option value="${ROLES.PENDING}" ${user.role === ROLES.PENDING ? "selected" : ""}>
            pending
          </option>
          ${roleOptions.replace(
            `value="${user.role}"`,
            `value="${user.role}" selected`
          )}
        </select>
      </td>
      <td>${user.dealerId || ""}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td>${formatDate(user.approvedAt)}</td>
      <td>${formatDate(user.inactiveAt)}</td>
      <td>
        ${renderActionButton(user, tableType)}
      </td>
    </tr>
  `).join("");

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
  document.querySelectorAll(
    "#allUsersContainer .admin-role-select"
  )
    .forEach((select) => {
      select.addEventListener("change", async () => {
        await setUserRole({
          uid: select.dataset.userId,
          role: select.value
        });

        await loadAdminUsers();
      });
    });

  document.querySelectorAll(".admin-approve-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const row = button.closest("tr");
        const roleSelect =
          row.querySelector(".admin-role-select");

        const selectedRole =
          roleSelect?.value || ROLES.ADVISOR;

        if (selectedRole === ROLES.PENDING) {
          alert("Select a role before approving.");
          return;
        }

        await approveUser({
          uid: button.dataset.userId,
          role: selectedRole
        });

        await loadAdminUsers();
      });
    });

  document.querySelectorAll(".admin-deactivate-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await setUserActive({
          uid: button.dataset.userId,
          active: false
        });

        await loadAdminUsers();
      });
    });

  document.querySelectorAll(".admin-reactivate-btn")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await setUserActive({
          uid: button.dataset.userId,
          active: true
        });

        await loadAdminUsers();
      });
    });
}

function formatDate(value) {
  if (!value) return "";

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return "";
}