// public/js/core/router.js

import { db } from "/js/services/firebase/firestore.js";
import {
  collection,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const PUBLIC_ROUTES = [
  "/",
  "/index.html",
  "/pages/auth/login.html",
  "/pages/auth/platform-login.html",
];

export function navigateTo(path) {
  window.location.href = path;
}

export function protectRoute(options = {}) {
  const {
    allowedRoles = [],
    allowedModules = [],
    redirectTo = "/pages/auth/login.html",
  } = options;

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) {
      return;
    }

    guardProtectedPage(redirectTo);
  });

  window.addEventListener("dexp-session-ready", async () => {
    const currentPath = window.location.pathname;

    if (PUBLIC_ROUTES.includes(currentPath)) {
      return;
    }

    const session = getStoredSession();

    if (!session?.uid) {
      redirectToLogin(redirectTo);
      return;
    }

    const sentToMove = await sendOwnerToOpenMove(session);

    if (sentToMove) {
      return;
    }

    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
      window.location.replace("/pages/dashboard/index.html");
      return;
    }

    if (
      allowedModules.length &&
      !allowedModules.some((moduleKey) =>
        session.modules?.includes(moduleKey),
      )
    ) {
      window.location.replace("/pages/dashboard/index.html");
    }
  });
}

function guardProtectedPage(redirectTo) {
  const currentPath = window.location.pathname;

  if (PUBLIC_ROUTES.includes(currentPath)) {
    return;
  }

  const session = getStoredSession();

  if (!session?.uid) {
    redirectToLogin(redirectTo);
  }
}

function redirectToLogin(redirectTo = "/pages/auth/login.html") {
  const currentPath = window.location.pathname;

  const isPlatformAdminRoute =
    currentPath.includes("/pages/platform-admin/");

  if (isPlatformAdminRoute) {
    window.location.replace("/pages/auth/platform-login.html");
    return;
  }

  const lastDealerId =
    sessionStorage.getItem("dexp_last_dealer_id") ||
    localStorage.getItem("dexp_last_dealer_id") ||
    "";

  if (lastDealerId && redirectTo === "/pages/auth/login.html") {
    window.location.replace(
      `/pages/auth/login.html?dealerId=${encodeURIComponent(lastDealerId)}`,
    );

    return;
  }

  window.location.replace(redirectTo);
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem("dexp_session") || "null");
  } catch (error) {
    return null;
  }
}

async function sendOwnerToOpenMove(session) {
  const path = window.location.pathname;

  if (path.includes("/pages/move-locate/")) {
    return false;
  }

  if (!session?.uid || !session?.dealerId) {
    return false;
  }

  const snap = await getDocs(
    query(
      collection(db, "ros"),
      where("moveStartedByUid", "==", session.uid),
    ),
  );

  const openMove = snap.docs
    .map((item) => item.data() || {})
    .find((ro) => {
      return (
        ro.dealerId === session.dealerId &&
        String(ro.moveStatus || "") === "moving"
      );
    });

  if (!openMove) {
    return false;
  }

  const tag = String(openMove.tagNumber || openMove.tag || "").trim();

  window.location.replace(
    `/pages/move-locate/move-locate.html?tagNumber=${encodeURIComponent(tag)}`,
  );

  return true;
}