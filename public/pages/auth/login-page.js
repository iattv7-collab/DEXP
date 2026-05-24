// public/js/pages/auth/login-page.js
// Login page controller for DEXP.

import { loginWithGoogle } from "/js/services/firebase/auth-service.js";

const loginButton = document.getElementById("btn-login");

if (loginButton) {
  loginButton.addEventListener("click", async () => {
    try {
      await loginWithGoogle();

      window.location.href = "/pages/dashboard/index.html";
    } catch (error) {
      console.error("Google login failed:", error);
      alert("Login failed. Please try again.");
    }
  });
}