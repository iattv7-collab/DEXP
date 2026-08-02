// public/js/shared/app-header.js

import { logoutUser } from "/js/services/firebase/auth-service.js";
import { clearSession, getSession } from "/js/core/session.js";

import {
  getCurrentDeviceNotificationPreferences,
  getCurrentNotificationStatus,
  unregisterCurrentDeviceForNotifications,
  updateCurrentDeviceNotificationPreferences,
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

  ensureNotificationSettingsStyles();

  const existingNotificationPanel = document.getElementById(
    "dexpNotificationSettingsPanel",
  );

  if (existingNotificationPanel) {
    existingNotificationPanel.remove();
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
      try {
        await toggleNotificationSettingsPanel(
          notificationStatusButton,
          refreshNotificationButton,
        );
      } catch (error) {
        console.error("Could not open notification settings:", error);

        alert("Could not open notification settings on this device.");
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

      try {
        await unregisterCurrentDeviceForNotifications();
      } catch (error) {
        console.error("Could not unregister this device before logout.", error);
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

async function toggleNotificationSettingsPanel(
  anchorButton,
  refreshNotificationButton,
) {
  const existingPanel = document.getElementById(
    "dexpNotificationSettingsPanel",
  );

  if (existingPanel) {
    existingPanel.remove();
    return;
  }

  const preferences = await getCurrentDeviceNotificationPreferences();

  const panel = document.createElement("div");

  panel.id = "dexpNotificationSettingsPanel";
  panel.className = "dexp-notification-settings-panel";

  panel.innerHTML = `
    <div class="dexp-notification-settings-title">
      This Device
    </div>

    <label class="dexp-notification-setting-row">
      <span>Notifications</span>

      <input
        id="deviceNotificationsEnabled"
        type="checkbox"
        ${preferences.notificationsEnabled ? "checked" : ""}
      />
    </label>

    <label class="dexp-notification-setting-row">
      <span>Sound</span>

      <input
        id="deviceSoundEnabled"
        type="checkbox"
        ${preferences.soundEnabled ? "checked" : ""}
      />
    </label>

    <label class="dexp-notification-setting-row">
      <span>Vibration</span>

      <input
        id="deviceVibrationEnabled"
        type="checkbox"
        ${preferences.vibrationEnabled ? "checked" : ""}
      />
    </label>

    <div
      id="deviceNotificationSettingsMessage"
      class="dexp-notification-settings-message"
    ></div>
  `;

  document.body.appendChild(panel);

  positionNotificationSettingsPanel(panel, anchorButton);

  const notificationsInput = document.getElementById(
    "deviceNotificationsEnabled",
  );

  const soundInput = document.getElementById("deviceSoundEnabled");

  const vibrationInput = document.getElementById("deviceVibrationEnabled");

  const message = document.getElementById("deviceNotificationSettingsMessage");

  function updateDependentControls() {
    const notificationsEnabled = Boolean(notificationsInput.checked);

    soundInput.disabled = !notificationsEnabled;

    vibrationInput.disabled = !notificationsEnabled;
  }

  async function saveSettings() {
    notificationsInput.disabled = true;
    soundInput.disabled = true;
    vibrationInput.disabled = true;

    message.textContent = "Saving...";

    try {
      const savedPreferences = await updateCurrentDeviceNotificationPreferences(
        {
          notificationsEnabled: notificationsInput.checked,

          soundEnabled: soundInput.checked,

          vibrationEnabled: vibrationInput.checked,
        },
      );

      notificationsInput.checked = savedPreferences.notificationsEnabled;

      soundInput.checked = savedPreferences.soundEnabled;

      vibrationInput.checked = savedPreferences.vibrationEnabled;

      message.textContent = "Saved for this device.";

      await refreshNotificationButton();
    } catch (error) {
      console.error("Could not save notification preferences:", error);

      message.textContent = "Could not save settings.";
    } finally {
      notificationsInput.disabled = false;

      updateDependentControls();
    }
  }

  notificationsInput.addEventListener("change", async () => {
    updateDependentControls();
    await saveSettings();
  });

  soundInput.addEventListener("change", saveSettings);

  vibrationInput.addEventListener("change", saveSettings);

  updateDependentControls();

  setTimeout(() => {
    document.addEventListener("click", function closeNotificationPanel(event) {
      if (panel.contains(event.target) || anchorButton.contains(event.target)) {
        return;
      }

      panel.remove();

      document.removeEventListener("click", closeNotificationPanel);
    });
  }, 0);
}

function positionNotificationSettingsPanel(panel, anchorButton) {
  const buttonRect = anchorButton.getBoundingClientRect();

  panel.style.top = `${Math.round(buttonRect.bottom + 8)}px`;

  panel.style.right = `${Math.max(
    12,
    Math.round(window.innerWidth - buttonRect.right),
  )}px`;
}

function ensureNotificationSettingsStyles() {
  if (document.getElementById("dexpNotificationSettingsStyles")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "dexpNotificationSettingsStyles";

  style.textContent = `
    .dexp-notification-settings-panel {
      position: fixed;
      z-index: 10000;
      width: 260px;
      padding: 14px;
      border: 1px solid #cfd6df;
      border-radius: 10px;
      background: #ffffff;
      box-shadow:
        0 12px 28px rgba(0, 0, 0, 0.18);
    }

    .dexp-notification-settings-title {
      margin-bottom: 10px;
      font-weight: 700;
    }

    .dexp-notification-setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 9px 0;
      border-top: 1px solid #edf0f3;
    }

    .dexp-notification-setting-row:first-of-type {
      border-top: 0;
    }

    .dexp-notification-setting-row input {
      width: 20px;
      height: 20px;
    }

    .dexp-notification-setting-row input:disabled {
      opacity: 0.45;
    }

    .dexp-notification-settings-message {
      min-height: 18px;
      margin-top: 8px;
      font-size: 12px;
      color: #4c5968;
    }
  `;

  document.head.appendChild(style);
}
