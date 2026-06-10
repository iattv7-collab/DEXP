// public/pages/admin/roles-page.js

import { getSession } from "../../js/core/session.js";
import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { ROLE_PERMISSIONS } from "../../js/config/role-permissions.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

import {
  getDealer,
  updateDealerRolePermissionOverride,
} from "../../js/services/firestore/dealers-service.js";

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

window.addEventListener("dexp-session-ready", () => {
  initializeRolesPage();
});

async function initializeRolesPage() {
  renderAppHeader({
    pageTitle: "Role Permissions",
  });

  await loadRolePermissions();
}

async function loadRolePermissions() {
  const rolePermissionsContainer = document.getElementById(
    "rolePermissionsContainer",
  );

  const session = getSession();

  if (!session?.dealerId) {
    rolePermissionsContainer.innerHTML = `
      <div class="dexp-admin-card">Dealer session not ready.</div>
    `;
    return;
  }

  const dealer = await getDealer(session.dealerId);

  rolePermissionsContainer.innerHTML = renderRolePermissions();

  attachRolePermissionEvents(dealer);
}

function renderRolePermissions() {
  const editableRoles = [
    ROLES.MANAGER,
    ROLES.ADVISOR,
    ROLES.FOREMAN,
    ROLES.TECH,
    ROLES.WASH,
    ROLES.VALET,
    ROLES.QC,
    ROLES.BOOKER,
    ROLES.STAFF,
  ];

  return `
    <div class="dexp-admin-card">
      <div style="margin-bottom:12px;">
        <label>
          Role
          <select id="rolePermissionRoleSelect">
            ${editableRoles
              .map(
                (role) => `
                  <option value="${role}">
                    ${role}
                  </option>
                `,
              )
              .join("")}
          </select>
        </label>
      </div>

      <div id="rolePermissionEditor"></div>
    </div>
  `;
}

function attachRolePermissionEvents(dealer) {
  const roleSelect = document.getElementById("rolePermissionRoleSelect");

  if (!roleSelect) {
    return;
  }

  const roleActionOptions = [
    "moveLocate.move",
    "moveLocate.request",

    "wash.send",
    "wash.start",
    "wash.complete",
    "wash.remove",
    "wash.rewash.request",
    "wash.needBy.set",
    "wash.waiter.set",

    "booking.cp.mark",
    "booking.cp.clear",
    "booking.wty.mark",
    "booking.wty.clear",

    "qc.request",
    "qc.noQc",
    "qc.start",
    "qc.release",
    "qc.complete",
    "qc.reopen",

    "pickup.request",
    "pickup.claim",
    "pickup.complete",

    "roTracker.edit",
  ];

  const renderEditor = (role) => {
    const roleOverrides = dealer?.settings?.permissions?.roleOverrides || {};
    const override = roleOverrides[role] || {};
    const defaults = ROLE_PERMISSIONS[role] || [];

    const allow = Array.isArray(override.allow) ? override.allow : [];
    const deny = Array.isArray(override.deny) ? override.deny : [];

    const effectiveSet = new Set([...defaults, ...allow]);

    deny.forEach((permission) => {
      effectiveSet.delete(permission);
    });

    const editor = document.getElementById("rolePermissionEditor");

    editor.innerHTML = `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
          gap:6px;
          margin-bottom:16px;
        "
      >
        ${roleActionOptions
          .map(
            (permission) => `
              <label>
                <input
                  type="checkbox"
                  class="role-permission-checkbox"
                  value="${permission}"
                  ${effectiveSet.has(permission) ? "checked" : ""}
                />

                ${permission}
              </label>
            `,
          )
          .join("")}
      </div>

      <button id="saveRolePermissionsBtn" disabled>
        Save
      </button>
    `;

    const saveButton = document.getElementById("saveRolePermissionsBtn");
    const checkboxes = editor.querySelectorAll(".role-permission-checkbox");

    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        saveButton.disabled = false;
      });
    });

    saveButton.addEventListener("click", async () => {
      const checkedPermissions = Array.from(checkboxes)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);

      const allow = checkedPermissions.filter(
        (permission) => !defaults.includes(permission),
      );

      const deny = defaults.filter(
        (permission) => !checkedPermissions.includes(permission),
      );

      const session = getSession();

      await updateDealerRolePermissionOverride({
        dealerId: session.dealerId,
        role,
        allow,
        deny,
      });

      saveButton.disabled = true;

      await loadRolePermissions();
    });
  };

  renderEditor(roleSelect.value);

  roleSelect.addEventListener("change", () => {
    renderEditor(roleSelect.value);
  });
}