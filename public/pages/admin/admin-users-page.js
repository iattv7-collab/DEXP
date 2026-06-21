// public/pages/admin/admin-users-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { MODULE_CONFIG } from "../../js/config/modules.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

import { getAdminUserGroups } from "../../js/services/firestore/users-service.js";

import {
  approveUser,
  bootstrapAdmin,
  setUserActive,
  setUserRole,
  setUserAssignedModules,
} from "../../js/services/firebase/admin-functions-service.js";

import { renderUsersTable } from "./admin-users-table.js";

import { getSession } from "../../js/core/session.js";

let currentPendingUsers = [];
let currentActiveUsers = [];
let currentInactiveUsers = [];

const inviteUsersContainer = document.getElementById("inviteUsersContainer");

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

renderAppHeader({
  pageTitle: "Admin Users",
});

initializeAdminUsersPage();

async function initializeAdminUsersPage() {
  try {
    await bootstrapAdmin();
  } catch (error) {
    console.warn("bootstrapAdmin skipped or failed:", error);
  }

  renderInviteUsersCard();

  await loadAdminUsers();
}

async function loadAdminUsers() {
  const pendingUsersContainer = document.getElementById(
    "pendingUsersContainer",
  );

  const allUsersContainer = document.getElementById("allUsersContainer");

  pendingUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading pending users...</div>
  `;

  allUsersContainer.innerHTML = `
    <div class="dexp-admin-card">Loading users...</div>
  `;

  const { pendingUsers, activeUsers, inactiveUsers } =
    await getAdminUserGroups();

  currentPendingUsers = pendingUsers;
  currentActiveUsers = activeUsers;
  currentInactiveUsers = inactiveUsers;

  renderAdminUserSections();
}

function renderAdminUserSections() {
  const pendingUsersContainer = document.getElementById(
    "pendingUsersContainer",
  );

  const allUsersContainer = document.getElementById("allUsersContainer");

  pendingUsersContainer.innerHTML = `
    <details open class="dexp-admin-card admin-user-section">
      ${buildUserSectionSummary(
        `Pending Users (${currentPendingUsers.length})`,
        "Collapse View",
      )}

      <input
        id="pendingUsersSearchInput"
        type="search"
        placeholder="Search pending users..."
      />

      <div id="pendingUsersTableContainer"></div>
    </details>
  `;

  allUsersContainer.innerHTML = `
    <details open class="dexp-admin-card admin-user-section">
      ${buildUserSectionSummary(
        `Active Users (${currentActiveUsers.length})`,
        "Collapse View",
      )}

      <input
        id="activeUsersSearchInput"
        type="search"
        placeholder="Search active users..."
      />

      <div id="activeUsersTableContainer"></div>
    </details>

    <details class="dexp-admin-card admin-user-section" style="margin-top:18px;">
      ${buildUserSectionSummary(
        `Inactive Users (${currentInactiveUsers.length})`,
        "Expand View",
      )}

      <input
        id="inactiveUsersSearchInput"
        type="search"
        placeholder="Search inactive users..."
      />

      <div id="inactiveUsersTableContainer"></div>
    </details>
  `;

  renderUserTables();
  attachAdminUserSearchEvents();
  attachAdminUserSectionToggleLabels();
}

function buildUserSectionSummary(title, toggleText) {
  return `
    <summary
      style="
        list-style:none;
        cursor:pointer;
        font-size:18px;
        font-weight:bold;
        margin-bottom:12px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:16px;
        background:#eef4ff;
        border:1px solid #b7c7e6;
        border-radius:8px;
        padding:10px 12px;
      "
    >
      <span>${title}</span>

      <span
        class="admin-user-section-toggle"
        style="
          font-size:13px;
          background:#0b46a0;
          color:white;
          border-radius:6px;
          padding:6px 10px;
        "
      >
        ${toggleText}
      </span>
    </summary>
  `;
}

function attachAdminUserSectionToggleLabels() {
  document.querySelectorAll(".admin-user-section").forEach((section) => {
    const label = section.querySelector(".admin-user-section-toggle");

    if (!label) {
      return;
    }

    const updateLabel = () => {
      label.textContent = section.open ? "Collapse View" : "Expand View";
    };

    updateLabel();

    section.addEventListener("toggle", updateLabel);
  });
}

function renderUserTables() {
  document.getElementById("pendingUsersTableContainer").innerHTML =
    renderUsersTable(
      filterAdminUsers(
        currentPendingUsers,
        getSearchValue("pendingUsersSearchInput"),
      ),
      "pending",
    );

  document.getElementById("activeUsersTableContainer").innerHTML =
    renderUsersTable(
      filterAdminUsers(
        currentActiveUsers,
        getSearchValue("activeUsersSearchInput"),
      ),
      "active",
    );

  document.getElementById("inactiveUsersTableContainer").innerHTML =
    renderUsersTable(
      filterAdminUsers(
        currentInactiveUsers,
        getSearchValue("inactiveUsersSearchInput"),
      ),
      "inactive",
    );

  attachAdminUserEvents();
}

function attachAdminUserSearchEvents() {
  [
    "pendingUsersSearchInput",
    "activeUsersSearchInput",
    "inactiveUsersSearchInput",
  ].forEach((inputId) => {
    document.getElementById(inputId)?.addEventListener("input", () => {
      renderUserTables();
    });
  });
}

function getSearchValue(inputId) {
  return String(document.getElementById(inputId)?.value || "")
    .trim()
    .toLowerCase();
}

function filterAdminUsers(users = [], search = "") {
  if (!search) {
    return users;
  }

  return users.filter((user) => {
    const text = [
      user.displayName,
      user.email,
      user.phone,
      user.companyId,
      user.role,
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search);
  });
}

function renderInviteUsersCard() {
  const origin = window.location.origin;

  const session = getSession();

  const dealerId = session?.dealerId || "";

  const dealerName = session?.dealerName || dealerId;

  const inviteLink = `${origin}/pages/auth/login.html?dealerId=${encodeURIComponent(
    dealerId,
  )}`;

  inviteUsersContainer.innerHTML = `
    <div class="dexp-admin-card">

      <h2>Invite User</h2>

      <p>
        Invite employees to join
        <strong>${dealerName}</strong>
      </p>

      <input
        id="inviteLinkInput"
        type="text"
        readonly
        value="${inviteLink}"
        style="width:100%;"
      />

      <div
        style="
          display:flex;
          gap:10px;
          margin-top:12px;
          flex-wrap:wrap;
        "
      >
        <button id="copyInviteLinkBtn">
          Copy Invite Link
        </button>

        <button id="emailInviteBtn">
          Email Invite
        </button>

        <button id="textInviteBtn">
          Text Invite
        </button>
      </div>

    </div>
  `;

  attachInviteEvents(inviteLink);
}

function attachInviteEvents(inviteLink) {
  document
    .getElementById("copyInviteLinkBtn")
    ?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(inviteLink);

      alert("Invite link copied.");
    });

  document.getElementById("emailInviteBtn")?.addEventListener("click", () => {
    window.location.href = `mailto:?subject=DEXP Invitation&body=${encodeURIComponent(
      inviteLink,
    )}`;
  });

  document.getElementById("textInviteBtn")?.addEventListener("click", () => {
    window.location.href = `sms:?body=${encodeURIComponent(inviteLink)}`;
  });
}

function attachAdminUserEvents() {
  document.querySelectorAll(".admin-edit-modules-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const user = findAdminUserById(button.dataset.userId);

      if (!user) {
        alert("User not found.");
        return;
      }

      openUserModulesModal(user);
    });
  });

  document.querySelectorAll(".admin-role-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const row = select.closest("tr");
      const approveButton = row?.querySelector(".admin-approve-btn");

      if (approveButton) {
        return;
      }

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
      const user = findAdminUserById(button.dataset.userId);

      if (selectedRole === ROLES.PENDING) {
        alert("Select a role before approving.");
        return;
      }

      if (!user?.assignedModules?.length) {
        alert("Assign at least one module before approving.");
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
}

function findAdminUserById(userId) {
  return [
    ...currentPendingUsers,
    ...currentActiveUsers,
    ...currentInactiveUsers,
  ].find((user) => user.id === userId);
}

function openUserModulesModal(user) {
  const existingModal = document.getElementById("adminUserModulesModal");

  if (existingModal) {
    existingModal.remove();
  }

  const originalModules = normalizeModuleList(user.assignedModules);

  const modal = document.createElement("div");
  modal.id = "adminUserModulesModal";

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
        padding:18px;
      "
    >
      <div
        style="
          background:white;
          width:min(520px,96vw);
          max-height:90vh;
          overflow:auto;
          border-radius:10px;
          padding:22px;
          border:1px solid #cfd6df;
          box-shadow:0 10px 30px rgba(0,0,0,.2);
        "
      >
        <h2 style="margin-top:0;">
          Edit Modules
        </h2>

        <p>
          <strong>${escapeAdminHtml(user.displayName || user.email || "User")}</strong>
        </p>

        <div
          id="adminModulesCheckboxList"
          style="
            display:grid;
            grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));
            gap:8px 14px;
            margin-top:14px;
          "
        >
          ${renderModuleCheckboxes(originalModules)}
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            margin-top:20px;
          "
        >
          <button id="cancelModulesBtn" type="button">
            Cancel
          </button>

          <button
            id="saveModulesBtn"
            type="button"
            disabled
            style="opacity:.5; cursor:not-allowed;"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const saveButton = document.getElementById("saveModulesBtn");

  const updateSaveState = () => {
    const selectedModules = getSelectedModalModules();

    const changed =
      JSON.stringify(selectedModules) !== JSON.stringify(originalModules);

    saveButton.disabled = !changed;
    saveButton.style.opacity = changed ? "1" : ".5";
    saveButton.style.cursor = changed ? "pointer" : "not-allowed";
  };

  modal.querySelectorAll(".admin-modal-module-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", updateSaveState);
  });

  document.getElementById("cancelModulesBtn")?.addEventListener("click", () => {
    modal.remove();
  });

  saveButton?.addEventListener("click", async () => {
    if (saveButton.disabled) {
      return;
    }

    const assignedModules = getSelectedModalModules();

    await setUserAssignedModules({
      uid: user.id,
      assignedModules,
    });

    modal.remove();

    await loadAdminUsers();
  });
}

function renderModuleCheckboxes(assignedModules = []) {
  return Object.entries(MODULE_CONFIG)
    .map(([moduleKey, config]) => {
      const checked = assignedModules.includes(moduleKey) ? "checked" : "";

      return `
        <label style="display:flex; gap:8px; align-items:center;">
          <input
            type="checkbox"
            class="admin-modal-module-checkbox"
            value="${moduleKey}"
            ${checked}
          />

          <span>${escapeAdminHtml(config.label || moduleKey)}</span>
        </label>
      `;
    })
    .join("");
}

function getSelectedModalModules() {
  return normalizeModuleList(
    Array.from(
      document.querySelectorAll(".admin-modal-module-checkbox:checked"),
    ).map((checkbox) => checkbox.value),
  );
}

function normalizeModuleList(modules = []) {
  return Array.from(new Set(Array.isArray(modules) ? modules : [])).sort();
}

function escapeAdminHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
