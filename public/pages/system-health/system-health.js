// public/pages/system-health/system-health.js
// Basic DEXP system health diagnostics.

import { DEXP_APP_VERSION } from "/js/config/app-version.js";
import { getSession } from "/js/core/session.js";

import {
  collection,
  getDocs,
  limit,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";

const systemHealthContent = document.getElementById("systemHealthContent");

async function getFirestoreStatus() {
  try {
    await getDocs(
      query(
        collection(db, "dealers"),
        limit(1),
      ),
    );

    return "Connected";
  } catch (error) {
    console.error("System Health Firestore Test:", error);

    return `Failed: ${error.message}`;
  }
}

function getSystemStatus({
  session,
  firestoreStatus,
}) {
  if (!session) {
    return {
      label: "WARNING",
      color: "#b45309",
      message: "No active DEXP session found.",
    };
  }

  if (firestoreStatus !== "Connected") {
    return {
      label: "WARNING",
      color: "#b91c1c",
      message: "Firestore connection failed.",
    };
  }

  return {
    label: "HEALTHY",
    color: "#15803d",
    message: "App, session, and Firestore are available.",
  };
}

async function renderSystemHealth() {
  const session = getSession();

  const firestoreStatus = await getFirestoreStatus();

  const systemStatus = getSystemStatus({
    session,
    firestoreStatus,
  });

  const dealerModuleCount = session?.modules?.length || 0;

  const assignedModuleCount = session?.assignedModules?.length || 0;

  systemHealthContent.innerHTML = `
    <div>
      <b>System Status:</b>
      <span style="color: ${systemStatus.color}; font-weight: bold;">
        ${systemStatus.label}
      </span>
    </div>

    <div><b>Status Message:</b> ${systemStatus.message}</div>

    <hr />

    <div><b>App:</b> DEXP</div>

    <div><b>Version:</b> ${DEXP_APP_VERSION}</div>

    <div><b>Page:</b> ${window.location.pathname}</div>

    <div><b>Loaded At:</b> ${new Date().toLocaleString()}</div>

    <hr />

    <div><b>Firestore:</b> ${firestoreStatus}</div>

    <hr />

    <div><b>Session Found:</b> ${session ? "Yes" : "No"}</div>

    <div><b>User:</b> ${session?.displayName || session?.email || ""}</div>

    <div><b>Role:</b> ${session?.role || ""}</div>

    <div><b>Dealer ID:</b> ${session?.dealerId || ""}</div>

    <div><b>Dealer Name:</b> ${session?.dealerName || ""}</div>

    <div><b>Dealer Modules:</b> ${dealerModuleCount}</div>

    <div><b>Assigned Modules:</b> ${assignedModuleCount}</div>

    <hr />

    <div><b>Browser:</b> ${navigator.userAgent}</div>
  `;
}

renderSystemHealth();