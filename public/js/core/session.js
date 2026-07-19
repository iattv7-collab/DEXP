// public/js/core/session.js
// Stores and validates the current DEXP application session.

import {
  getPermissionsForRole
} from "../config/role-permissions.js";

import {
  DEXP_APP_VERSION
} from "../config/app-version.js";

const SESSION_KEY = "dexp_session";

const SESSION_DURATION_MS =
  30 * 60 * 1000;

let currentSession = null;

export function setSession({
  user,
  profile,
  dealer,
  modules
}) {
  const role = profile?.role || "pending";

  const permissions = buildSessionPermissions({
    role,
    dealer
  });

  const loadedAt = Date.now();

  currentSession = {
    uid:
      user?.uid || null,

    companyId:
      profile?.companyId || "",

    email:
      user?.email ||
      profile?.email ||
      "",

    displayName:
      user?.displayName ||
      profile?.displayName ||
      "",

    phone:
      profile?.phone || "",

    role,

    dealerId:
      profile?.dealerId || "",

    dealerName:
      dealer?.name || "",

    modules:
      Array.isArray(modules)
        ? modules
        : [],

    // Dashboard access is controlled by admin-selected user modules.
    assignedModules:
      Array.isArray(profile?.assignedModules)
        ? profile.assignedModules
        : [],

    // Permissions are built from role defaults plus dealer-level settings.
    permissions,

    profile,
    dealer,

    // Session validation metadata.
    appVersion:
      DEXP_APP_VERSION,

    loadedAt,

    expiresAt:
      loadedAt + SESSION_DURATION_MS
  };

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(currentSession)
  );

  return currentSession;
}

function buildSessionPermissions({
  role,
  dealer
}) {
  const defaultPermissions =
    getPermissionsForRole(role);

  const permissionSettings =
    dealer?.settings?.permissions || {};

  const roleOverrides =
    permissionSettings.roleOverrides || {};

  const roleOverride =
    roleOverrides[role] || {};

  const allowedPermissions =
    Array.isArray(roleOverride.allow)
      ? roleOverride.allow
      : [];

  const deniedPermissions =
    Array.isArray(roleOverride.deny)
      ? roleOverride.deny
      : [];

  const mergedPermissions = new Set([
    ...defaultPermissions,
    ...allowedPermissions
  ]);

  deniedPermissions.forEach((permission) => {
    mergedPermissions.delete(permission);
  });

  return Array.from(mergedPermissions);
}

export function getSession() {
  if (currentSession) {
    return currentSession;
  }

  try {
    currentSession = JSON.parse(
      localStorage.getItem(SESSION_KEY) || "null"
    );
  } catch (error) {
    console.error(
      "Unable to read the stored DEXP session:",
      error
    );

    currentSession = null;
  }

  return currentSession;
}

export function getValidSession({
  uid,
  dealerId
} = {}) {
  const session = getSession();

  if (!session) {
    return null;
  }

  if (!uid || session.uid !== uid) {
    clearSession();
    return null;
  }

  if (
    session.appVersion !==
    DEXP_APP_VERSION
  ) {
    clearSession();
    return null;
  }

  const expiresAt =
    Number(session.expiresAt || 0);

  if (
    !expiresAt ||
    Date.now() >= expiresAt
  ) {
    clearSession();
    return null;
  }

  if (
    dealerId !== undefined &&
    dealerId !== null &&
    session.dealerId !== dealerId
  ) {
    return null;
  }

  return session;
}

export function clearSession() {
  currentSession = null;

  localStorage.removeItem(SESSION_KEY);
}

export function hasRole(role) {
  const session = getSession();

  return session?.role === role;
}

export function hasAnyRole(roles = []) {
  const session = getSession();

  return roles.includes(session?.role);
}

export function hasDealerModule(moduleKey) {
  const session = getSession();

  return session?.modules?.includes(moduleKey);
}

export function hasAssignedModule(moduleKey) {
  const session = getSession();

  return session?.assignedModules?.includes(moduleKey);
}

export function canAccessModule(moduleKey) {
  const session = getSession();

  if (!session) {
    return false;
  }

  const dealerHasModule =
    session.modules?.includes(moduleKey);

  if (!dealerHasModule) {
    return false;
  }

  if (
    session.role === "platform-admin" ||
    session.role === "admin"
  ) {
    return true;
  }

  return session.assignedModules?.includes(moduleKey);
}

export function hasPermission(permission) {
  const session = getSession();

  return session?.permissions?.includes(permission);
}