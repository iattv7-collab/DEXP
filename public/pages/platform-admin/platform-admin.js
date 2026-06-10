// public/pages/platform-admin/platform-admin.js

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { ROLES } from "/js/config/roles.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  createDealerWithPrimaryAdmin,
  getAllDealers,
} from "/js/services/firestore/dealers-service.js";

protectRoute({
  allowedRoles: [ROLES.PLATFORM_ADMIN],
});

let allDealers = [];

const dealersContainer = document.getElementById("dealersContainer");

const dealerSearchInput = document.getElementById("dealerSearchInput");

const createDealerForm = document.getElementById("createDealerForm");

const dealerNameInput = document.getElementById("dealerNameInput");

const companyCodeInput = document.getElementById("companyCodeInput");

const adminNameInput = document.getElementById("adminNameInput");

const adminEmailInput = document.getElementById("adminEmailInput");

const adminPhoneInput = document.getElementById("adminPhoneInput");

window.addEventListener("dexp-session-ready", () => {
  initializePlatformAdminPage();
});

async function initializePlatformAdminPage() {
  const session = getSession();

  if (!session) {
    return;
  }

  renderAppHeader({
    pageTitle: "Platform Admin",
  });

  createDealerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    await handleCreateDealer();
  });

  dealerSearchInput.addEventListener("input", renderFilteredDealers);

  await loadDealers();
}

async function loadDealers() {
  dealersContainer.innerHTML = `
    <div class="dexp-admin-card">
      Loading dealers...
    </div>
  `;

  allDealers = await getAllDealers();

  renderFilteredDealers();
}

function renderFilteredDealers() {
  const search = dealerSearchInput.value.trim().toLowerCase();

  const filteredDealers = allDealers.filter((dealer) => {
    return [dealer.systemCode, dealer.id, dealer.name, dealer.displayShortName]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  if (!filteredDealers.length) {
    dealersContainer.innerHTML = `
      <div class="dexp-admin-card">
        No matching dealers found.
      </div>
    `;

    return;
  }

  const rows = filteredDealers
    .map(
      (dealer) => `
    <tr>
      <td>${dealer.systemCode || ""}</td>
      <td>${dealer.id || ""}</td>
      <td>${dealer.name || ""}</td>
      <td>${dealer.displayShortName || ""}</td>
      <td>${dealer.active === false ? "Inactive" : "Active"}</td>
      <td>
        <button
          type="button"
          class="platform-open-dealer-btn"
          data-dealer-id="${dealer.id}"
        >
          Open Dealer
        </button>

        <button
          type="button"
          class="platform-edit-dealer-btn"
          data-dealer-id="${dealer.id}"
        >
          Edit
        </button>
      </td>
    </tr>
  `,
    )
    .join("");

  dealersContainer.innerHTML = `
    <div class="dexp-admin-card">

      <table class="dexp-admin-table">

        <thead>
          <tr>
            <th>System Code</th>
            <th>Dealer Slug</th>
            <th>Name</th>
            <th>Short Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>

      </table>

    </div>
  `;

  attachDealerRowEvents();
}

function attachDealerRowEvents() {
  document
  .querySelectorAll(".platform-open-dealer-btn")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const dealerId = button.dataset.dealerId;

      sessionStorage.setItem(
        "dexp_platform_selected_dealer",
        dealerId,
      );

      window.location.href =
        `/pages/platform-admin/open-dealer.html?dealerId=${encodeURIComponent(
          dealerId,
        )}`;
    });
  });

  document.querySelectorAll(".platform-edit-dealer-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const dealerId = button.dataset.dealerId;

      window.location.href = `/pages/platform-admin/dealer-edit.html?dealer=${encodeURIComponent(
        dealerId,
      )}`;
    });
  });
}

async function handleCreateDealer() {
  const dealerName = dealerNameInput.value.trim();

  const dealerId = buildDealerSlug(dealerName);

  const displayShortName = companyCodeInput.value.trim();

  const adminName = adminNameInput.value.trim();

  const adminEmail = adminEmailInput.value.trim().toLowerCase();

  const adminPhone = adminPhoneInput.value.trim();

  if (!dealerName || !adminName || !adminEmail) {
    alert("Dealer name and primary admin info are required.");

    return;
  }

  try {
    await createDealerWithPrimaryAdmin({
      dealerId,
      name: dealerName,
      displayShortName,
      adminName,
      adminEmail,
      adminPhone,
    });

    dealerNameInput.value = "";
    companyCodeInput.value = "";

    adminNameInput.value = "";
    adminEmailInput.value = "";
    adminPhoneInput.value = "";

    dealerSearchInput.value = "";

    await loadDealers();

    alert("Dealer created and admin invite saved.");
  } catch (error) {
    console.error(error);

    alert(error.message || "Failed to create dealer.");
  }
}

function buildDealerSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
