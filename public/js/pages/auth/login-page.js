// public/js/pages/auth/login-page.js
// Dealer-specific login page controller for DEXP.

import {
  loginWithEmail,
  registerWithEmail,
  sendResetPasswordEmail,
  logoutUser,
} from "/js/services/firebase/auth-service.js";

import { getDealer } from "/js/services/firestore/dealers-service.js";

import { ensureUserProfile } from "/js/services/firestore/users-service.js";

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

import { app } from "/js/services/firebase/firebase-app.js";

const functions = getFunctions(app);
const checkLoginEmail = httpsCallable(functions, "checkLoginEmail");

const checkDealerCompanyId = httpsCallable(functions, "checkDealerCompanyId");

const PENDING_REGISTRATION_KEY = "dexp_pending_registration";

const emailLoginButton = document.getElementById("btn-email-login");
const registerButton = document.getElementById("btn-register");
const resetPasswordButton = document.getElementById("btn-reset-password");

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const dealerLoginName = document.getElementById("dealerLoginName");
const togglePasswordButton = document.getElementById("togglePasswordButton");

const dealerIdFromEntry = getDealerIdFromEntryPoint();

let currentDealer = null;

initializeDealerEntry();

emailLoginButton?.addEventListener("click", async () => {
  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  if (!currentDealer) {
    alert("Use your dealership's DEXP entry link to sign in.");
    return;
  }

  if (!email || !password) {
    alert("Enter your company email and password.");
    return;
  }

  try {
    await loginWithEmail(email, password);

    window.location.href = `/pages/dashboard/index.html?dealerId=${encodeURIComponent(
      dealerIdFromEntry,
    )}`;
  } catch (error) {
    console.error("Email login failed:", error);
    await handleEmailLoginFailure(email);
  }
});

const EYE_ICON = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="22"
  height="22"
  viewBox="0 0 24 24"
  fill="none"
  stroke="#0b3d91"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12"></path>
  <circle cx="12" cy="12" r="3"></circle>
</svg>
`;

const EYE_OFF_ICON = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="22"
  height="22"
  viewBox="0 0 24 24"
  fill="none"
  stroke="#0b3d91"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.8 21.8 0 0 1 5.08-5.94"></path>
  <path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.86 21.86 0 0 1-3.17 4.19"></path>
  <path d="M1 1l22 22"></path>
  <path d="M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-.53"></path>
</svg>
`;

togglePasswordButton?.addEventListener("click", () => {
  const showingPassword = passwordInput.type === "text";

  passwordInput.type = showingPassword ? "password" : "text";

  togglePasswordButton.innerHTML =
    showingPassword ? EYE_ICON : EYE_OFF_ICON;

  togglePasswordButton.setAttribute(
    "aria-label",
    showingPassword ? "Show password" : "Hide password",
  );
});

registerButton?.addEventListener("click", () => {
  if (!currentDealer) {
    alert("Use your dealership's DEXP registration link.");
    return;
  }

  openRegisterModal();
});

resetPasswordButton?.addEventListener("click", async () => {
  const email = emailInput?.value.trim();

  if (!currentDealer) {
    alert("Use your dealership's DEXP entry link first.");
    return;
  }

  if (!email) {
    alert("Enter your company email first.");
    return;
  }

  try {
    const result = await checkLoginEmail({ email });
    const status = result?.data?.status || "not-found";

    if (status === "not-found") {
      alert(
        "No DEXP account was found for this email.\n\nPlease register first using your dealership entry link.",
      );

      return;
    }

    if (status === "pending") {
      alert(
        "Your account has been created and is waiting for manager approval.\n\nA password reset is not needed yet.",
      );

      return;
    }

    if (status === "disabled") {
      alert(
        "Your account has been disabled.\n\nPlease contact your dealership administrator.",
      );

      return;
    }

    await sendResetPasswordEmail(email);

    alert(`Password reset email sent to:\n${email}`);
  } catch (error) {
    console.error("Password reset failed:", error);

    alert("Could not verify this email. Please try again.");
  }
});

passwordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    emailLoginButton?.click();
  }
});

async function initializeDealerEntry() {
  if (!dealerLoginName) {
    return;
  }

  disableDealerLogin();

  if (!dealerIdFromEntry) {
    dealerLoginName.textContent = "Invalid Dealer Entry";

    alert("This is not a valid dealer entry link.");

    return;
  }

  try {
    const dealer = await getDealer(dealerIdFromEntry);

    if (!dealer) {
      dealerLoginName.textContent = "Dealer Not Found";

      alert("This dealership entry link is not valid.");

      return;
    }

    if (dealer.active === false) {
      dealerLoginName.textContent = "Dealer Inactive";

      alert("This dealership is currently inactive.");

      return;
    }

    currentDealer = dealer;

    dealerLoginName.textContent = `Signing in to ${dealer.name}`;

    enableDealerLogin();
  } catch (error) {
    console.error("Dealer lookup failed:", error);

    dealerLoginName.textContent = "Dealer Lookup Failed";

    alert("Could not load this dealership entry.");
  }
}

function disableDealerLogin() {
  if (emailLoginButton) {
    emailLoginButton.disabled = true;
  }

  if (registerButton) {
    registerButton.disabled = true;
    registerButton.style.display = "none";
  }

  if (resetPasswordButton) {
    resetPasswordButton.disabled = true;
  }
}

function enableDealerLogin() {
  if (emailLoginButton) {
    emailLoginButton.disabled = false;
  }

  if (registerButton) {
    registerButton.disabled = false;
    registerButton.style.display = "block";
  }

  if (resetPasswordButton) {
    resetPasswordButton.disabled = false;
  }
}

async function handleEmailLoginFailure(email) {
  try {
    const result = await checkLoginEmail({ email });
    const status = result?.data?.status || "not-found";

    if (status === "pending") {
      alert(
        "Your account has been created and is waiting for manager approval.\n\nPlease contact your dealership administrator.",
      );

      return;
    }

    if (status === "disabled") {
      alert(
        "Your account has been disabled.\n\nPlease contact your dealership administrator.",
      );

      return;
    }

    if (status === "active") {
      const reset = confirm(
        "Incorrect password.\n\nWould you like to reset your password?",
      );

      if (reset) {
        await sendResetPasswordEmail(email);

        alert(`Password reset email sent to:\n${email}`);
      }

      return;
    }

    const register = confirm(
      "No DEXP account was found for this email.\n\nWould you like to register for this dealership?",
    );

    if (register) {
      openRegisterModal();
    }
  } catch (lookupError) {
    console.error("Login email check failed:", lookupError);

    alert("Could not verify this email. Please try again.");
  }
}

function openRegisterModal() {
  if (!currentDealer || !dealerIdFromEntry) {
    alert("Use your dealership's DEXP registration link.");
    return;
  }

  const existingModal = document.getElementById("registerAccountModal");

  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement("div");

  modal.id = "registerAccountModal";

  modal.innerHTML = `
    <div
      style="
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.45);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:9999;
        padding:18px;
      "
    >
      <div
        style="
          background:white;
          width:min(440px,96vw);
          border-radius:10px;
          padding:22px;
          border:1px solid #cfd6df;
          box-shadow:0 10px 30px rgba(0,0,0,.2);
        "
      >
        <h2 style="margin-top:0;">
          Create New Account
        </h2>

        <div
          style="
            background:#f4f6f8;
            border:1px solid #cfd6df;
            border-radius:8px;
            padding:10px;
            margin-bottom:14px;
            font-weight:bold;
            color:#0b3d91;
          "
        >
          Dealer: ${escapeHtml(currentDealer.name)}
        </div>

        <p style="margin-top:0;">
          Your manager will approve access.
        </p>

        <div
          style="
            display:flex;
            flex-direction:column;
            gap:10px;
          "
        >
          <input
            id="registerNameInput"
            type="text"
            placeholder="Full Name"
            style="width:100%; padding:10px;"
          />

          <input
            id="registerCompanyIdInput"
            type="text"
            placeholder="Company ID / Employee #"
            style="width:100%; padding:10px;"
          />

          <input
            id="registerEmailInput"
            type="email"
            placeholder="Company Email"
            value="${escapeHtml(emailInput?.value || "")}"
            style="width:100%; padding:10px;"
          />

          <input
            id="registerPhoneInput"
            type="tel"
            placeholder="Phone Number"
            style="width:100%; padding:10px;"
          />

          <input
            id="registerPasswordInput"
            type="password"
            placeholder="Create Password"
            value="${escapeHtml(passwordInput?.value || "")}"
            style="width:100%; padding:10px;"
          />
        </div>

        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            margin-top:18px;
          "
        >
          <button id="registerCancelBtn" type="button">
            Cancel
          </button>

          <button id="registerCreateBtn" type="button">
            Create Account
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document
    .getElementById("registerCancelBtn")
    ?.addEventListener("click", () => {
      modal.remove();
    });

  document
    .getElementById("registerCreateBtn")
    ?.addEventListener("click", async () => {
      await handleRegisterSubmit(modal);
    });

  document.getElementById("registerNameInput")?.focus();
}

async function handleRegisterSubmit(modal) {
  const displayName = document
    .getElementById("registerNameInput")
    ?.value.trim();

  const companyId = document
    .getElementById("registerCompanyIdInput")
    ?.value.trim();

  const email = document.getElementById("registerEmailInput")?.value.trim();

  const phone = document.getElementById("registerPhoneInput")?.value.trim();

  const password = document.getElementById("registerPasswordInput")?.value;

  if (!displayName || !companyId || !email || !phone || !password) {
    alert("Enter all registration fields.");
    return;
  }

  if (!currentDealer || !dealerIdFromEntry) {
    alert("Use your dealership's DEXP registration link.");
    return;
  }

  try {
    const companyIdResult = await checkDealerCompanyId({
      dealerId: dealerIdFromEntry,
      companyId,
    });

    if (companyIdResult?.data?.exists) {
      const duplicateError = new Error("Company ID already registered.");
      duplicateError.code = "dexp/company-id-in-use";
      throw duplicateError;
    }

    sessionStorage.setItem(
      PENDING_REGISTRATION_KEY,
      JSON.stringify({
        dealerId: dealerIdFromEntry,
        displayName,
        companyId,
        email,
        phone,
      }),
    );

    const credential = await registerWithEmail(email, password);

    await ensureUserProfile(credential.user, {
      requestedDealerId: dealerIdFromEntry,
      pendingRegistration: {
        dealerId: dealerIdFromEntry,
        displayName,
        companyId,
        email,
        phone,
      },
    });

    sessionStorage.removeItem(PENDING_REGISTRATION_KEY);

    await logoutUser();

    alert(
      `Account created for ${currentDealer.name}.\n\nYour account is pending manager approval.`,
    );

    modal.remove();
  } catch (error) {
    sessionStorage.removeItem(PENDING_REGISTRATION_KEY);

    console.error("Registration failed:", error);

    alert(getRegistrationErrorMessage(error, companyId));
  }
}

function getDealerIdFromEntryPoint() {
  const params = new URLSearchParams(window.location.search);

  const queryDealerId = String(params.get("dealerId") || "").trim();

  if (queryDealerId) {
    return queryDealerId;
  }

  const pathParts = window.location.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const dealerRouteIndex = pathParts.findIndex((part) =>
    ["d", "dealer", "dealers"].includes(part),
  );

  if (dealerRouteIndex >= 0 && pathParts[dealerRouteIndex + 1]) {
    return pathParts[dealerRouteIndex + 1];
  }

  return "";
}

function getRegistrationErrorMessage(error, companyId) {
  const code = error?.code || "";

  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Use the existing account or reset the password.";
  }

  if (code === "auth/invalid-email") {
    return "Enter a valid email address.";
  }

  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 6 characters.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Email/password registration is not enabled for this app.";
  }

  if (code === "auth/network-request-failed") {
    return "Network error. Check your connection and try again.";
  }

  if (code === "dexp/company-id-in-use") {
    return `Company ID ${companyId} is already registered for this dealership. Contact your dealership administrator.`;
  }

  return error?.message || "Registration failed. Please try again.";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
