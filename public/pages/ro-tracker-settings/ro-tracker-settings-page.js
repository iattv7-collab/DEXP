// public/pages/ro-tracker-settings/ro-tracker-settings-page.js

import { protectRoute } from "/js/core/router.js";

import { renderAppHeader } from "/js/shared/app-header.js";

import {
  loadDealerFollowupSettings,
  saveDealerFollowupSettings,
} from "/js/modules/ro-tracker/ro-tracker-followup-settings.js?v=3";

protectRoute();

const delayInput = document.getElementById("followUpDelayDays");
const timeInput = document.getElementById("followUpTime");
const day2Input = document.getElementById("followUpDay2");
const time2Input = document.getElementById("followUpTime2");
const templateInput = document.getElementById("smsTemplate");
const saveButton = document.getElementById("btnSaveSettings");
const backButton = document.getElementById("btnBackToROTracker");

window.addEventListener("dexp-session-ready", initializePage);

async function initializePage() {
  renderAppHeader({
    title: "RO Tracker Settings",
  });

  await loadSettings();
  markClean();

  delayInput?.addEventListener("input", markDirty);
  timeInput?.addEventListener("input", markDirty);
  day2Input?.addEventListener("input", markDirty);
  time2Input?.addEventListener("input", markDirty);
  templateInput?.addEventListener("input", markDirty);

  saveButton?.addEventListener("click", handleSave);

  backButton?.addEventListener("click", () => {
    window.location.href = "/pages/ro-tracker/index.html";
  });
}

async function loadSettings() {
  const settings = await loadDealerFollowupSettings();

  delayInput.value = String(settings.followUpDelayDays ?? 3);
  timeInput.value = settings.followUpTime || "10:00";
  day2Input.value = String(settings.followUpDay2 ?? 0);
  time2Input.value = settings.followUpTime2 || "14:00";
  templateInput.value = settings.smsTemplate || "";
}

async function handleSave() {
  if (saveButton?.disabled) {
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    await saveDealerFollowupSettings({
      followUpDelayDays: Number(delayInput.value === "" ? 3 : delayInput.value),
      followUpTime: String(timeInput.value || "10:00"),
      followUpDay2: Number(day2Input.value || 0),
      followUpTime2: String(time2Input.value || "14:00"),
      smsTemplate: String(templateInput.value || ""),
    });

    markClean();
  } catch (error) {
    saveButton.disabled = false;
    saveButton.textContent = "Save Settings";
    alert(error?.message || "Could not save settings.");
  }
}

function markDirty() {
  if (!saveButton) {
    return;
  }

  saveButton.disabled = false;
  saveButton.textContent = "Save Settings";
}

function markClean() {
  if (!saveButton) {
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saved";
}