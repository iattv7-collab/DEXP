// public/pages/move-locate/move-locate-my-moves.js
// My open moves list + leave-screen nag stamp.

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "/js/services/firebase/firestore.js";
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
    const tag = getROTag(ro) || ro.tagNumber || "—";
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

export function startOwnedMovesWatch({
  listEl,
  getROArea,
  getROLot,
  getROTag,
  onResume,
}) {
  const session = getSession();

  if (!session?.dealerId || !session?.uid || !listEl) {
    return () => {};
  }

  const q = query(
    collection(db, "ros"),
    where("dealerId", "==", session.dealerId),
    where("moveStatus", "==", "moving"),
    where("moveStartedByUid", "==", session.uid),
    limit(50),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const ros = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: data.id || docSnap.id,
          ...data,
        };
      });

      renderMyMovesList({
        listEl,
        ros,
        getROArea,
        getROLot,
        getROTag,
        onResume,
      });
    },
    (error) => {
      console.error("My Moves watch failed:", error);
      listEl.innerHTML =
        '<p class="tool-help">Could not load My Moves. Check console for a Firestore index link.</p>';
    },
  );
}

export async function stampOwnedMovesLeft(ros = []) {
  const session = getSession();
  let mine = getOwnedMovingROs(ros);

  if (!mine.length && session?.dealerId && session?.uid) {
    const snapshot = await getDocs(
      query(
        collection(db, "ros"),
        where("dealerId", "==", session.dealerId),
        where("moveStatus", "==", "moving"),
        where("moveStartedByUid", "==", session.uid),
        limit(50),
      ),
    );
    mine = snapshot.docs.map((docSnap) => ({
      id: docSnap.data()?.id || docSnap.id,
      ...docSnap.data(),
    }));
  }

  mine = mine.filter((ro) => !ro.finishMoveLeftAtMs);

  for (const ro of mine) {
    try {
      const leftAt = Date.now();
      await updateRO(
        ro.id,
        {
          finishMoveLeftAtMs: leftAt,
        },
        {
          eventType: "move_left_unsaved",
          module: "move-locate",
          message: "Left Move & Locate with unsaved move",
        },
      );

      const tag = String(ro.tagNumber || "").trim();
      const roNumber = String(ro.roNumber || "").trim();
      const notificationId = `finish-move-${ro.id}`;

      await setDoc(
        doc(db, "notificationRequests", notificationId),
        {
          id: notificationId,
          dealerId: session.dealerId,
          module: "move-locate",
          eventType: "finish_move_nag",
          title: `Finish move — tag ${tag || roNumber}`,
          message: `Save lot or Cancel. Tag ${tag || "—"} · RO ${roNumber || "—"}.`,
          status: "active",
          targetType: "user",
          targetUserId: session.uid,
          targetUserName: session.displayName || session.email || "",
          route: "/pages/move-locate/move-locate.html",
          routeParams: { tagNumber: tag },
          relatedRoId: ro.id,
          relatedRoNumber: roNumber,
          relatedTagNumber: tag,
          createdAt: serverTimestamp(),
          createdAtMs: leftAt,
          updatedAt: serverTimestamp(),
          updatedAtMs: leftAt,
        },
        { merge: true },
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
