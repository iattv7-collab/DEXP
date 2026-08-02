// public/js/config/notification-config.js
// Central configuration for DEXP notification alerts.

export const NOTIFICATION_SOUND_TYPES = {
  DEFAULT: "default",
  WAITER: "waiter",
  COMPLETE: "complete",
  ERROR: "error",
};

export const NOTIFICATION_CONFIG = {
  defaultSoundType: NOTIFICATION_SOUND_TYPES.DEFAULT,

  repeatCount: 2,
  repeatDelayMs: 1200,

  sounds: {
    [NOTIFICATION_SOUND_TYPES.DEFAULT]:
      "/assets/sounds/dexp-notification.wav",

    [NOTIFICATION_SOUND_TYPES.WAITER]:
      "/assets/sounds/dexp-waiter.wav",

    [NOTIFICATION_SOUND_TYPES.COMPLETE]:
      "/assets/sounds/dexp-complete.wav",

    [NOTIFICATION_SOUND_TYPES.ERROR]:
      "/assets/sounds/dexp-error.wav",
  },

  volume: {
    [NOTIFICATION_SOUND_TYPES.DEFAULT]: 1,
    [NOTIFICATION_SOUND_TYPES.WAITER]: 1,
    [NOTIFICATION_SOUND_TYPES.COMPLETE]: 0.9,
    [NOTIFICATION_SOUND_TYPES.ERROR]: 1,
  },

  vibration: {
    [NOTIFICATION_SOUND_TYPES.DEFAULT]:
      [250, 120, 250],

    [NOTIFICATION_SOUND_TYPES.WAITER]:
      [350, 150, 350],

    [NOTIFICATION_SOUND_TYPES.COMPLETE]:
      [180],

    [NOTIFICATION_SOUND_TYPES.ERROR]:
      [180, 100, 180],
  },

  eventSoundTypes: {
    waiter_alert:
      NOTIFICATION_SOUND_TYPES.WAITER,

    wash_complete:
      NOTIFICATION_SOUND_TYPES.COMPLETE,

    qc_complete:
      NOTIFICATION_SOUND_TYPES.COMPLETE,

    loaner_wash_complete:
      NOTIFICATION_SOUND_TYPES.COMPLETE,

    request_failed:
      NOTIFICATION_SOUND_TYPES.ERROR,

    move_failed:
      NOTIFICATION_SOUND_TYPES.ERROR,
  },
};

export function getNotificationSoundType(
  notification = {},
) {
  const eventType = String(
    notification.eventType || "",
  )
    .trim()
    .toLowerCase();

  return (
    NOTIFICATION_CONFIG.eventSoundTypes[eventType] ||
    NOTIFICATION_CONFIG.defaultSoundType
  );
}

export function getNotificationSoundPath(
  notification = {},
) {
  const soundType =
    getNotificationSoundType(notification);

  return (
    NOTIFICATION_CONFIG.sounds[soundType] ||
    NOTIFICATION_CONFIG.sounds[
      NOTIFICATION_CONFIG.defaultSoundType
    ]
  );
}

export function getNotificationVolume(
  notification = {},
) {
  const soundType =
    getNotificationSoundType(notification);

  const volume =
    NOTIFICATION_CONFIG.volume[soundType];

  return typeof volume === "number"
    ? volume
    : 1;
}

export function getNotificationVibration(
  notification = {},
) {
  const soundType =
    getNotificationSoundType(notification);

  return (
    NOTIFICATION_CONFIG.vibration[soundType] ||
    NOTIFICATION_CONFIG.vibration[
      NOTIFICATION_CONFIG.defaultSoundType
    ]
  );
}