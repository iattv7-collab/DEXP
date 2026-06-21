// public/pages/admin/admin-users-table.js

import { ROLES } from "../../js/config/roles.js";
import { buildAdminRoleOptions } from "./admin-roles.js";

export function renderUsersTable(users, tableType) {
  if (!users.length) {
    return `
      <div class="dexp-admin-card">
        No users found.
      </div>
    `;
  }

  const rows = users.map((user) => renderUserRow(user, tableType)).join("");

  return `
    <div class="dexp-admin-card">
      <table class="dexp-admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Employee #</th>
            <th>Email</th>
            <th>Role</th>
            <th>Assigned Modules</th>
            <th>Dealer</th>
            <th>Requested</th>
            <th>Approved</th>
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

function renderUserRow(user, tableType) {
  return `
    <tr>
      <td>${user.displayName || ""}</td>
      <td>${user.companyId || ""}</td>
      <td>${user.email || ""}</td>

      <td>
        <select class="admin-role-select" data-user-id="${user.id}">
          ${renderPendingOption(user)}
          ${buildAdminRoleOptions(user.role)}
        </select>
      </td>

      <td>
        ${renderAssignedModulesSummary(user)}
      </td>

      <td>${user.dealerId || ""}</td>
      <td>${formatAdminDate(user.createdAt)}</td>
      <td>${formatAdminDate(user.approvedAt)}</td>

      <td>
        ${renderActionButton(user, tableType)}
      </td>
    </tr>
  `;
}

function renderAssignedModulesSummary(user) {
  const assignedModules = Array.isArray(user.assignedModules)
    ? user.assignedModules
    : [];

  return `
    <div
      style="
        display:flex;
        align-items:center;
        gap:10px;
        white-space:nowrap;
      "
    >
      <span>
        <strong>${assignedModules.length}</strong> Modules
      </span>

      <button
        type="button"
        class="admin-edit-modules-btn small-button"
        data-user-id="${user.id}"
      >
        Edit
      </button>
    </div>
  `;
}

function renderPendingOption(user) {
  if (user.role !== ROLES.PENDING) {
    return "";
  }

  return `
    <option value="${ROLES.PENDING}" selected>
      pending
    </option>
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

function formatAdminDate(value) {
  if (!value) {
    return "";
  }

  if (typeof value.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }

  return "";
}