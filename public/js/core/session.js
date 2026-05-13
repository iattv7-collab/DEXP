// public/js/core/session.js

let currentUser = null;
let currentProfile = null;
let currentDealer = null;
let enabledModules = [];

export function setSession({ user, profile, dealer, modules }) {
  currentUser = user || null;
  currentProfile = profile || null;
  currentDealer = dealer || null;
  enabledModules = modules || [];
}

export function getSession() {
  return {
    user: currentUser,
    profile: currentProfile,
    dealer: currentDealer,
    modules: enabledModules
  };
}

export function clearSession() {
  currentUser = null;
  currentProfile = null;
  currentDealer = null;
  enabledModules = [];
}