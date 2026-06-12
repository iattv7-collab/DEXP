// public/js/shared/app-header.js

import { logoutUser } from "/js/services/firebase/auth-service.js";
import { clearSession, getSession } from "/js/core/session.js";

export function renderAppHeader(options = {}) {
  const {
    showHome = true,
    platformMode = false,
  } = options;

  const session = getSession();

  const dealerName = platformMode
    ? "DEXP Platform"
    : session?.dealerName ||
      session?.dealer?.name ||
      session?.dealerId ||
      "Dealer";

  const userName = session?.displayName || session?.email || "";

  const roleMap = {
    advisor: "Advisor",
    admin: "Admin",
    "platform-admin": "Platform Admin",
    manager: "Manager",
    foreman: "Foreman",
    tech: "Technician",
    wash: "Wash",
    valet: "Valet",
    qc: "QC",
    booker: "Booker",
    pending: "Pending",
  };

  const roleLabel =
    platformMode
      ? "Owner Console"
      : roleMap[session?.role] || session?.role || "";

  const header = document.createElement("header");
  header.id = "appHeader";

  header.innerHTML = `
    <div class="app-header-left">

      <button
        id="dexpLogoButton"
        type="button"
        class="app-logo-button"
      >
        <img
          src="/assets/dexp-header-logo-blue.png"
          alt="DEXP"
          class="app-header-logo-image"
        />
      </button>

      <div class="app-header-divider">|</div>

      <div class="app-header-info">
        <h1>${dealerName}</h1>
        <p>${userName}${roleLabel ? ` • ${roleLabel}` : ""}</p>
      </div>

    </div>

    <nav class="app-header-nav">

      ${
        showHome
          ? `
            <button
              id="homeButton"
              type="button"
            >
              Home
            </button>
          `
          : ""
      }

      <button
        id="logoutButton"
        type="button"
      >
        Sign Out
      </button>

    </nav>
  `;

  const existingHeader = document.getElementById("appHeader");

  if (existingHeader) {
    existingHeader.replaceWith(header);
  } else {
    document.body.prepend(header);
  }

  const dexpLogoButton = document.getElementById("dexpLogoButton");

  if (dexpLogoButton) {
    dexpLogoButton.addEventListener("click", () => {
      if (platformMode) {
        window.location.href = "/pages/platform-admin/platform-admin.html";
        return;
      }

      window.location.href = "/pages/dashboard/index.html";
    });
  }

  const homeButton = document.getElementById("homeButton");

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      if (platformMode) {
        window.location.href = "/pages/platform-admin/platform-admin.html";
        return;
      }

      window.location.href = "/pages/dashboard/index.html";
    });
  }

  const logoutButton = document.getElementById("logoutButton");

  logoutButton.addEventListener("click", async () => {
    clearSession();

    sessionStorage.removeItem("dexp_platform_selected_dealer");

    await logoutUser();

    window.location.href = "/pages/auth/login.html";
  });
}