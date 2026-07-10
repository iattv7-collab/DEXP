// public/js/config/modules.js

import { PERMISSIONS } from "./permissions.js";

export const MODULES = {
  PLATFORM_ADMIN: "platform-admin",

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
  COMPANY_PROFILE: "company-profile",
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
  OPERATIONS: "operations"
};

export const MODULE_CONFIG = {
  [MODULES.PLATFORM_ADMIN]: {
    label: "Platform Admin",
    route: "/pages/platform-admin/platform-admin.html",
    icon: "shield",
    permission: PERMISSIONS.ADMIN_USERS_VIEW
  },

  [MODULES.SCANNER_RO]: {
    label: "Scan RO",
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
    permission: PERMISSIONS.ADMIN_USERS_VIEW
  },

  [MODULES.COMPANY_PROFILE]: {
    label: "Company Profile",
    route: "/pages/company-profile/company-profile.html",
    icon: "business",
    permission: PERMISSIONS.DEALER_PROFILE_EDIT
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
    route: "/pages/tech/index.html",
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

    [MODULES.OPERATIONS]: {
    label: "Operations",
    route: "/pages/operations/operations.html",
    icon: "monitoring",
    permission: PERMISSIONS.OPERATIONS_VIEW
  }
};

export const CORE_REQUIRED_MODULES = [
  MODULES.ADMIN,
  MODULES.COMPANY_PROFILE,
  MODULES.MASTER_RO,
  MODULES.ARCHIVE,
  MODULES.SCANNER_RO
];

export const SELLABLE_MODULE_GROUPS = [
  {
    id: "ro-tracker",
    label: "RO Tracker",
    modules: [
      MODULES.RO_TRACKER,
      MODULES.ADVISOR,
      MODULES.MANAGER
    ]
  },

  {
    id: "booker",
    label: "Booker",
    modules: [
      MODULES.BOOKER
    ]
  },

  {
    id: "qc",
    label: "QC",
    modules: [
      MODULES.QC
    ]
  },

  {
    id: "dispatch",
    label: "Dispatch",
    modules: [
      MODULES.FOREMAN,
      MODULES.TECH
    ]
  },

  {
    id: "move-locate",
    label: "Move & Locate",
    modules: [
      MODULES.MOVE_LOCATE,
      MODULES.REQUESTS,
      MODULES.VALET,
      MODULES.LOCATION_SETTINGS
    ]
  },

  {
    id: "wash",
    label: "Wash",
    modules: [
      MODULES.WASH,
      MODULES.SEND_TO_WASH,
      MODULES.WASH_SETTINGS
    ]
  },

  {
    id: "loaners",
    label: "Loaners",
    modules: [
      MODULES.LOANER_FLEET,
      MODULES.LOANER_RETURNS
    ]
  },

  {
    id: "details",
    label: "Details",
    modules: [
      MODULES.DETAILS
    ]
  },

  {
    id: "shop",
    label: "Shop",
    modules: [
      MODULES.SHOP
    ]
  },

  {
    id: "notifications",
    label: "Notifications",
    modules: [
      MODULES.OPERATIONS
    ]
  }
];