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

  NOTIFICATIONS_VIEW: "notifications.view",
  NOTIFICATIONS_MANAGE: "notifications.manage"
};