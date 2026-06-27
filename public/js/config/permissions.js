// public/js/config/permissions.js
// Central permission keys for DEXP.
// Roles can be fixed or custom later, but permissions should stay consistent.

export const PERMISSIONS = {
  ADMIN_USERS_VIEW: "admin.users.view",
  ADMIN_USERS_APPROVE: "admin.users.approve",
  ADMIN_USERS_EDIT_ROLE: "admin.users.editRole",
  ADMIN_USERS_SET_ACTIVE: "admin.users.setActive",

  DEALER_PROFILE_VIEW: "dealer.profile.view",
  DEALER_PROFILE_EDIT: "dealer.profile.edit",

  MASTER_RO_VIEW: "masterRo.view",
  MASTER_RO_CREATE: "masterRo.create",
  MASTER_RO_EDIT: "masterRo.edit",

  SCANNER_RO_USE: "scannerRo.use",

  MOVE_LOCATE_VIEW: "moveLocate.view",
  MOVE_LOCATE_MOVE: "moveLocate.move",
  MOVE_LOCATE_REQUEST: "moveLocate.request",

  RO_TRACKER_VIEW: "roTracker.view",
  RO_TRACKER_EDIT: "roTracker.edit",

  OPERATIONS_VIEW: "operations.view",

  // Legacy notification engine permissions. Keep for backend/internal use.
  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage",
  // Wash
  WASH_SEND: "wash.send",
  WASH_START: "wash.start",
  WASH_COMPLETE: "wash.complete",
  WASH_REMOVE: "wash.remove",
  WASH_REWASH_REQUEST: "wash.rewash.request",
  WASH_NEED_BY_SET: "wash.needBy.set",
  WASH_WAITER_SET: "wash.waiter.set",

  // Booking
  BOOKING_CP_MARK: "booking.cp.mark",
  BOOKING_CP_CLEAR: "booking.cp.clear",
  BOOKING_WTY_MARK: "booking.wty.mark",
  BOOKING_WTY_CLEAR: "booking.wty.clear",

  // QC
  QC_REQUEST: "qc.request",
  QC_NO_QC: "qc.noQc",
  QC_START: "qc.start",
  QC_RELEASE: "qc.release",
  QC_COMPLETE: "qc.complete",
  QC_REOPEN: "qc.reopen",

  // Pickup
  PICKUP_REQUEST: "pickup.request",
  PICKUP_CLAIM: "pickup.claim",
  PICKUP_COMPLETE: "pickup.complete",
};
