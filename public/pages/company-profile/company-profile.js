// public/pages/company-profile/company-profile.js

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { ROLES } from "/js/config/roles.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  getDealer,
  updateDealerProfile
} from "/js/services/firestore/dealers-service.js";

protectRoute({
  allowedRoles: [
    ROLES.ADMIN,
    ROLES.MANAGER
  ]
});

const form = document.getElementById("companyProfileForm");

const fields = {
  name: document.getElementById("dealerName"),
  companyCode: document.getElementById("companyCode"),
  phone: document.getElementById("dealerPhone"),
  website: document.getElementById("dealerWebsite"),
  address1: document.getElementById("address1"),
  address2: document.getElementById("address2"),
  city: document.getElementById("city"),
  state: document.getElementById("state"),
  zip: document.getElementById("zip"),
  timezone: document.getElementById("timezone")
};

window.addEventListener("dexp-session-ready", () => {
  initializeCompanyProfilePage();
});

async function initializeCompanyProfilePage() {
  const session = getSession();

  if (!session?.dealerId) {
    return;
  }

  renderAppHeader({
    pageTitle: "Company Profile"
  });

  const dealer = await getDealer(session.dealerId);

  loadDealerIntoForm(dealer);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    await saveDealerProfile(session.dealerId);
  });
}

function loadDealerIntoForm(dealer) {
  fields.name.value = dealer?.name || "";
  fields.companyCode.value = dealer?.companyCode || "";
  fields.phone.value = dealer?.phone || "";
  fields.website.value = dealer?.website || "";
  fields.address1.value = dealer?.address1 || "";
  fields.address2.value = dealer?.address2 || "";
  fields.city.value = dealer?.city || "";
  fields.state.value = dealer?.state || "";
  fields.zip.value = dealer?.zip || "";
  fields.timezone.value = dealer?.timezone || "America/New_York";
}

async function saveDealerProfile(dealerId) {
  await updateDealerProfile(dealerId, {
    name: fields.name.value.trim(),
    companyCode: fields.companyCode.value.trim().toUpperCase(),
    phone: fields.phone.value.trim(),
    website: fields.website.value.trim(),
    address1: fields.address1.value.trim(),
    address2: fields.address2.value.trim(),
    city: fields.city.value.trim(),
    state: fields.state.value.trim(),
    zip: fields.zip.value.trim(),
    timezone: fields.timezone.value.trim()
  });

  alert("Company profile saved.");
}