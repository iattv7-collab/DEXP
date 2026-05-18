// public/js/config/modules.js

export const MODULES = {
  SCANNER_RO: "scanner-ro",
  MASTER_RO: "master-ro",
  RO_TRACKER: "ro-tracker",
  MOVE_LOCATE: "move-locate",
  LOCATION_SETTINGS: "location-settings",
  REQUESTS: "requests",
  LOANERS: "loaners",
  WASH: "wash",
  RETURNS: "returns",
  DETAILS: "details",
  SHOP: "shop",
  NOTIFICATIONS: "notifications",
  ADMIN: "admin"
};

export const MODULE_CONFIG = {
  [MODULES.SCANNER_RO]: {
    label: "Scanner RO",
    route: "/pages/scanner-ro/index.html",
    icon: "document_scanner"
  },

  [MODULES.MASTER_RO]: {
    label: "Master RO",
    route: "/pages/master-ro/index.html",
    icon: "table_chart",
    adminOnly: true
  },

  [MODULES.RO_TRACKER]: {
    label: "RO Tracker",
    route: "/pages/ro-tracker/index.html",
    icon: "assignment"
  },

  [MODULES.MOVE_LOCATE]: {
    label: "Move & Locate",
    route: "/pages/move-locate/move-locate.html",
    icon: "location_on"
  },

  [MODULES.LOCATION_SETTINGS]: {
    label: "Location Settings",
    route: "/pages/location-settings/location-settings.html",
    icon: "settings"
  },

  [MODULES.REQUESTS]: {
    label: "Requests",
    route: "/pages/requests/requests.html",
    icon: "notifications_active"
  },

  [MODULES.LOANERS]: {
    label: "Loaners",
    route: "/pages/loaners/loaners.html",
    icon: "directions_car"
  },

  [MODULES.WASH]: {
    label: "Wash",
    route: "/pages/wash/wash.html",
    icon: "local_car_wash"
  },

  [MODULES.RETURNS]: {
    label: "Returns",
    route: "/pages/returns/returns.html",
    icon: "keyboard_return"
  },

  [MODULES.DETAILS]: {
    label: "Details",
    route: "/pages/details/details.html",
    icon: "auto_awesome"
  },

  [MODULES.SHOP]: {
    label: "Shop",
    route: "/pages/shop/shop.html",
    icon: "build"
  },

  [MODULES.NOTIFICATIONS]: {
    label: "Notifications",
    route: "/pages/notifications/notifications.html",
    icon: "notifications"
  },

  [MODULES.ADMIN]: {
    label: "Admin",
    route: "/pages/admin/admin.html",
    icon: "admin_panel_settings",
    adminOnly: true
  }
};

export const CORE_MODULES = [
  MODULES.MASTER_RO,
  MODULES.RO_TRACKER,
  MODULES.NOTIFICATIONS,
  MODULES.ADMIN
];
