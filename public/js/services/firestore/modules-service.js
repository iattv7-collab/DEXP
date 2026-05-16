// public/js/services/firestore/modules-service.js

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

import {
  MODULES,
  CORE_MODULES
} from "../../config/modules.js";

const DEFAULT_ENABLED_MODULES = [
  ...CORE_MODULES,
  MODULES.SCANNER_RO,
  MODULES.MOVE_LOCATE,
  MODULES.LOCATION_SETTINGS
];

export async function getDealerModules(dealerId) {
  if (!dealerId) {
    return [];
  }

  const moduleRef = doc(db, "moduleRegistry", dealerId);

  const snapshot = await getDoc(moduleRef);

  if (snapshot.exists()) {
    const existingModules =
      snapshot.data().enabledModules || [];

    const mergedModules = Array.from(
      new Set([
        ...existingModules,
        ...DEFAULT_ENABLED_MODULES
      ])
    );

    if (mergedModules.length !== existingModules.length) {
      await updateDoc(moduleRef, {
        enabledModules: mergedModules,
        updatedAt: serverTimestamp()
      });
    }

    return mergedModules;
  }

  const newModuleRegistry = {
    dealerId,
    enabledModules: DEFAULT_ENABLED_MODULES,
    createdAt: serverTimestamp()
  };

  await setDoc(moduleRef, newModuleRegistry);

  return DEFAULT_ENABLED_MODULES;
}