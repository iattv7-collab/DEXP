// public/js/config/ros-statuses.js

export const ROS_STATUS = {

  // Intake
  NEW: "new",
  CHECKED_IN: "checked-in",

  // Shop
  WAITING_FOR_FOREMAN: "waiting-for-foreman",
  ASSIGNED_TO_TECH: "assigned-to-tech",
  IN_SERVICE: "in-service",
  TECH_COMPLETE: "tech-complete",

  // QC / Wash
  QC: "qc",
  READY_FOR_WASH: "ready-for-wash",
  IN_WASH: "in-wash",
  WASH_COMPLETE: "wash-complete",

  // Delivery
  READY_FOR_PICKUP: "ready-for-pickup",
  CUSTOMER_PICKUP_REQUESTED: "customer-pickup-requested",
  DELIVERED: "delivered",

  // Holds
  WAITING_FOR_PARTS: "waiting-for-parts",
  WAITING_FOR_APPROVAL: "waiting-for-approval",

  // Final
  CLOSED: "closed",
  ARCHIVED: "archived"
};