// public/js/services/firestore/modules-service.js

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

import {
  MODULES,
  CORE_MODULES
} from "../../config/modules.js";

const DEFAULT_ENABLED_MODULES = [
  ...CORE_MODULES,
  MODULES.MOVE_LOCATE
];

export async function getDealerModules(dealerId) {
  if (!dealerId) {
    return [];
  }

  const moduleRef = doc(db, "moduleRegistry", dealerId);

  const snapshot = await getDoc(moduleRef);

  if (snapshot.exists()) {
    return snapshot.data().enabledModules || [];
  }

  const newModuleRegistry = {
    dealerId,
    enabledModules: DEFAULT_ENABLED_MODULES,
    createdAt: serverTimestamp()
  };

  await setDoc(moduleRef, newModuleRegistry);

  return DEFAULT_ENABLED_MODULES;
}