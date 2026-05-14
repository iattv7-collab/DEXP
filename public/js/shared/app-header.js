// public/js/shared/app-header.js

import { logoutUser } from "/js/services/firebase/auth-service.js";
import { clearSession, getSession } from "/js/core/session.js";

export function renderAppHeader(options = {}) {
  const {
    title = "DEXP",
    showHome = true
  } = options;

  const session = getSession();

  const header = document.createElement("header");
  header.id = "appHeader";

  header.innerHTML = `
    <div>
      <h1>${title}</h1>
      <p>${session?.displayName || session?.email || ""}</p>
    </div>

    <nav>
      ${
        showHome
          ? `<button id="homeButton" type="button">Home</button>`
          : ""
      }

      <button id="logoutButton" type="button">
        Sign Out
      </button>
    </nav>
  `;

  document.body.prepend(header);

  const homeButton = document.getElementById("homeButton");

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      window.location.href = "/pages/dashboard/index.html";
    });
  }

  const logoutButton = document.getElementById("logoutButton");

  logoutButton.addEventListener("click", async () => {
    clearSession();

    await logoutUser();

    window.location.href = "/pages/auth/login.html";
  });
}