// public/js/core/auth.js

import {
  loginWithGoogle,
  logoutUser
} from "../services/firebase/auth-service.js";

export async function handleLogin() {
  try {
    await loginWithGoogle();
  } catch (error) {
    console.error("Login failed:", error);
  }
}

export async function handleLogout() {
  try {
    await logoutUser();
  } catch (error) {
    console.error("Logout failed:", error);
  }
}