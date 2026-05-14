// public/js/core/router.js

import { auth } from "../services/firebase/auth-service.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const PUBLIC_ROUTES = [
  "/",
  "/index.html",
  "/pages/auth/login.html"
];

export function navigateTo(path) {
  window.location.href = path;
}

export function protectRoute(options = {}) {

  const {
    allowedRoles = [],
    allowedModules = [],
    redirectTo = "/pages/auth/login.html"
  } = options;

  onAuthStateChanged(auth, async (user) => {

    const currentPath =
      window.location.pathname;

    // Allow public pages
    if (PUBLIC_ROUTES.includes(currentPath)) {
      return;
    }

    // Not logged in
    if (!user) {
      window.location.href = redirectTo;
      return;
    }

    // Wait briefly for session creation
    await waitForSession();

    const session = JSON.parse(
      localStorage.getItem("dexp_session") || "{}"
    );

    // Still no session
    if (!session?.uid) {
      console.error("Session missing after auth");

      return;
    }

    // Role protection
    if (
      allowedRoles.length &&
      !allowedRoles.includes(session.role)
    ) {
      window.location.href =
        "/pages/dashboard/index.html";

      return;
    }

    // Module protection
    if (
      allowedModules.length &&
      !allowedModules.some((m) =>
        session.modules?.includes(m)
      )
    ) {
      window.location.href =
        "/pages/dashboard/index.html";
    }
  });
}

async function waitForSession() {

  return new Promise((resolve) => {

    let attempts = 0;

    const interval = setInterval(() => {

      const session =
        localStorage.getItem("dexp_session");

      if (session) {
        clearInterval(interval);
        resolve();
      }

      attempts++;

      if (attempts > 20) {
        clearInterval(interval);
        resolve();
      }

    }, 100);
  });
}