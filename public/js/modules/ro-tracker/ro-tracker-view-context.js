// public/js/modules/ro-tracker/ro-tracker-view-context.js
// Shared selected RO Tracker owner context for RO Tracker, Archive, and Follow Up.

import { getSession } from "/js/core/session.js";

const STORAGE_KEY = "dexp_ro_tracker_view_owner";

export function setROTrackerViewOwner(owner = {}) {
  const session = getSession();

  if (!session?.uid) {
    return;
  }

  const viewOwner = {
    advisorId: owner.advisorId || session.uid,
    advisorName: owner.advisorName || session.displayName || "",
    isSharedView: Boolean(owner.isSharedView),
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(viewOwner));
}

export function clearROTrackerViewOwner() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getROTrackerViewOwner() {
  const session = getSession();

  if (!session?.uid) {
    return null;
  }

  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");

    if (stored?.advisorId) {
      return stored;
    }
  } catch {
    // ignore bad session storage
  }

  return {
    advisorId: session.uid,
    advisorName: session.displayName || "",
    isSharedView: false,
  };
}