// public/pages/ro-tracker-settings/ro-tracker-settings-page.js

import { protectRoute } from "/js/core/router.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  loadROTrackerFollowupSettings,
  saveROTrackerFollowupSettings,
} from "/js/modules/ro-tracker/ro-tracker-followup-settings.js";

protectRoute();

const delayInput =
  document.getElementById("followUpDelayDays");

const timeInput =
  document.getElementById("followUpTime");

const templateInput =
  document.getElementById("smsTemplate");

const saveButton =
  document.getElementById("btnSaveSettings");

const backButton =
  document.getElementById("btnBackToROTracker");

window.addEventListener(
  "dexp-session-ready",
  initializePage,
);

function initializePage() {
  renderAppHeader({
    title: "RO Tracker Settings",
  });

  loadSettings();

  saveButton?.addEventListener(
    "click",
    handleSave,
  );

  backButton?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/pages/ro-tracker/index.html";
    },
  );
}

function loadSettings() {
  const settings =
    loadROTrackerFollowupSettings();

  delayInput.value =
    String(settings.followUpDelayDays || 3);

  timeInput.value =
    settings.followUpTime || "10:00";

  templateInput.value =
    settings.smsTemplate || "";
}

function handleSave() {
  saveROTrackerFollowupSettings({
    followUpDelayDays:
      Number(delayInput.value || 3),

    followUpTime:
      String(timeInput.value || "10:00"),

    smsTemplate:
      String(templateInput.value || ""),
  });

  alert("Settings saved.");
}