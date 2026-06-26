// public/js/services/firebase/admin-functions-service.js

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

import { app } from "./firebase-app.js";

const functions = getFunctions(app);

const bootstrapAdminCallable = httpsCallable(functions, "bootstrapAdmin");

const acceptDealerAdminInviteCallable = httpsCallable(
  functions,
  "acceptDealerAdminInvite",
);

const approveUserCallable = httpsCallable(functions, "approveUser");

const setUserRoleCallable = httpsCallable(functions, "setUserRole");

const setUserActiveCallable = httpsCallable(functions, "setUserActive");

const setUserAssignedModulesCallable = httpsCallable(
  functions,
  "setUserAssignedModules",
);

const assignDealerAdminCallable = httpsCallable(functions, "assignDealerAdmin");

export async function bootstrapAdmin() {
  return bootstrapAdminCallable();
}

export async function approveUser({ uid, role }) {
  return approveUserCallable({
    uid,
    role,
  });
}

export async function setUserRole({ uid, role }) {
  return setUserRoleCallable({
    uid,
    role,
  });
}

export async function setUserActive({ uid, active }) {
  return setUserActiveCallable({
    uid,
    active,
  });
}

export async function setUserAssignedModules({ uid, assignedModules }) {
  return setUserAssignedModulesCallable({
    uid,
    assignedModules,
  });
}

export async function acceptDealerAdminInvite() {
  return acceptDealerAdminInviteCallable();
}

export async function assignDealerAdmin({ uid, dealerId, assignedModules }) {
  return assignDealerAdminCallable({
    uid,
    dealerId,
    assignedModules,
  });
}
