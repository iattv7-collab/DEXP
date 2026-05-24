// public/js/services/firebase/admin-functions-service.js

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

import { app } from "./firebase-app.js";

const functions = getFunctions(app);

const bootstrapAdminCallable =
  httpsCallable(functions, "bootstrapAdmin");

const approveUserCallable =
  httpsCallable(functions, "approveUser");

const setUserRoleCallable =
  httpsCallable(functions, "setUserRole");

const setUserActiveCallable =
  httpsCallable(functions, "setUserActive");

export async function bootstrapAdmin() {
  return bootstrapAdminCallable();
}

export async function approveUser({
  uid,
  role
}) {
  return approveUserCallable({
    uid,
    role
  });
}

export async function setUserRole({
  uid,
  role
}) {
  return setUserRoleCallable({
    uid,
    role
  });
}

export async function setUserActive({
  uid,
  active
}) {
  return setUserActiveCallable({
    uid,
    active
  });
}