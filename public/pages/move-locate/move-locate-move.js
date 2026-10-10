// public/pages/move-locate/move-locate-move.js

import { ROS_FIELDS } from "/js/config/ros-fields.js";

import { normalizeTag } from "./move-locate-helpers.js";

export function getROTag(ro) {
  return normalizeTag(ro?.[ROS_FIELDS.tagNumber] || ro?.tagNumber || "");
}

export function getROArea(ro) {
  return String(ro?.currentLocationArea || ro?.area || "").trim();
}

export function getROLot(ro) {
  return String(
    ro?.[ROS_FIELDS.currentLocation] ||
    ro?.currentLocation ||
    ro?.location ||
    "",
  ).trim();
}

export function findROByTag(tag, ros = []) {
  const cleanTag = normalizeTag(tag);

  return ros.find((ro) => {
    return getROTag(ro) === cleanTag;
  });
}

export function buildMoveGroup(ro, ros = []) {
  const blockedByChain = buildBlockedByChain(ro, ros);

  const blockerTagsInMoveOrder = [...blockedByChain].reverse();

  const blockerROs = blockerTagsInMoveOrder
    .map((tag) => findROByTag(tag, ros))
    .filter((item) => item?.id);

  return [...blockerROs, ro];
}

export function buildBlockedByChain(ro, ros = []) {
  const chain = [];
  const visited = new Set();

  let nextTag = normalizeTag(ro?.blockedByTag || "");

  while (nextTag) {
    if (visited.has(nextTag)) {
      break;
    }

    visited.add(nextTag);
    chain.push(nextTag);

    const blockerRO = findROByTag(nextTag, ros);

    if (!blockerRO) {
      break;
    }

    nextTag = normalizeTag(blockerRO.blockedByTag || "");
  }

  return chain;
}