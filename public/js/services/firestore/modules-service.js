// public/js/services/firestore/modules-service.js

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

import {
  CORE_REQUIRED_MODULES
} from "../../config/modules.js";

export async function getDealerModules(dealerId) {
  if (!dealerId) {
    return [];
  }

  const moduleRef = doc(db, "moduleRegistry", dealerId);
  const snapshot = await getDoc(moduleRef);

  if (snapshot.exists()) {
    const enabledModules =
      snapshot.data().enabledModules || [];

    return Array.from(
      new Set([
        ...CORE_REQUIRED_MODULES,
        ...enabledModules
      ])
    );
  }

  const newModuleRegistry = {
    dealerId,
    enabledModules: CORE_REQUIRED_MODULES,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(moduleRef, newModuleRegistry);

  return CORE_REQUIRED_MODULES;
}

export async function updateDealerEnabledModules(
  dealerId,
  enabledModules
) {
  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const moduleRef = doc(db, "moduleRegistry", dealerId);

  await setDoc(
    moduleRef,
    {
      dealerId,
      enabledModules: Array.from(
        new Set([
          ...CORE_REQUIRED_MODULES,
          ...enabledModules
        ])
      ),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}