// public/pages/platform-admin/dealer-edit.js

import { protectRoute } from "/js/core/router.js";

import { getSession } from "/js/core/session.js";

import { ROLES } from "/js/config/roles.js";

import { SELLABLE_MODULE_GROUPS } from "/js/config/modules.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  getDealer,
  updateDealerProfile,
} from "/js/services/firestore/dealers-service.js";

import {
  getDealerModules,
  updateDealerEnabledModules,
} from "/js/services/firestore/modules-service.js";

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN],
});

const params = new URLSearchParams(window.location.search);

const dealerId = params.get("dealer");

const dealerEditForm = document.getElementById("dealerEditForm");

const systemCodeInput = document.getElementById("systemCodeInput");

const dealerIdInput = document.getElementById("dealerIdInput");

const dealerNameInput = document.getElementById("dealerNameInput");

const displayShortNameInput = document.getElementById("displayShortNameInput");

const dealerActiveInput = document.getElementById("dealerActiveInput");

const sellableModulesContainer = document.getElementById(
  "sellableModulesContainer",
);

const backButton = document.getElementById("backButton");

window.addEventListener("dexp-session-ready", () => {
  initializeDealerEditPage();
});

async function initializeDealerEditPage() {
  const session = getSession();

  if (!session) {
    return;
  }

  renderAppHeader({
    pageTitle: "Edit Dealer",
  });

  if (!dealerId) {
    alert("Missing dealer.");

    window.location.href = "/pages/platform-admin/platform-admin.html";

    return;
  }

  backButton.addEventListener("click", () => {
    window.location.href = "/pages/platform-admin/platform-admin.html";
  });

  dealerEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    await saveDealer();
  });

  await loadDealer();
}

async function loadDealer() {
  const dealer = await getDealer(dealerId);

  const enabledModules = await getDealerModules(dealerId);

  systemCodeInput.value = dealer.systemCode || "";

  dealerIdInput.value = dealer.id || "";

  dealerNameInput.value = dealer.name || "";

  displayShortNameInput.value = dealer.displayShortName || "";

  dealerActiveInput.value = dealer.active === false ? "false" : "true";

  renderSellableModules(enabledModules);
}

function renderSellableModules(enabledModules) {
  const html = SELLABLE_MODULE_GROUPS.map((group) => {
    const checked = group.modules.every((moduleId) =>
      enabledModules.includes(moduleId),
    );

    return `
          <label
            style="
              display:flex;
              gap:10px;
              align-items:center;
              margin-bottom:10px;
            "
          >
            <input
              type="checkbox"
              class="sellable-module-checkbox"
              value="${group.id}"
              ${checked ? "checked" : ""}
            />

            <span>
              ${group.label}
            </span>
          </label>
        `;
  }).join("");

  sellableModulesContainer.innerHTML = html;
}

async function saveDealer() {
  try {
    const selectedGroupIds = Array.from(
      document.querySelectorAll(".sellable-module-checkbox:checked"),
    ).map((checkbox) => checkbox.value);

    const enabledModules = SELLABLE_MODULE_GROUPS.filter((group) =>
      selectedGroupIds.includes(group.id),
    ).flatMap((group) => group.modules);

    await updateDealerProfile(dealerId, {
      name: dealerNameInput.value.trim(),

      displayShortName: displayShortNameInput.value.trim(),

      active: dealerActiveInput.value === "true",
    });

    await updateDealerEnabledModules(dealerId, enabledModules);

    alert("Dealer updated.");

    window.location.href = "/pages/platform-admin/platform-admin.html";
  } catch (error) {
    console.error(error);

    alert(error.message || "Failed to save dealer.");
  }
}
