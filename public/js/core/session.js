// public/js/core/session.js

const SESSION_KEY = "dexp_session";

let currentSession = null;

export function setSession({ user, profile, dealer, modules }) {
  currentSession = {
    uid: user?.uid || null,
    email: user?.email || profile?.email || "",
    displayName: user?.displayName || profile?.displayName || "",
    role: profile?.role || "pending",
    dealerId: profile?.dealerId || "",
    dealerName: dealer?.name || "",
    modules: Array.isArray(modules) ? modules : [],
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

export function hasModule(moduleKey) {
  const session = getSession();
  return session?.modules?.includes(moduleKey);
}