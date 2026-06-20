// public/pages/admin/admin-users-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
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

const inviteUsersContainer =
  document.getElementById(
    "inviteUsersContainer",
  );

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

const dealerId =
  session?.dealerId || "";

const dealerName =
  session?.dealerName || dealerId;

const inviteLink =
  `${origin}/pages/auth/login.html?dealerId=${encodeURIComponent(
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
      await navigator.clipboard.writeText(
        inviteLink,
      );

      alert("Invite link copied.");
    });

  document
    .getElementById("emailInviteBtn")
    ?.addEventListener("click", () => {
      window.location.href =
        `mailto:?subject=DEXP Invitation&body=${encodeURIComponent(
          inviteLink,
        )}`;
    });

  document
    .getElementById("textInviteBtn")
    ?.addEventListener("click", () => {
      window.location.href =
        `sms:?body=${encodeURIComponent(
          inviteLink,
        )}`;
    });
}

function attachAdminUserEvents() {
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

  document.querySelectorAll(".admin-save-modules-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");

      const assignedModules = Array.from(
        row.querySelectorAll(".admin-module-checkbox:checked"),
      ).map((checkbox) => checkbox.value);

      await setUserAssignedModules({
        uid: button.dataset.userId,
        assignedModules,
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

      const assignedModules = Array.from(
        row.querySelectorAll(".admin-module-checkbox:checked"),
      ).map((checkbox) => checkbox.value);

      if (!assignedModules.length) {
        alert("Assign at least one module before approving.");
        return;
      }

      await setUserAssignedModules({
        uid: button.dataset.userId,
        assignedModules,
      });

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