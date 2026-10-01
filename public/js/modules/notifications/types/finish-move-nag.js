// public/js/modules/notifications/types/finish-move-nag.js
// One tag per moving RO. Replace + pulse. Do not stack.

export const FINISH_MOVE_NAG_EVENT = "finish_move_nag";

export function isFinishMoveNagNotification(notification = {}) {
  return String(notification.eventType || "").trim() === FINISH_MOVE_NAG_EVENT;
}

export function finishMoveNagUpdatedAt(notification = {}) {
  return Number(notification.updatedAtMs || notification.createdAtMs || 0);
}
