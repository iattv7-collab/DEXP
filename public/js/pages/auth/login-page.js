// public/js/pages/auth/login-page.js
// Login page controller for DEXP.

import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  sendResetPasswordEmail
} from "/js/services/firebase/auth-service.js";

import {
  getDealer
} from "/js/services/firestore/dealers-service.js";

const PENDING_REGISTRATION_KEY =
  "dexp_pending_registration";

const googleLoginButton =
  document.getElementById("btn-login");

const emailLoginButton =
  document.getElementById("btn-email-login");

const registerButton =
  document.getElementById("btn-register");

const resetPasswordButton =
  document.getElementById("btn-reset-password");

const emailInput =
  document.getElementById("emailInput");

const passwordInput =
  document.getElementById("passwordInput");

const dealerLoginName =
  document.getElementById("dealerLoginName");

const dealerIdFromUrl =
  getDealerIdFromUrl();

initializeDealerLoginLabel();

googleLoginButton?.addEventListener(
  "click",
  async () => {
    try {
      await loginWithGoogle();

      window.location.href =
        buildRedirectUrl();
    } catch (error) {
      console.error(
        "Google login failed:",
        error
      );

      alert(
        "Google login failed. Please try again."
      );
    }
  }
);

emailLoginButton?.addEventListener(
  "click",
  async () => {
    const email =
      emailInput?.value.trim();

    const password =
      passwordInput?.value;

    if (!email || !password) {
      alert(
        "Enter your company email and password."
      );

      return;
    }

    try {
      await loginWithEmail(
        email,
        password
      );

      window.location.href =
        buildRedirectUrl();
    } catch (error) {
      console.error(
        "Email login failed:",
        error
      );

      alert(
        "Email login failed. Check your email and password."
      );
    }
  }
);

registerButton?.addEventListener(
  "click",
  () => {
    if (!dealerIdFromUrl) {
      alert(
        "This registration link is missing a dealer."
      );

      return;
    }

    openRegisterModal();
  }
);

resetPasswordButton?.addEventListener(
  "click",
  async () => {
    const email =
      emailInput?.value.trim();

    if (!email) {
      alert(
        "Enter your company email first."
      );

      return;
    }

    try {
      await sendResetPasswordEmail(email);

      alert(
        "Password reset email sent."
      );
    } catch (error) {
      console.error(
        "Password reset failed:",
        error
      );

      alert(
        "Could not send password reset email."
      );
    }
  }
);

function openRegisterModal() {
  const existingModal =
    document.getElementById(
      "registerAccountModal"
    );

  if (existingModal) {
    existingModal.remove();
  }

  const modal =
    document.createElement("div");

  modal.id =
    "registerAccountModal";

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
            value="${escapeHtml(
              emailInput?.value || ""
            )}"
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
            value="${escapeHtml(
              passwordInput?.value || ""
            )}"
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
    .getElementById(
      "registerCancelBtn"
    )
    ?.addEventListener(
      "click",
      () => {
        modal.remove();
      }
    );

  document
    .getElementById(
      "registerCreateBtn"
    )
    ?.addEventListener(
      "click",
      async () => {
        await handleRegisterSubmit(
          modal
        );
      }
    );

  document
    .getElementById(
      "registerNameInput"
    )
    ?.focus();
}

async function handleRegisterSubmit(
  modal
) {
  const displayName =
    document
      .getElementById(
        "registerNameInput"
      )
      ?.value.trim();

  const companyId =
    document
      .getElementById(
        "registerCompanyIdInput"
      )
      ?.value.trim();

  const email =
    document
      .getElementById(
        "registerEmailInput"
      )
      ?.value.trim();

  const phone =
    document
      .getElementById(
        "registerPhoneInput"
      )
      ?.value.trim();

  const password =
    document
      .getElementById(
        "registerPasswordInput"
      )
      ?.value;

  if (
    !displayName ||
    !companyId ||
    !email ||
    !phone ||
    !password
  ) {
    alert(
      "Enter all registration fields."
    );

    return;
  }

  try {
    sessionStorage.setItem(
      PENDING_REGISTRATION_KEY,
      JSON.stringify({
        dealerId:
          dealerIdFromUrl,

        displayName,
        companyId,
        email,
        phone
      })
    );

    await registerWithEmail(
      email,
      password
    );

    alert(
      "Account created. Pending admin approval."
    );

    modal.remove();

    window.location.href =
      buildRedirectUrl();
  } catch (error) {
    sessionStorage.removeItem(
      PENDING_REGISTRATION_KEY
    );

    console.error(
      "Registration failed:",
      error
    );

    alert(
      "Registration failed. The email may already be in use."
    );
  }
}

async function initializeDealerLoginLabel() {
  if (!dealerLoginName) {
    return;
  }

  if (!dealerIdFromUrl) {
    dealerLoginName.textContent =
      "General DEXP Login";

    return;
  }

  try {
    const dealer =
      await getDealer(
        dealerIdFromUrl
      );

    if (!dealer) {
      dealerLoginName.textContent =
        "Unknown Dealer Link";

      return;
    }

    dealerLoginName.textContent =
      `Signing in to ${dealer.name}`;
  } catch (error) {
    console.error(
      "Dealer lookup failed:",
      error
    );

    dealerLoginName.textContent =
      "Dealer could not be loaded";
  }
}

function getDealerIdFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return String(
    params.get("dealerId") || ""
  ).trim();
}

function buildRedirectUrl() {
  if (!dealerIdFromUrl) {
    return "/pages/dashboard/index.html";
  }

  return `/pages/dashboard/index.html?dealerId=${encodeURIComponent(
    dealerIdFromUrl
  )}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}