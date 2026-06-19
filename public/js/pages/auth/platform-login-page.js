// public/js/pages/auth/platform-login-page.js

import {
  loginWithEmail,
  loginWithGoogle,
} from "/js/services/firebase/auth-service.js";

const emailInput =
  document.getElementById("platformEmailInput");

const passwordInput =
  document.getElementById("platformPasswordInput");

const emailLoginButton =
  document.getElementById("btn-platform-email-login");

const googleLoginButton =
  document.getElementById("btn-google-login");

emailLoginButton?.addEventListener(
  "click",
  async () => {
    const email =
      emailInput?.value.trim();

    const password =
      passwordInput?.value;

    if (!email || !password) {
      alert(
        "Enter your platform admin email and password.",
      );

      return;
    }

    try {
      await loginWithEmail(
        email,
        password,
      );

      window.location.href =
        "/pages/platform-admin/platform-admin.html";
    } catch (error) {
      console.error(
        "Platform email login failed:",
        error,
      );

      alert(
        "Platform login failed. Check your email and password.",
      );
    }
  },
);

googleLoginButton?.addEventListener(
  "click",
  async () => {
    try {
      await loginWithGoogle();

      window.location.href =
        "/pages/platform-admin/platform-admin.html";
    } catch (error) {
      console.error(
        "Platform Google login failed:",
        error,
      );

      alert(
        "Google sign in failed.",
      );
    }
  },
);