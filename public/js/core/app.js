// public/js/core/app.js

import { watchAuthState } from "../services/firebase/auth-service.js";

function initializeApp() {
  console.log("DEXP initialized");
}

watchAuthState((user) => {
  if (user) {
    console.log("Logged in:", user.email);
  } else {
    console.log("No active session");
  }

  initializeApp();
});