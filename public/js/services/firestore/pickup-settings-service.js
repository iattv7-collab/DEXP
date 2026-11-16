// public/js/services/firestore/pickup-settings-service.js
// Dealer setting: one destination for customer pickup.

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";

export async function getPickupSettings() {
  const session = requireDealerSession();
  const dealerRef = doc(db, "dealers", session.dealerId);
  const snapshot = await getDoc(dealerRef);
  const dealer = snapshot.exists() ? snapshot.data() : {};
  return dealer?.settings?.pickup || {};
}

export async function updatePickupSettings(settingsPatch = {}) {
  const session = requireDealerSession();
  const current = await getPickupSettings();
  const dealerRef = doc(db, "dealers", session.dealerId);

  await setDoc(
    dealerRef,
    {
      settings: {
        pickup: {
          ...current,
          ...settingsPatch,
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ...current,
    ...settingsPatch,
  };
}

function requireDealerSession() {
  const session = getSession();
  if (!session?.dealerId) {
    throw new Error("Missing dealer session.");
  }
  return session;
}