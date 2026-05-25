// public/js/pages/auth/login-page.js
// Login page controller for DEXP.

import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  sendResetPasswordEmail
} from "/js/services/firebase/auth-service.js";

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

if (googleLoginButton) {
  googleLoginButton.addEventListener("click", async () => {
    try {
      await loginWithGoogle();

      window.location.href = "/pages/dashboard/index.html";
    } catch (error) {
      console.error("Google login failed:", error);
      alert("Google login failed. Please try again.");
    }
  });
}

if (emailLoginButton) {
  emailLoginButton.addEventListener("click", async () => {
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      alert("Enter your company email and password.");
      return;
    }

    try {
      await loginWithEmail(email, password);

      window.location.href = "/pages/dashboard/index.html";
    } catch (error) {
      console.error("Email login failed:", error);
      alert("Email login failed. Check your email and password.");
    }
  });
}

if (registerButton) {
  registerButton.addEventListener("click", async () => {
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      alert("Enter your company email and create a password.");
      return;
    }

    try {
      await registerWithEmail(email, password);

      alert(
        "Account created. Your account is pending admin approval."
      );

      window.location.href = "/pages/dashboard/index.html";
    } catch (error) {
      console.error("Registration failed:", error);
      alert("Registration failed. The email may already be in use.");
    }
  });
}

if (resetPasswordButton) {
  resetPasswordButton.addEventListener("click", async () => {
    const email = emailInput?.value.trim();

    if (!email) {
      alert("Enter your company email first.");
      return;
    }

    try {
      await sendResetPasswordEmail(email);

      alert("Password reset email sent.");
    } catch (error) {
      console.error("Password reset failed:", error);
      alert("Could not send password reset email.");
    }
  });
}