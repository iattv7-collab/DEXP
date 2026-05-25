// public/js/config/modules.js

import { PERMISSIONS } from "./permissions.js";

export const MODULES = {
  SCANNER_RO: "scanner-ro",
  MASTER_RO: "master-ro",
  RO_TRACKER: "ro-tracker",
  MOVE_LOCATE: "move-locate",
  REQUESTS: "requests",
  ADVISOR: "advisor",
  VALET: "valet",
  WASH: "wash",
  LOANER_FLEET: "loaner-fleet",
  LOANER_RETURNS: "loaner-returns",
  MANAGER: "manager",
  ADMIN: "admin",
  SEND_TO_WASH: "send-to-wash",
  WASH_SETTINGS: "wash-settings",
  LOCATION_SETTINGS: "location-settings",
  BOOKER: "booker",
  QC: "qc",
  FOREMAN: "foreman",
  TECH: "tech",
  ARCHIVE: "archive",
  DETAILS: "details",
  SHOP: "shop",
  NOTIFICATIONS: "notifications"
};

export const MODULE_CONFIG = {
  [MODULES.SCANNER_RO]: {
    label: "Scanner RO",
    route: "/pages/scanner-ro/index.html",
    icon: "document_scanner",
    permission: PERMISSIONS.SCANNER_RO_USE
  },

  [MODULES.MOVE_LOCATE]: {
    label: "Move & Locate",
    route: "/pages/move-locate/move-locate.html",
    icon: "location_on",
    permission: PERMISSIONS.MOVE_LOCATE_VIEW
  },

  [MODULES.REQUESTS]: {
    label: "Requests",
    route: "/pages/requests/requests.html",
    icon: "notifications_active",
    permission: PERMISSIONS.MOVE_LOCATE_REQUEST
  },

  [MODULES.ADVISOR]: {
    label: "Advisor",
    route: "/pages/advisor/advisor.html",
    icon: "support_agent",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.VALET]: {
    label: "Valet",
    route: "/pages/valet/valet.html",
    icon: "directions_car",
    permission: PERMISSIONS.MOVE_LOCATE_MOVE
  },

  [MODULES.WASH]: {
    label: "Wash",
    route: "/pages/wash/wash.html",
    icon: "local_car_wash",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.LOANER_FLEET]: {
    label: "Loaner Fleet",
    route: "/pages/loaner-fleet/loaner-fleet.html",
    icon: "garage",
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.LOANER_RETURNS]: {
    label: "Loaner Returns",
    route: "/pages/loaner-returns/loaner-returns.html",
    icon: "keyboard_return",
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.MANAGER]: {
    label: "Manager",
    route: "/pages/manager/manager.html",
    icon: "manage_accounts",
    permission: PERMISSIONS.MASTER_RO_EDIT
  },

  [MODULES.ADMIN]: {
    label: "Admin",
    route: "/pages/admin/admin.html",
    icon: "admin_panel_settings",
    adminOnly: true,
    permission: PERMISSIONS.ADMIN_USERS_VIEW
  },

  [MODULES.SEND_TO_WASH]: {
    label: "Send to Wash",
    route: "/pages/send-to-wash/send-to-wash.html",
    icon: "send",
    permission: PERMISSIONS.RO_TRACKER_EDIT
  },

  [MODULES.WASH_SETTINGS]: {
    label: "Wash Settings",
    route: "/pages/wash-settings/wash-settings.html",
    icon: "settings",
    permission: PERMISSIONS.DEALER_PROFILE_EDIT
  },

  [MODULES.LOCATION_SETTINGS]: {
    label: "Location Settings",
    route: "/pages/location-settings/location-settings.html",
    icon: "settings",
    permission: PERMISSIONS.DEALER_PROFILE_EDIT
  },

  [MODULES.BOOKER]: {
    label: "Booker",
    route: "/pages/booker/booker.html",
    icon: "event_note",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.QC]: {
    label: "QC",
    route: "/pages/qc/qc.html",
    icon: "fact_check",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.MASTER_RO]: {
    label: "Master RO",
    route: "/pages/master-ro/index.html",
    icon: "table_chart",
    adminOnly: true,
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.ARCHIVE]: {
    label: "Archive",
    route: "/pages/archive/archive.html",
    icon: "archive",
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.RO_TRACKER]: {
    label: "RO Tracker",
    route: "/pages/ro-tracker/index.html",
    icon: "assignment",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.FOREMAN]: {
    label: "Foreman",
    route: "/pages/foreman/foreman.html",
    icon: "engineering",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.TECH]: {
    label: "Tech",
    route: "/pages/tech/tech.html",
    icon: "build",
    permission: PERMISSIONS.RO_TRACKER_VIEW
  },

  [MODULES.DETAILS]: {
    label: "Details",
    route: "/pages/details/details.html",
    icon: "auto_awesome",
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.SHOP]: {
    label: "Shop",
    route: "/pages/shop/shop.html",
    icon: "build",
    permission: PERMISSIONS.MASTER_RO_VIEW
  },

  [MODULES.NOTIFICATIONS]: {
    label: "Notifications",
    route: "/pages/notifications/notifications.html",
    icon: "notifications",
    permission: PERMISSIONS.NOTIFICATIONS_VIEW
  }
};

export const CORE_MODULES = [
  MODULES.MASTER_RO,
  MODULES.RO_TRACKER,
  MODULES.NOTIFICATIONS,
  MODULES.ADMIN
];