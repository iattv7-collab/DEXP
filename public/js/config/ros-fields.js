// public/js/config/ros-fields.js

export const ROS_FIELDS = {

  // Identity
  id: "id",
  roNumber: "roNumber",
  tagNumber: "tagNumber",

  // Vehicle
  vin: "vin",
  vinLast8: "vinLast8",
  year: "year",
  make: "make",
  model: "model",
  color: "color",

  // Customer
  customerName: "customerName",
  customerPhone: "customerPhone",
  customerEmail: "customerEmail",

  // Advisor / Staff
  advisorId: "advisorId",
  advisorName: "advisorName",
  advisorCompanyId: "advisorCompanyId",

  foremanId: "foremanId",
  foremanName: "foremanName",
  foremanCompanyId: "foremanCompanyId",

  techId: "techId",
  techName: "techName",
  techCompanyId: "techCompanyId",

  movedById: "movedById",
  movedByName: "movedByName",
  movedByCompanyId: "movedByCompanyId",

  washedById: "washedById",
  washedByName: "washedByName",
  washedByCompanyId: "washedByCompanyId",

  // Shared advisor coverage
  sharedWithAdvisorIds: "sharedWithAdvisorIds",
  sharedWithCompanyIds: "sharedWithCompanyIds",

    // Status
  status: "status",

  // Archive / lifecycle
  archivedAt: "archivedAt",
  archivedAtMs: "archivedAtMs",
  archivedBy: "archivedBy",
  archivedByName: "archivedByName",
  archivedByCompanyId: "archivedByCompanyId",
  archiveReason: "archiveReason",

    // Follow up
  followupStatus: "followupStatus",
  followupDueAtMs: "followupDueAtMs",
  followupCompletedAtMs: "followupCompletedAtMs",
  followupCompletedBy: "followupCompletedBy",
  followupCompletedByName: "followupCompletedByName",
  followupTextSentAtMs: "followupTextSentAtMs",

  // Location
  currentLocation: "currentLocation",
  locationArea: "locationArea",

  // Timing
  promiseTime: "promiseTime",
  nextUpdateTime: "nextUpdateTime",

  // Flags
  isWaiter: "isWaiter",
  hasLoaner: "hasLoaner",

  // Dealer
  dealerId: "dealerId",

  // Scanner
  scanSource: "scanSource",
  rawOcrText: "rawOcrText",

  // Metadata
  createdAt: "createdAt",
  updatedAt: "updatedAt",
  createdBy: "createdBy",
  updatedBy: "updatedBy"
};