// public/pages/dashboard/dashboard.js

import {
  canAccessModule,
  getSession
} from "/js/core/session.js";

import { renderAppHeader } from "/js/shared/app-header.js";
import { MODULE_CONFIG } from "/js/config/modules.js";

import {
  navigateTo,
  protectRoute
} from "/js/core/router.js";

protectRoute();

const welcomeText =
  document.getElementById("welcomeText");

const modulesContainer =
  document.getElementById("modulesContainer");

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
    showHome: false
  });

  renderWelcome(session);
  renderModules();
}

function renderWelcome(session) {
  const dealer =
    session.dealerName ||
    session.dealerId ||
    "";

  welcomeText.textContent =
    dealer ? dealer : "";
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