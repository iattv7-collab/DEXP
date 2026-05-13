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

watchAuthState(async (user) => {
  if (user) {
    const profile = await ensureUserProfile(user);

    const dealer = await getDealer(profile.dealerId);

    const modules = await getDealerModules(profile.dealerId);

    setSession({
      user,
      profile,
      dealer,
      modules
    });

    console.log("Logged in:", profile.email);
    console.log("User role:", profile.role);
    console.log("Dealer:", profile.dealerId);
    console.log("Enabled modules:", modules);
  } else {
    clearSession();

    console.log("No active session");
  }

  initializeApp();
});