// public/js/pages/auth/login-page.js

import { handleLogin } from "../../core/auth.js";

const loginButton = document.getElementById("btn-login");

if (loginButton) {
  loginButton.addEventListener("click", async () => {
    await handleLogin();
    window.location.href = "/pages/dashboard/index.html";
  });
}