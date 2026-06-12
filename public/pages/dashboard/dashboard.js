// public/pages/dashboard/dashboard.js

import { canAccessModule, getSession } from "/js/core/session.js";

import { renderAppHeader } from "/js/shared/app-header.js";
import { MODULE_CONFIG } from "/js/config/modules.js";

import { navigateTo, protectRoute } from "/js/core/router.js";

protectRoute();

const welcomeText = document.getElementById("welcomeText");

const modulesContainer = document.getElementById("modulesContainer");

window.addEventListener("dexp-session-ready", () => {
  initializeDashboard();
});

function initializeDashboard() {
  const session = getSession();

  if (!session) {
    return;
  }

  renderAppHeader({
    title: "DEXP",
    showHome: false,
  });

  renderDealerWorkspaceBanner(session);

  renderWelcome(session);
  renderModules();
}

function renderDealerWorkspaceBanner(session) {
  if (session.role !== "platform-admin") {
    return;
  }

  const selectedDealer = sessionStorage.getItem(
    "dexp_platform_selected_dealer",
  );

  if (!selectedDealer) {
    return;
  }

  const banner = document.createElement("div");

  banner.className = "dealer-workspace-banner";

  banner.innerHTML = `
    <div>
      Viewing Dealer:
      <strong>${session.dealerName}</strong>
    </div>

    <button
      id="exitDealerButton"
      type="button"
      class="small-button"
    >
      Exit Dealer
    </button>
  `;

  document.getElementById("dashboardContent").prepend(banner);

  document.getElementById("exitDealerButton").addEventListener("click", () => {
    sessionStorage.removeItem("dexp_platform_selected_dealer");

    window.location.href = "/pages/platform-admin/platform-admin.html";
  });
}

function renderWelcome(session) {
  const dealer = session.dealerName || session.dealerId || "";

  welcomeText.textContent = dealer ? dealer : "";
}

function renderModules() {
  modulesContainer.innerHTML = "";

  Object.entries(MODULE_CONFIG).forEach(([moduleKey, config]) => {
    if (!canAccessModule(moduleKey)) {
      return;
    }

    const button = document.createElement("button");

    button.className = "dashboard-module-button";

    button.innerHTML = `
      <div>${config.label}</div>
    `;

    button.addEventListener("click", () => {
      navigateTo(config.route);
    });

    modulesContainer.appendChild(button);
  });
}
