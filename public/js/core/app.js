// public/js/core/app.js

import { watchAuthState } from "../services/firebase/auth-service.js";
import { LABELS } from "../config/labels.js";

import { ensureUserProfile } from "../services/firestore/users-service.js";
import { getDealer } from "../services/firestore/dealers-service.js";
import { getDealerModules } from "../services/firestore/modules-service.js";

import { setSession, clearSession } from "./session.js";

function initializeApp() {
  document.title = LABELS.appName;

  console.log(`${LABELS.appName} initialized`);
}

async function loadUserSession(user) {
  try {
    const profile = await ensureUserProfile(user);

    if (!profile?.dealerId) {
      throw new Error("Missing dealer assignment");
    }

    const dealer = await getDealer(profile.dealerId);

    if (!dealer) {
      throw new Error("Dealer not found");
    }

    const modules = await getDealerModules(profile.dealerId);

    setSession({
      user,
      profile,
      dealer,
      modules
    });

    console.log("Logged in:", profile.email);
    console.log("Role:", profile.role);
    console.log("Dealer:", profile.dealerId);
    console.log("Modules:", modules);

  } catch (error) {
    console.error("Session initialization failed:", error);

    clearSession();

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

  window.dispatchEvent(
    new CustomEvent("dexp-session-ready")
  );
});