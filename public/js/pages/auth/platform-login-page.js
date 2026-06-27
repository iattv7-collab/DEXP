// public/js/pages/auth/platform-login-page.js

import {
  loginWithEmail,
  loginWithGoogle,
} from "/js/services/firebase/auth-service.js";

const emailInput =
  document.getElementById("platformEmailInput");

const passwordInput =
  document.getElementById("platformPasswordInput");

const togglePlatformPasswordButton =
  document.getElementById("togglePlatformPasswordButton");

const emailLoginButton =
  document.getElementById("btn-platform-email-login");

const googleLoginButton =
  document.getElementById("btn-google-login");

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

togglePlatformPasswordButton?.addEventListener(
  "click",
  () => {
    const showingPassword =
      passwordInput.type === "text";

    passwordInput.type =
      showingPassword ? "password" : "text";

    togglePlatformPasswordButton.innerHTML =
      showingPassword
        ? EYE_ICON
        : EYE_OFF_ICON;

    togglePlatformPasswordButton.setAttribute(
      "aria-label",
      showingPassword
        ? "Show password"
        : "Hide password",
    );
  },
);

passwordInput?.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      emailLoginButton?.click();
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