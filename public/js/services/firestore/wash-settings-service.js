// public/js/services/firestore/wash-settings-service.js

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

export const DEFAULT_WASH_SETTINGS = {
  washDurationMin: 15,
  bufferMin: 0,

  autoStart: true,
  isOpen: true,

  mfBays: 2,
  satBays: 1,
  sunBays: 0,

  mfOpen: "07:30",
  mfClose: "19:00",

  satOpen: "08:00",
  satClose: "15:00",

  sunOpen: "00:00",
  sunClose: "00:00"
};

export async function getWashSettings() {
  const session = requireDealerSession();

  const dealerRef = doc(db, "dealers", session.dealerId);

  const snapshot = await getDoc(dealerRef);

  const dealer = snapshot.exists() ? snapshot.data() : {};

  return {
    ...DEFAULT_WASH_SETTINGS,
    ...(dealer?.settings?.wash || {})
  };
}

export async function updateWashSettings(settingsPatch = {}) {
  const session = requireDealerSession();

  const currentSettings = await getWashSettings();

  const dealerRef = doc(db, "dealers", session.dealerId);

  await setDoc(
    dealerRef,
    {
      settings: {
        wash: {
          ...currentSettings,
          ...settingsPatch
        }
      },

      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return {
    ...currentSettings,
    ...settingsPatch
  };
}

export async function setWashOpen(isOpen) {
  return updateWashSettings({
    isOpen: Boolean(isOpen)
  });
}

function requireDealerSession() {
  const session = getSession();

  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }

  return session;
}