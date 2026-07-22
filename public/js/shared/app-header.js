// public/js/shared/app-header.js

import { logoutUser } from "/js/services/firebase/auth-service.js";
import { clearSession, getSession } from "/js/core/session.js";

import {
  getCurrentNotificationStatus,
  registerCurrentDeviceForNotifications,
} from "/js/services/firebase/messaging-service.js";

import { watchArchivedROs } from "/js/services/firestore/ros-service.js";

let unsubscribeHeaderFollowUps = null;

export function renderAppHeader(options = {}) {
  const { showHome = true, platformMode = false } = options;

  const session = getSession();

  const dealerName = platformMode
    ? "DEXP Platform"
    : session?.dealerName ||
      session?.dealer?.name ||
      session?.dealerId ||
      "Dealer";

  const userName = session?.displayName || session?.email || "";

  const roleMap = {
    advisor: "Advisor",
    admin: "Admin",
    "platform-admin": "Platform Admin",
    manager: "Manager",
    foreman: "Foreman",
    tech: "Technician",
    wash: "Wash",
    valet: "Valet",
    qc: "QC",
    booker: "Booker",
    pending: "Pending",
  };

  const roleLabel = platformMode
    ? "Owner Console"
    : roleMap[session?.role] || session?.role || "";

  const showFollowUpCounter =
    !platformMode && session?.role === "advisor" && Boolean(session?.uid);

  const header = document.createElement("header");
  header.id = "appHeader";

  header.innerHTML = `
    <div class="app-header-left">

      <button
        id="dexpLogoButton"
        type="button"
        class="app-logo-button"
      >
        <img
          src="/assets/dexp-header-logo-blue.png"
          alt="DEXP"
          class="app-header-logo-image"
        />
      </button>

      <div class="app-header-divider">|</div>

      <div class="app-header-info">
        <h1>${dealerName}</h1>
        <p>${userName}${roleLabel ? ` • ${roleLabel}` : ""}</p>
      </div>

    </div>

    <nav class="app-header-nav">

      ${
        showHome
          ? `
            <button
              id="homeButton"
              type="button"
            >
              Home
            </button>
          `
          : ""
      }

      ${
        showFollowUpCounter
          ? `
            <button
              id="roReminderCounterButton"
              type="button"
              title="Due RO follow-ups"
            >
              Follow Ups
              (<span id="roReminderCounter">0</span>)
            </button>
          `
          : ""
      }

      <button
        id="notificationStatusButton"
        type="button"
        title="Checking notification status..."
      >
        Notifications
      </button>

      <button
        id="logoutButton"
        type="button"
      >
        Sign Out
      </button>

    </nav>
  `;

  const existingHeader = document.getElementById("appHeader");

  if (existingHeader) {
    existingHeader.replaceWith(header);
  } else {
    document.body.prepend(header);
  }

  const dexpLogoButton = document.getElementById("dexpLogoButton");

  if (dexpLogoButton) {
    dexpLogoButton.addEventListener("click", () => {
      if (platformMode) {
        window.location.href = "/pages/platform-admin/platform-admin.html";
        return;
      }

      window.location.href = "/pages/dashboard/index.html";
    });
  }

  const homeButton = document.getElementById("homeButton");

  if (homeButton) {
    homeButton.addEventListener("click", () => {
      if (platformMode) {
        window.location.href = "/pages/platform-admin/platform-admin.html";
        return;
      }

      window.location.href = "/pages/dashboard/index.html";
    });
  }

  const roReminderCounterButton = document.getElementById(
    "roReminderCounterButton",
  );

  const roReminderCounter = document.getElementById("roReminderCounter");

  if (roReminderCounterButton) {
    roReminderCounterButton.addEventListener("click", () => {
      window.location.href = "/pages/ro-followup/index.html";
    });
  }

  if (unsubscribeHeaderFollowUps) {
    unsubscribeHeaderFollowUps();
    unsubscribeHeaderFollowUps = null;
  }

  if (showFollowUpCounter && roReminderCounterButton && roReminderCounter) {
    unsubscribeHeaderFollowUps = watchArchivedROs((archivedROs) => {
      const now = Date.now();

      const dueFollowUps = (
        Array.isArray(archivedROs) ? archivedROs : []
      ).filter((ro) => {
        const followupStatus = String(ro.followupStatus || "")
          .trim()
          .toLowerCase();

        const followupDueAtMs = Number(ro.followupDueAtMs || 0);

        return (
          followupStatus === "pending" &&
          followupDueAtMs > 0 &&
          followupDueAtMs <= now
        );
      });

      const count = dueFollowUps.length;

      roReminderCounter.textContent = String(count);

      roReminderCounterButton.title =
        count === 1 ? "1 due RO follow-up" : `${count} due RO follow-ups`;
    }, session.uid);
  }

  const notificationStatusButton = document.getElementById(
    "notificationStatusButton",
  );

  async function refreshNotificationButton() {
    if (!notificationStatusButton) {
      return;
    }

    const status = await getCurrentNotificationStatus();

    notificationStatusButton.textContent = status.label;
    notificationStatusButton.title = status.title;
  }

  if (notificationStatusButton) {
    refreshNotificationButton();

    notificationStatusButton.addEventListener("click", async () => {
      notificationStatusButton.disabled = true;
      notificationStatusButton.textContent = "Checking...";

      try {
        await registerCurrentDeviceForNotifications();
        await refreshNotificationButton();
      } catch (error) {
        console.error("Could not update notification status:", error);

        alert("Could not update notification status on this device.");
      } finally {
        notificationStatusButton.disabled = false;
      }
    });
  }

  const logoutButton = document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      const logoutDealerId = platformMode ? "" : session?.dealerId || "";

      if (logoutDealerId) {
        sessionStorage.setItem("dexp_last_dealer_id", logoutDealerId);

        localStorage.setItem("dexp_last_dealer_id", logoutDealerId);
      }

      if (unsubscribeHeaderFollowUps) {
        unsubscribeHeaderFollowUps();
        unsubscribeHeaderFollowUps = null;
      }

      clearSession();

      sessionStorage.removeItem("dexp_platform_selected_dealer");

      await logoutUser();

      if (platformMode) {
        window.location.href = "/pages/auth/platform-login.html";
        return;
      }

      if (logoutDealerId) {
        window.location.href = `/pages/auth/login.html?dealerId=${encodeURIComponent(
          logoutDealerId,
        )}`;

        return;
      }

      window.location.href = "/pages/auth/login.html";
    });
  }
}
