// public/js/pages/auth/login-page.js
// Login page controller for DEXP.

import {
  loginWithEmail,
  registerWithEmail,
  sendResetPasswordEmail,
} from "/js/services/firebase/auth-service.js";

import { getDealer } from "/js/services/firestore/dealers-service.js";

import { findUserByEmail } from "/js/services/firestore/users-service.js";

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";

import { app } from "/js/services/firebase/firebase-app.js";

const functions = getFunctions(app);

const checkLoginEmail =
  httpsCallable(functions, "checkLoginEmail");

const PENDING_REGISTRATION_KEY = "dexp_pending_registration";

const emailLoginButton = document.getElementById("btn-email-login");

const registerButton = document.getElementById("btn-register");

const resetPasswordButton = document.getElementById("btn-reset-password");

const emailInput = document.getElementById("emailInput");

const passwordInput = document.getElementById("passwordInput");

const dealerLoginName = document.getElementById("dealerLoginName");

const dealerIdFromUrl = getDealerIdFromUrl();

let currentDealer = null;

initializeDealerLoginLabel();

emailLoginButton?.addEventListener("click", async () => {
  const email = emailInput?.value.trim();

  const password = passwordInput?.value;

  if (!email || !password) {
    alert("Enter your company email and password.");

    return;
  }

  try {
    await loginWithEmail(email, password);

    window.location.href = buildRedirectUrl();
  } catch (error) {
    console.error("Email login failed:", error);

    await handleEmailLoginFailure(email, error);
  }
});

registerButton?.addEventListener("click", () => {
  if (!dealerIdFromUrl) {
    alert("This registration link is missing a dealer.");

    return;
  }

  openRegisterModal();
});

resetPasswordButton?.addEventListener("click", async () => {
  const email = emailInput?.value.trim();

  if (!email) {
    alert("Enter your company email first.");

    return;
  }

  try {
    const result = await checkLoginEmail({
      email,
    });

    const status = result?.data?.status || "not-found";

    if (status === "not-found") {
      alert(
        "No DEXP account was found for this email.\n\nPlease register first using your dealership registration link.",
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

async function handleEmailLoginFailure(email, error) {
  try {
    const result =
      await checkLoginEmail({
        email,
      });

    const status =
      result?.data?.status || "not-found";

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

    if (dealerIdFromUrl) {
      const register = confirm(
        "No DEXP account was found for this email.\n\nWould you like to register for this dealership?",
      );

      if (register) {
        openRegisterModal();
      }

      return;
    }

    alert(
      "No DEXP account was found for this email.\n\nPlease use your dealership registration link to create an account.",
    );
  } catch (lookupError) {
    console.error(
      "Login email check failed:",
      lookupError,
    );

    alert(
      "Could not verify this email. Please try again.",
    );
  }
}

function openRegisterModal() {
  if (!dealerIdFromUrl) {
    alert("This registration link is missing a dealer.");

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
          Dealer: ${escapeHtml(currentDealer?.name || "Selected Dealer")}
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
            style="
              width:100%;
              padding:10px;
            "
          />

          <input
            id="registerCompanyIdInput"
            type="text"
            placeholder="Company ID / Employee #"
            style="
              width:100%;
              padding:10px;
            "
          />

          <input
            id="registerEmailInput"
            type="email"
            placeholder="Company Email"
            value="${escapeHtml(emailInput?.value || "")}"
            style="
              width:100%;
              padding:10px;
            "
          />

          <input
            id="registerPhoneInput"
            type="tel"
            placeholder="Phone Number"
            style="
              width:100%;
              padding:10px;
            "
          />

          <input
            id="registerPasswordInput"
            type="password"
            placeholder="Create Password"
            value="${escapeHtml(passwordInput?.value || "")}"
            style="
              width:100%;
              padding:10px;
            "
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
          <button
            id="registerCancelBtn"
            type="button"
          >
            Cancel
          </button>

          <button
            id="registerCreateBtn"
            type="button"
          >
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

  if (!dealerIdFromUrl) {
    alert("This registration link is missing a dealer.");

    return;
  }

  try {
    sessionStorage.setItem(
      PENDING_REGISTRATION_KEY,
      JSON.stringify({
        dealerId: dealerIdFromUrl,
        displayName,
        companyId,
        email,
        phone,
      }),
    );

    await registerWithEmail(email, password);

    alert(
      `Account created for ${
        currentDealer?.name || "this dealer"
      }.\n\nYour account is pending manager approval.`,
    );

    modal.remove();

    window.location.href = buildRedirectUrl();
  } catch (error) {
    sessionStorage.removeItem(PENDING_REGISTRATION_KEY);

    console.error("Registration failed:", error);

    alert("Registration failed. The email may already be in use.");
  }
}

async function initializeDealerLoginLabel() {
  if (!dealerLoginName) {
    return;
  }

  if (!dealerIdFromUrl) {
    currentDealer = null;

    dealerLoginName.textContent = "Dealer Login";

    if (registerButton) {
      registerButton.style.display = "none";
    }

    return;
  }

  try {
    const dealer = await getDealer(dealerIdFromUrl);

    if (!dealer) {
      currentDealer = null;

      dealerLoginName.textContent = "Unknown Dealer Link";

      if (registerButton) {
        registerButton.style.display = "none";
      }

      return;
    }

    currentDealer = dealer;

    dealerLoginName.textContent = `Signing in to ${dealer.name}`;

    if (registerButton) {
      registerButton.style.display = "block";
    }
  } catch (error) {
    console.error("Dealer lookup failed:", error);

    currentDealer = null;

    dealerLoginName.textContent = `Dealer Registration (${dealerIdFromUrl})`;

    if (registerButton) {
      registerButton.style.display = "block";
    }
  }
}

function getDealerIdFromUrl() {
  const params = new URLSearchParams(window.location.search);

  return String(params.get("dealerId") || "").trim();
}

function buildRedirectUrl() {
  const pendingSession = JSON.parse(
    localStorage.getItem("dexp_session") || "null",
  );

  if (pendingSession?.role === "platform-admin") {
    return "/pages/platform-admin/platform-admin.html";
  }

  if (!dealerIdFromUrl) {
    return "/pages/dashboard/index.html";
  }

  return `/pages/dashboard/index.html?dealerId=${encodeURIComponent(
    dealerIdFromUrl,
  )}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
