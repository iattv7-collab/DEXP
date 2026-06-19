// public/js/core/app.js

import { watchAuthState } from "../services/firebase/auth-service.js";
import { LABELS } from "../config/labels.js";

import { startNotificationEngine } from "../modules/notifications/notification-engine.js";

import { ensureUserProfile } from "../services/firestore/users-service.js";
import { getDealer } from "../services/firestore/dealers-service.js";
import { getDealerModules } from "../services/firestore/modules-service.js";

import { setSession, clearSession } from "./session.js";

const PENDING_REGISTRATION_KEY = "dexp_pending_registration";

function initializeApp() {
  document.title = LABELS.appName;

  console.log(`${LABELS.appName} initialized`);
}

function getPlatformSelectedDealerId() {
  return String(
    sessionStorage.getItem("dexp_platform_selected_dealer") || "",
  ).trim();
}

function getDealerIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("dealerId") || "").trim();
}

function getPendingRegistration() {
  try {
    return JSON.parse(
      sessionStorage.getItem(PENDING_REGISTRATION_KEY) || "null",
    );
  } catch (error) {
    return null;
  }
}

function clearPendingRegistration() {
  sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
}

async function loadUserSession(user) {
  try {
    const pendingRegistration = getPendingRegistration();

    const requestedDealerId =
      pendingRegistration?.dealerId || getDealerIdFromUrl();

    const profile = await ensureUserProfile(user, {
      requestedDealerId,
      pendingRegistration,
    });

    clearPendingRegistration();

    if (profile.role === "pending") {
      clearSession();

      alert(
        "Your account has been created and is waiting for manager approval.\n\nPlease contact your dealership administrator.",
      );

      window.location.href = "/pages/auth/login.html";

      return;
    }

    if (profile.active === false) {
      clearSession();

      alert(
        "Your account has been disabled.\n\nPlease contact your dealership administrator.",
      );

      window.location.href = "/pages/auth/login.html";

      return;
    }

    const selectedDealerId =
      getDealerIdFromUrl() || getPlatformSelectedDealerId();

    if (profile.role === "platform-admin" && getDealerIdFromUrl()) {
      sessionStorage.setItem(
        "dexp_platform_selected_dealer",
        getDealerIdFromUrl(),
      );
    }

    const effectiveDealerId =
      profile.role === "platform-admin" && selectedDealerId
        ? selectedDealerId
        : profile.dealerId;

    if (!effectiveDealerId) {
      throw new Error("Missing dealer assignment");
    }

    const dealer = await getDealer(effectiveDealerId);

    if (!dealer) {
      throw new Error("Dealer not found");
    }

    const modules = await getDealerModules(effectiveDealerId);

    setSession({
      user,
      profile: {
        ...profile,
        dealerId: effectiveDealerId,
      },
      dealer,
      modules,
    });

    const currentPath = window.location.pathname;

    const isPlatformAdmin = profile.role === "platform-admin";

    const isPlatformAdminPage = currentPath.includes("/platform-admin/");

    const isDealerWorkspace =
      profile.role === "platform-admin" &&
      selectedDealerId &&
      !isPlatformAdminPage;

    if (isPlatformAdmin && !isPlatformAdminPage && !isDealerWorkspace) {
      window.location.href = "/pages/platform-admin/platform-admin.html";

      return;
    }

    if (
      profile.role !== "platform-admin" &&
      currentPath.includes("/platform-admin/")
    ) {
      window.location.href = "/pages/dashboard/index.html";

      return;
    }

    await startNotificationEngine();

    console.log("Logged in:", profile.email);
    console.log("Role:", profile.role);
    console.log("Dealer:", profile.dealerId);
    console.log("Modules:", modules);
  } catch (error) {
    console.error("Session initialization failed:", error);

    clearSession();
    clearPendingRegistration();

    window.location.href = "/pages/auth/login.html";
  }
}

watchAuthState(async (user) => {
  if (user) {
    await loadUserSession(user);
  } else {
    clearSession();

    console.log("No active session");
  }

  initializeApp();

  window.dispatchEvent(new CustomEvent("dexp-session-ready"));
});
