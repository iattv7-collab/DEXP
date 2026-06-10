// public/pages/admin/admin-home-page.js

import { protectRoute } from "../../js/core/router.js";
import { ROLES } from "../../js/config/roles.js";
import { renderAppHeader } from "../../js/shared/app-header.js";

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
});

renderAppHeader({
  pageTitle: "Admin",
});