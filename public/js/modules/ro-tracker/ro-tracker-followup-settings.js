// public/js/modules/ro-tracker/ro-tracker-followup-settings.js

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

const STORAGE_KEY = "dexp_ro_tracker_followup_settings";

export function getDefaultSettings() {
  return {
    followUpDelayDays: 3,
    followUpTime: "10:00",
    followUpDay2: 0,
    followUpTime2: "14:00",
    smsTemplate:
      "Hello {firstName}, just following up regarding your recent service visit for RO {ro}. Please let us know if you need anything.",
  };
}

export function loadROTrackerFollowupSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return getDefaultSettings();
    }

    return {
      ...getDefaultSettings(),
      ...JSON.parse(raw),
    };
  } catch {
    return getDefaultSettings();
  }
}

export function saveROTrackerFollowupSettings(settings = {}) {
  const merged = {
    ...getDefaultSettings(),
    ...settings,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

  return merged;
}

export async function loadDealerFollowupSettings() {
  const local = loadROTrackerFollowupSettings();
  const session = getSession();

  if (!session?.dealerId) {
    return local;
  }

  try {
    const snap = await getDoc(doc(db, "dealers", session.dealerId));
    const remote = snap.exists()
      ? snap.data()?.settings?.followup || {}
      : {};

    const merged = {
      ...getDefaultSettings(),
      ...local,
      ...remote,
    };

    saveROTrackerFollowupSettings(merged);

    return merged;
  } catch {
    return local;
  }
}

export async function saveDealerFollowupSettings(settings = {}) {
  const merged = saveROTrackerFollowupSettings(settings);
  const session = getSession();

  if (!session?.dealerId) {
    return merged;
  }

  await updateDoc(doc(db, "dealers", session.dealerId), {
    "settings.followup": {
      followUpDelayDays: Number(merged.followUpDelayDays ?? 3),
      followUpTime: String(merged.followUpTime || "10:00"),
      followUpDay2: Number(merged.followUpDay2 ?? 0),
      followUpTime2: String(merged.followUpTime2 || "14:00"),
      smsTemplate: String(merged.smsTemplate || ""),
    },
    updatedAt: serverTimestamp(),
  });

  return merged;
}