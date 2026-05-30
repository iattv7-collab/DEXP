// public/pages/notification-groups/notification-groups-page.js

import { protectRoute } from "/js/core/router.js";
import { ROLES } from "/js/config/roles.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  getAllUsers,
} from "/js/services/firestore/users-service.js";

import {
  getNotificationGroup,
  updateNotificationGroupMembers,
} from "/js/services/firestore/notification-groups-service.js";

protectRoute({
  allowedRoles: [
    ROLES.PLATFORM_ADMIN,
    ROLES.ADMIN,
    ROLES.MANAGER,
  ],
});

renderAppHeader({
  pageTitle: "Notification Group Members",
});

const titleEl = document.getElementById(
  "notificationGroupTitle",
);

const containerEl = document.getElementById(
  "notificationGroupMembersContainer",
);

const params = new URLSearchParams(
  window.location.search,
);

const groupId = params.get("groupId");

let currentGroup = null;
let eligibleUsers = [];
let originalMemberUids = [];

initialize();

async function initialize() {
  try {
    if (!groupId) {
      titleEl.textContent = "Notification Group";

      containerEl.innerHTML = `
        <div class="dexp-admin-card">
          Missing notification group ID.
        </div>
      `;

      return;
    }

    currentGroup = await getNotificationGroup(groupId);

    originalMemberUids = Array.isArray(currentGroup.memberUids)
      ? [...currentGroup.memberUids]
      : [];

    const allUsers = await getAllUsers();

    eligibleUsers = getEligibleUsersForGroup(
      allUsers,
      currentGroup,
    );

    renderPage();
  } catch (error) {
    console.error(error);

    titleEl.textContent = "Notification Group";

    containerEl.innerHTML = `
      <div class="dexp-admin-card">
        Failed to load notification group.
      </div>
    `;
  }
}

function renderPage() {
  titleEl.textContent =
    currentGroup.name || "Notification Group";

  const memberUids = Array.isArray(currentGroup.memberUids)
    ? currentGroup.memberUids
    : [];

  const userRows = eligibleUsers.length
    ? eligibleUsers
        .map((user) => {
          const checked = memberUids.includes(user.uid)
            ? "checked"
            : "";

          return `
            <label style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
              <input
                type="checkbox"
                class="notification-member-checkbox"
                value="${user.uid}"
                ${checked}
              />

              <span>
                ${user.displayName || user.email || user.uid}
                (${user.role || "no role"})
              </span>
            </label>
          `;
        })
        .join("")
    : `
        <p>No eligible users found for this group type.</p>
      `;

  containerEl.innerHTML = `
    <div class="dexp-admin-card">

      <p>
        <strong>Group Name:</strong>
        ${currentGroup.name || ""}
      </p>

      <p>
        <strong>Group Type:</strong>
        ${currentGroup.groupType || ""}
      </p>

      <p>
        <strong>Assigned Members:</strong>
        ${memberUids.length}
      </p>

      <hr />

      <h3>Available Members</h3>

      <div>
        ${userRows}
      </div>

      <button
        id="saveNotificationGroupMembersBtn"
        type="button"
      >
        Save Members
      </button>

      <button
        id="backToAdminBtn"
        type="button"
      >
        Back to Admin
      </button>

    </div>
  `;

  attachEvents();
  updateSaveButtonState();
}

function attachEvents() {
  document
    .querySelectorAll(".notification-member-checkbox")
    .forEach((checkbox) => {
      checkbox.addEventListener(
        "change",
        updateSaveButtonState,
      );
    });

  document
    .getElementById("saveNotificationGroupMembersBtn")
    ?.addEventListener("click", async () => {
      if (!hasUnsavedChanges()) {
        return;
      }

      const selectedUids = getSelectedMemberUids();

      await updateNotificationGroupMembers(
        currentGroup.id,
        selectedUids,
      );

      currentGroup = {
        ...currentGroup,
        memberUids: selectedUids,
      };

      originalMemberUids = [...selectedUids];

      renderPage();

      alert("Members saved.");
    });

  document
    .getElementById("backToAdminBtn")
    ?.addEventListener("click", () => {
      window.location.href = "/pages/admin/admin.html";
    });
}

function getSelectedMemberUids() {
  return Array.from(
    document.querySelectorAll(
      ".notification-member-checkbox:checked",
    ),
  ).map((checkbox) => checkbox.value);
}

function hasUnsavedChanges() {
  const selected = getSelectedMemberUids().sort();
  const original = [...originalMemberUids].sort();

  return (
    JSON.stringify(selected) !==
    JSON.stringify(original)
  );
}

function updateSaveButtonState() {
  const saveButton = document.getElementById(
    "saveNotificationGroupMembersBtn",
  );

  if (!saveButton) {
    return;
  }

  const hasChanges = hasUnsavedChanges();

  saveButton.disabled = !hasChanges;

  saveButton.style.opacity = hasChanges
    ? "1"
    : "0.45";

  saveButton.style.cursor = hasChanges
    ? "pointer"
    : "not-allowed";
}

function getEligibleUsersForGroup(users = [], group = {}) {
  const groupType = String(group.groupType || "custom").trim();

  const activeUsers = users.filter((user) => {
    return user.active !== false;
  });

  if (groupType === "custom") {
    return activeUsers;
  }

  return activeUsers.filter((user) => {
    return user.role === groupType;
  });
}