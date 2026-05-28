// public/js/modules/ro-tracker/ro-tracker-followup-settings.js

const STORAGE_KEY =
  "dexp_ro_tracker_followup_settings";

export function loadROTrackerFollowupSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return getDefaultSettings();
    }

    return {
      ...getDefaultSettings(),
      ...JSON.parse(raw),
    };
  } catch {
    return getDefaultSettings();
  }
}

export function saveROTrackerFollowupSettings(
  settings = {},
) {
  const merged = {
    ...getDefaultSettings(),
    ...settings,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(merged),
  );

  return merged;
}

export function getDefaultSettings() {
  return {
    followUpDelayDays: 3,
    followUpTime: "10:00",

    smsTemplate:
      "Hello {firstName}, just following up regarding your recent service visit for RO {ro}. Please let us know if you need anything.",
  };
}