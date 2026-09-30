// public/pages/move-locate/move-locate-my-moves.js
// My open moves list + leave-screen nag stamp.
// Does not replace move-locate.js.

import { getSession } from "/js/core/session.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";
import { updateRO } from "/js/services/firestore/ros-service.js";
import { formatAreaLot, formatDateTime, escapeHtml } from "./move-locate-helpers.js";

const STALE_MOVE_MS = 20 * 60 * 1000;

export function getOwnedMovingROs(ros = [], uid = "") {
  const ownerUid = String(uid || getSession()?.uid || "").trim();
  if (!ownerUid) {
    return [];
  }

  return ros
    .filter((ro) => {
      return (
        ro?.moveStatus === "moving" &&
        String(ro.moveStartedByUid || "").trim() === ownerUid
      );
    })
    .sort((a, b) => Number(a.moveStartedAt || 0) - Number(b.moveStartedAt || 0));
}

export function hasOwnedOpenMove(ros = [], uid = "") {
  return getOwnedMovingROs(ros, uid).length > 0;
}

export function findBlockingOwnedMove(ros = [], nextRO = {}, uid = "") {
  const ownerUid = String(uid || getSession()?.uid || "").trim();
  const nextId = String(nextRO?.id || "");
  const nextGroup = String(nextRO?.moveGroupId || "");

  return getOwnedMovingROs(ros, ownerUid).find((ro) => {
    if (ro.id === nextId) {
      return false;
    }
    if (nextGroup && String(ro.moveGroupId || "") === nextGroup) {
      return false;
    }
    return true;
  });
}

export function renderMyMovesList({
  listEl,
  ros = [],
  getROArea,
  getROLot,
  getROTag,
  onResume,
}) {
  if (!listEl) {
    return;
  }

  const mine = getOwnedMovingROs(ros);
  listEl.innerHTML = "";

  if (!mine.length) {
    const empty = document.createElement("p");
    empty.className = "tool-help";
    empty.textContent = "No open moves on your login.";
    listEl.appendChild(empty);
    return;
  }

  mine.forEach((ro) => {
    const startedAt = Number(ro.moveStartedAt || 0);
    const stale = startedAt > 0 && Date.now() - startedAt >= STALE_MOVE_MS;
    const tag = getROTag(ro) || "—";
    const area = getROArea ? getROArea(ro) : ro.currentLocationArea || "";
    const lot = getROLot ? getROLot(ro) : ro.currentLocation || "";

    const row = document.createElement("button");
    row.type = "button";
    row.className = "small-button";
    row.style.cssText =
      "display:block;width:100%;text-align:left;margin:0 0 8px;padding:10px 12px;";
    row.dataset.tag = tag;
    row.dataset.roId = ro.id || "";

    row.innerHTML = `
      <div><b>Tag ${escapeHtml(tag)}</b> · RO ${escapeHtml(ro[ROS_FIELDS.roNumber] || ro.roNumber || "")}</div>
      <div class="tool-help" style="margin:4px 0 0;">
        ${escapeHtml(formatAreaLot(area, lot) || "No lot saved")}
        · started ${escapeHtml(formatDateTime(startedAt) || "—")}
        ${stale ? " · STALE — finish or override" : ""}
      </div>
    `;

    row.addEventListener("click", () => {
      if (typeof onResume === "function") {
        onResume(tag);
      }
    });

    listEl.appendChild(row);
  });
}

export async function stampOwnedMovesLeft(ros = []) {
  const mine = getOwnedMovingROs(ros).filter((ro) => !ro.finishMoveLeftAtMs);

  for (const ro of mine) {
    try {
      await updateRO(
        ro.id,
        {
          finishMoveLeftAtMs: Date.now(),
        },
        {
          eventType: "move_left_unsaved",
          module: "move-locate",
          message: "Left Move & Locate with unsaved move",
        },
      );
    } catch (error) {
      console.error("Could not stamp leave for move nag:", error);
    }
  }
}

export function wireLeaveMoveNag({ getROs }) {
  const markLeft = () => {
    const ros = typeof getROs === "function" ? getROs() : [];
    stampOwnedMovesLeft(ros);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      markLeft();
    }
  });

  window.addEventListener("pagehide", markLeft);
}
