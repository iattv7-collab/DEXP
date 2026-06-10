// public/pages/wash-settings/wash-settings.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";

import { MODULES } from "/js/config/modules.js";

import {
  getWashSettings,
  updateWashSettings,
  setWashOpen
} from "/js/services/firestore/wash-settings-service.js";

protectRoute({
  allowedModules: [MODULES.WASH_SETTINGS]
});

const messageEl = document.getElementById("washSettingsMessage");

const saveButton = document.getElementById("saveWashSettingsBtn");

const fields = {
  washDurationMin: document.getElementById("washDurationMin"),
  bufferMin: document.getElementById("bufferMin"),
  openBays: document.getElementById("openBays"),
  autoStart: document.getElementById("autoStart"),

  mfBays: document.getElementById("mfBays"),
  satBays: document.getElementById("satBays"),
  sunBays: document.getElementById("sunBays"),

  mfOpen: document.getElementById("mfOpen"),
  mfClose: document.getElementById("mfClose"),

  satOpen: document.getElementById("satOpen"),
  satClose: document.getElementById("satClose"),

  sunOpen: document.getElementById("sunOpen"),
  sunClose: document.getElementById("sunClose")
};

const openWashButton = document.getElementById("openWashBtn");
const closeWashButton = document.getElementById("closeWashBtn");
const isOpenBadge = document.getElementById("isOpenBadge");

let savedSettings = null;

window.addEventListener("dexp-session-ready", () => {
  initializeWashSettings();
});

async function initializeWashSettings() {
  renderAppHeader({
    title: "Wash Settings"
  });

  bindEvents();

  await loadSettings();
}

function bindEvents() {
  Object.values(fields).forEach((field) => {
    if (!field) {
      return;
    }

    field.addEventListener("input", handleDirtyState);
    field.addEventListener("change", handleDirtyState);
  });

  saveButton.addEventListener("click", async () => {
    await handleSave();
  });

  openWashButton.addEventListener("click", async () => {
    await handleSetWashOpen(true);
  });

  closeWashButton.addEventListener("click", async () => {
    await handleSetWashOpen(false);
  });
}

async function loadSettings() {
  try {
    clearMessage();

    const settings = await getWashSettings();

    savedSettings = settings;

    applySettingsToForm(settings);

    setSaveDisabled(true);
  } catch (error) {
    console.error(error);

    showMessage("Could not load wash settings.");
  }
}

function applySettingsToForm(settings) {
  fields.washDurationMin.value = settings.washDurationMin ?? 15;
  fields.bufferMin.value = settings.bufferMin ?? 0;
  fields.openBays.value = settings.openBays ?? 0;
  fields.autoStart.checked = Boolean(settings.autoStart);

  fields.mfBays.value = settings.mfBays ?? 2;
  fields.satBays.value = settings.satBays ?? 1;
  fields.sunBays.value = settings.sunBays ?? 0;

  fields.mfOpen.value = settings.mfOpen || "07:30";
  fields.mfClose.value = settings.mfClose || "19:00";

  fields.satOpen.value = settings.satOpen || "08:00";
  fields.satClose.value = settings.satClose || "15:00";

  fields.sunOpen.value = settings.sunOpen || "00:00";
  fields.sunClose.value = settings.sunClose || "00:00";

  updateOpenClosedBadge(settings.isOpen);
}

function readSettingsFromForm() {
  return {
    washDurationMin: numberValue(fields.washDurationMin),
    bufferMin: numberValue(fields.bufferMin),
    openBays: numberValue(fields.openBays),
    autoStart: Boolean(fields.autoStart.checked),

    mfBays: numberValue(fields.mfBays),
    satBays: numberValue(fields.satBays),
    sunBays: numberValue(fields.sunBays),

    mfOpen: fields.mfOpen.value,
    mfClose: fields.mfClose.value,

    satOpen: fields.satOpen.value,
    satClose: fields.satClose.value,

    sunOpen: fields.sunOpen.value,
    sunClose: fields.sunClose.value
  };
}

async function handleSave() {
  try {
    clearMessage();

    const nextSettings = readSettingsFromForm();

    savedSettings = await updateWashSettings(nextSettings);

    applySettingsToForm(savedSettings);

    setSaveDisabled(true);

    showMessage("Wash settings saved.");
  } catch (error) {
    console.error(error);

    showMessage("Could not save wash settings.");
  }
}

async function handleSetWashOpen(isOpen) {
  try {
    clearMessage();

    savedSettings = await setWashOpen(isOpen);

    applySettingsToForm(savedSettings);

    setSaveDisabled(true);

    showMessage(isOpen ? "Wash day opened." : "Wash day closed.");
  } catch (error) {
    console.error(error);

    showMessage("Could not update wash day.");
  }
}

function handleDirtyState() {
  if (!savedSettings) {
    setSaveDisabled(true);
    return;
  }

  const current = readSettingsFromForm();

  const changed = Object.keys(current).some((key) => {
    return current[key] !== savedSettings[key];
  });

  setSaveDisabled(!changed);
}

function setSaveDisabled(disabled) {
  saveButton.disabled = Boolean(disabled);
}

function numberValue(input) {
  return Number(input.value || 0);
}

function updateOpenClosedBadge(isOpen) {
  isOpenBadge.textContent = isOpen ? "OPEN" : "CLOSED";

  openWashButton.disabled = Boolean(isOpen);
  closeWashButton.disabled = !Boolean(isOpen);
}

function showMessage(message) {
  messageEl.textContent = message;
}

function clearMessage() {
  messageEl.textContent = "";
}