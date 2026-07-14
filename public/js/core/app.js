// public/js/core/app.js

import { watchAuthState } from "../services/firebase/auth-service.js";
import { LABELS } from "../config/labels.js";

import { DEXP_APP_VERSION } from "../config/app-version.js";

import { startNotificationEngine } from "../modules/notifications/notification-engine.js";

import { registerCurrentDeviceForNotifications } from "../services/firebase/messaging-service.js";

import { ensureUserProfile } from "../services/firestore/users-service.js";
import { getDealer } from "../services/firestore/dealers-service.js";
import { getDealerModules } from "../services/firestore/modules-service.js";

import { setSession, clearSession } from "./session.js";

const PENDING_REGISTRATION_KEY = "dexp_pending_registration";
const PLATFORM_SELECTED_DEALER_KEY = "dexp_platform_selected_dealer";

function initializeApp() {
  document.title = LABELS.appName;
  window.DEXP_APP_VERSION = DEXP_APP_VERSION;

  console.log(`${LABELS.appName} initialized`);
  console.log("DEXP Version:", DEXP_APP_VERSION);
}

function getDealerIdFromEntryPoint() {
  const params = new URLSearchParams(window.location.search);

  const queryDealerId = String(params.get("dealerId") || "").trim();

  if (queryDealerId) {
    return queryDealerId;
  }

  const pathParts = window.location.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const dealerRouteIndex = pathParts.findIndex((part) =>
    ["d", "dealer", "dealers"].includes(part),
  );

  if (dealerRouteIndex >= 0 && pathParts[dealerRouteIndex + 1]) {
    return pathParts[dealerRouteIndex + 1];
  }

  return "";
}

function getPlatformSelectedDealerId() {
  return String(
    sessionStorage.getItem(PLATFORM_SELECTED_DEALER_KEY) || "",
  ).trim();
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

function isAuthLoginPage() {
  return window.location.pathname.includes("/pages/auth/login.html");
}

function isPlatformLoginPage() {
  return window.location.pathname.includes("/pages/auth/platform-login.html");
}

function isPlatformAdminPage() {
  return window.location.pathname.includes("/platform-admin/");
}

async function loadUserSession(user) {
  try {
    const pendingRegistration = getPendingRegistration();

    const entryDealerId =
      pendingRegistration?.dealerId || getDealerIdFromEntryPoint();

    const profile = await ensureUserProfile(user, {
      requestedDealerId: entryDealerId,
      pendingRegistration,
    });

    clearPendingRegistration();

    if (profile.role === "pending") {
      clearSession();

      alert(
        "Your account has been created and is waiting for manager approval.\n\nPlease contact your dealership administrator.",
      );

      window.location.href = entryDealerId
        ? `/pages/auth/login.html?dealerId=${encodeURIComponent(entryDealerId)}`
        : "/pages/auth/login.html";

      return;
    }

    if (profile.active === false) {
      clearSession();

      alert(
        "Your account has been disabled.\n\nPlease contact your dealership administrator.",
      );

      window.location.href = entryDealerId
        ? `/pages/auth/login.html?dealerId=${encodeURIComponent(entryDealerId)}`
        : "/pages/auth/login.html";

      return;
    }

    const isPlatformAdmin = profile.role === "platform-admin";

    if (
      isPlatformAdmin &&
      !isPlatformLoginPage() &&
      !isPlatformAdminPage() &&
      !getPlatformSelectedDealerId()
    ) {
      window.location.href = "/pages/platform-admin/platform-admin.html";
      return;
    }

    if (!isPlatformAdmin && isPlatformAdminPage()) {
      window.location.href = "/pages/auth/login.html";
      return;
    }

    if (!isPlatformAdmin && isAuthLoginPage() && !entryDealerId) {
      clearSession();

      alert("Use your dealership's DEXP entry link to sign in.");

      return;
    }

    if (
      !isPlatformAdmin &&
      entryDealerId &&
      profile.dealerId !== entryDealerId
    ) {
      clearSession();

      alert(
        "This account does not belong to this dealership.\n\nUse the correct dealership entry link.",
      );

      window.location.href = `/pages/auth/login.html?dealerId=${encodeURIComponent(
        entryDealerId,
      )}`;

      return;
    }

    const selectedPlatformDealerId = getPlatformSelectedDealerId();

    if (isPlatformAdmin && isPlatformAdminPage() && !selectedPlatformDealerId) {
      setSession({
        user,
        profile: {
          ...profile,
          dealerId: "",
        },
        dealer: null,
        modules: [],
      });

      console.log("Logged in:", profile.email);
      console.log("Role:", profile.role);
      console.log("Platform owner console active");

      return;
    }

    const effectiveDealerId = isPlatformAdmin
      ? selectedPlatformDealerId || profile.dealerId
      : profile.dealerId;

    if (!effectiveDealerId) {
      throw new Error("Missing dealer assignment.");
    }

    const dealer = await getDealer(effectiveDealerId);

    if (!dealer) {
      throw new Error("Dealer not found.");
    }

    if (dealer.active === false) {
      throw new Error("Dealer is inactive.");
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

    try {
      await registerCurrentDeviceForNotifications();
    } catch (error) {
      console.error("Device notification registration failed:", error);
    }

    if (isPlatformAdmin && !isPlatformAdminPage()) {
      const selectedDealerId = getPlatformSelectedDealerId();

      if (!selectedDealerId) {
        window.location.href = "/pages/platform-admin/platform-admin.html";
        return;
      }
    }

    if (!isPlatformAdmin && isAuthLoginPage()) {
      window.location.href = "/pages/dashboard/index.html";
      return;
    }

    await startNotificationEngine();

    console.log("Logged in:", profile.email);
    console.log("Role:", profile.role);
    console.log("Dealer:", effectiveDealerId);
    console.log("Modules:", modules);
  } catch (error) {
    console.error("Session initialization failed:", error);

    clearSession();
    clearPendingRegistration();

    if (!isAuthLoginPage() && !isPlatformLoginPage()) {
      window.location.href = isPlatformAdminPage()
        ? "/pages/auth/platform-login.html"
        : "/pages/auth/login.html";
    }
  }
}

window.addEventListener("error", (event) => {
  console.error("DEXP window error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("DEXP promise error:", event.reason);
});

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
