// public/js/core/app.js

import { watchAuthState } from "../services/firebase/auth-service.js";
import { LABELS } from "../config/labels.js";

function initializeApp() {
  document.title = LABELS.appName;

  console.log(`${LABELS.appName} initialized`);
}

watchAuthState((user) => {
  if (user) {
    console.log("Logged in:", user.email);
  } else {
    console.log("No active session");
  }

  initializeApp();
});