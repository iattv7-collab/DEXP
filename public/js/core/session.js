// public/js/core/session.js

import {
  getPermissionsForRole
} from "../config/role-permissions.js";

const SESSION_KEY = "dexp_session";

let currentSession = null;

export function setSession({ user, profile, dealer, modules }) {
  const role = profile?.role || "pending";

  currentSession = {
    uid: user?.uid || null,
    email: user?.email || profile?.email || "",
    displayName: user?.displayName || profile?.displayName || "",
    role,
    dealerId: profile?.dealerId || "",
    dealerName: dealer?.name || "",
    modules: Array.isArray(modules) ? modules : [],

    // Dashboard access is controlled by admin-selected user modules.
    assignedModules: Array.isArray(profile?.assignedModules)
      ? profile.assignedModules
      : [],

    // Permissions are role-based and should control actions inside modules.
    permissions: getPermissionsForRole(role),

    profile,
    dealer
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
}

export function getSession() {
  if (currentSession) {
    return currentSession;
  }

  try {
    currentSession = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    currentSession = null;
  }

  return currentSession;
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

  if (session.role === "admin") {
    return true;
  }

  return session.assignedModules?.includes(moduleKey);
}

export function hasPermission(permission) {
  const session = getSession();

  return session?.permissions?.includes(permission);
}