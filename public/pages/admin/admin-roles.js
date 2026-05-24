// public/pages/admin/admin-roles.js
// Role helper options for the DEXP admin page.

import { ROLES } from "../../js/config/roles.js";

export const ADMIN_ASSIGNABLE_ROLES = Object.values(ROLES)
  .filter((role) => role !== ROLES.PENDING);

export function buildAdminRoleOptions(selectedRole = "") {
  return ADMIN_ASSIGNABLE_ROLES
    .map((role) => `
      <option value="${role}" ${role === selectedRole ? "selected" : ""}>
        ${role}
      </option>
    `)
    .join("");
}