// public/pages/move-locate/move-locate-location.js

import { ROS_FIELDS } from "/js/config/ros-fields.js";
import { getDealerROs, updateROLocation } from "/js/services/firestore/ros-service.js";
import { normalizeTag, formatAreaLot } from "./move-locate-helpers.js";
import { getROTag, getROArea, getROLot, findROByTag, buildBlockedByChain } from "./move-locate-move.js";

export async function saveVehicleLocation({ ro, area, lot, blockingTag }) {
  console.log("saveVehicleLocation", { tag: getROTag(ro), area, lot, blockingTag });
  const tag = getROTag(ro);
  const cleanBlocking = normalizeTag(blockingTag);

  if (!area || !lot) {
    throw new Error("Select the area and lot.");
  }
  if (cleanBlocking && cleanBlocking === tag) {
    throw new Error("A vehicle cannot block itself.");
  }

  await clearCarsBlockedByTag(tag);

  await updateROLocation(ro.id, {
    [ROS_FIELDS.currentLocation]: lot,
    currentLocation: lot,
    currentLocationArea: area,
    locationUpdatedAt: Date.now(),
  }, {
    eventType: "location_updated",
    module: "move-locate",
    message: `Location updated to ${formatAreaLot(area, lot)}`,
  });

  if (cleanBlocking && await blockedCarIsInLot(cleanBlocking, area, lot)) {
    await saveBlockingRelationship({
      blockerRO: { ...ro, currentLocation: lot, currentLocationArea: area },
      blockedTag: cleanBlocking,
      area,
      lot,
    });
  }
}

async function blockedCarIsInLot(tag, area, lot) {
  const freshROs = await getDealerROs();
  const blockedRO = findROByTag(tag, freshROs);
  if (!blockedRO?.id) return false;
  return getROArea(blockedRO) === area && getROLot(blockedRO) === lot;
}

async function saveBlockingRelationship({ blockerRO, blockedTag, area, lot }) {
  const blockerTag = getROTag(blockerRO);
  const cleanBlockedTag = normalizeTag(blockedTag);
  if (!cleanBlockedTag) return;
  if (cleanBlockedTag === blockerTag) {
    throw new Error("A vehicle cannot block itself.");
  }

  const freshROs = await getDealerROs();
  const blockedRO = findROByTag(cleanBlockedTag, freshROs);
  if (!blockedRO?.id) {
    throw new Error(`Blocking tag ${cleanBlockedTag} was not found.`);
  }

  const blockedArea = getROArea(blockedRO);
  const blockedLot = getROLot(blockedRO);
  if (blockedArea && blockedArea !== area) {
    throw new Error(`Blocking tag ${cleanBlockedTag} is not in the same area.`);
  }
  if (blockedLot && blockedLot !== lot) {
    throw new Error(`Blocking tag ${cleanBlockedTag} is not in the same lot.`);
  }

  const blockerChain = buildBlockedByChain(blockerRO, freshROs);
  if (blockerChain.includes(cleanBlockedTag)) {
    throw new Error("This would create a circular blocking chain.");
  }

  await updateROLocation(blockedRO.id, {
    currentLocation: blockedRO.currentLocation || "",
    currentLocationArea: blockedRO.currentLocationArea || "",
    locationUpdatedAt: Date.now(),
    blockedByTag: blockerTag,
  }, {
    eventType: "vehicle_blocked",
    module: "move-locate",
    message: `${cleanBlockedTag} is blocked by ${blockerTag}`,
  });
}

async function clearCarsBlockedByTag(tag) {
  const currentTag = normalizeTag(tag);
  if (!currentTag) return;
  const freshROs = await getDealerROs();
  const blockedCars = freshROs.filter((ro) => normalizeTag(ro.blockedByTag || "") === currentTag);
  for (const blockedCar of blockedCars) {
    await updateROLocation(blockedCar.id, {
      currentLocation: blockedCar.currentLocation || "",
      currentLocationArea: blockedCar.currentLocationArea || "",
      locationUpdatedAt: Date.now(),
      blockedByTag: "",
    }, {
      eventType: "blocked_by_cleared",
      module: "move-locate",
      message: `Blocked by tag ${currentTag} cleared because blocker moved`,
    });
  }
}