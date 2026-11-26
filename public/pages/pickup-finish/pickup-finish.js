// public/pages/pickup-finish/pickup-finish.js
// Small finish screen for a customer pickup. Destination comes from admin.

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

import { findActiveROByTag, getRO, updateRO, getDealerROs } from "/js/services/firestore/ros-service.js";
import { getPickupSettings } from "/js/services/firestore/pickup-settings-service.js";
import {
  completeRequest,
  markRequestInProgress,
  releaseRequestInProgress,
} from "/js/services/firestore/requests-service.js";
import {
  resolveNotificationRequest,
  releaseNotificationRequest,
} from "/js/services/firestore/notification-requests-service.js";

protectRoute({
  allowedModules: [MODULES.MOVE_LOCATE],
});

const card = document.getElementById("pickupFinishCard");
const message = document.getElementById("pickupFinishMessage");

const params = new URLSearchParams(window.location.search);
const tagNumber = String(params.get("tagNumber") || "").trim();
const requestId = String(params.get("requestId") || "").trim();
const notificationId = String(params.get("notificationId") || "").trim();

let currentRO = null;
let destination = null;

window.addEventListener("dexp-session-ready", () => {
  renderAppHeader({ title: "Pickup Finish" });
  loadFinish();
});

async function loadFinish() {
  show("Loading...");
  card.hidden = true;

  if (!tagNumber) {
    show("Missing tag.");
    return;
  }

  try {
    destination = await getPickupSettings();
    if (!destination?.destinationLabel) {
      show("No pickup destination is set. Set it in Location Settings.");
      return;
    }

    currentRO = await findActiveROByTag(tagNumber);
    if (!currentRO?.id) {
      show("No active RO found for this tag.");
      return;
    }

    if (String(currentRO.status || "").toLowerCase() === "archived") {
      show("This RO is archived.");
      return;
    }

    renderCard();
  } catch (error) {
    console.error(error);
    show(error?.message || "Could not load pickup.");
  }
}

function renderCard() {
  const session = getSession();
  const moving = currentRO.moveStatus === "moving";
  const mine = currentRO.moveStartedByUid === session?.uid;
  const vehicle = [currentRO.year, currentRO.make, currentRO.model]
    .filter(Boolean)
    .join(" ");
  const currentArea = currentRO.currentLocationArea || "";
  const currentLot = currentRO.currentLocation || "";
  const currentWhere = [currentArea, currentLot].filter(Boolean).join(" / ") || "No location saved";

  let action = "";
  if (moving && !mine) {
    action = `<p>Already being moved by ${escapeHtml(currentRO.moveStartedBy || "another user")}.</p>`;
  } else {
    action = `
      <button id="pickupFinishMove" type="button">Finish</button>
      <button id="pickupCancelMove" type="button" class="small-button secondary">Cancel</button>
    `;
  }

  card.hidden = false;
  card.innerHTML = `
    <div style="display:flex; gap:18px; flex-wrap:wrap; margin-bottom:12px;">
      <div><span>RO</span><br><strong>${escapeHtml(currentRO.roNumber || "")}</strong></div>
      <div><span>Tag</span><br><strong>${escapeHtml(currentRO.tagNumber || "")}</strong></div>
      <div><span>Vehicle</span><br><strong>${escapeHtml(vehicle)}</strong></div>
      <div><span>Customer</span><br><strong>${escapeHtml(currentRO.customerName || "")}</strong></div>
    </div>
    <p>Current location: <strong>${escapeHtml(currentWhere)}</strong></p>
    <p>Destination: <strong>${escapeHtml(destination.destinationArea || "")} / ${escapeHtml(destination.destinationLabel || "")}</strong></p>
    ${action}
  `;

  card.querySelector("#pickupFinishMove")?.addEventListener("click", finishMove);
  card.querySelector("#pickupCancelMove")?.addEventListener("click", cancelMove);
  if (!moving) {
    startMove();
  }
  show("");
}

async function startMove() {
  const session = getSession();
  show("Starting...");

  try {
    const fresh = (await getRO(currentRO.id)) || currentRO;

    if (fresh.moveStatus === "moving" && fresh.moveStartedByUid !== session?.uid) {
      show(`Already being moved by ${fresh.moveStartedBy || "another user"}.`);
      currentRO = fresh;
      renderCard();
      return;
    }

    await updateRO(
      fresh.id,
      {
        moveStatus: "moving",
        moveStartedAt: Date.now(),
        moveStartedBy: session?.displayName || session?.email || "",
        moveStartedByUid: session?.uid || "",
      },
      {
        module: "pickup-finish",
        eventType: "vehicle_move_started",
        message: "Pickup move started",
      },
    );

    currentRO = {
      ...fresh,
      moveStatus: "moving",
      moveStartedBy: session?.displayName || session?.email || "",
      moveStartedByUid: session?.uid || "",
    };
    show("Move started.");
    renderCard();

    if (requestId) {
      markRequestInProgress(requestId).catch((error) => {
        console.warn("Could not mark request in progress.", error);
      });
    }
  } catch (error) {
    console.error(error);
    show(error?.message || "Could not start move.");
  }
}

async function finishMove() {
  const session = getSession();

  try {
    const fresh = (await getRO(currentRO.id)) || currentRO;

    if (fresh.moveStatus !== "moving" || fresh.moveStartedByUid !== session?.uid) {
      show("Start the move first.");
      currentRO = fresh;
      renderCard();
      return;
    }

    const movedTag = String(fresh.tagNumber || "").trim().toUpperCase();
    if (movedTag) {
      const others = (await getDealerROs()).filter((ro) => {
        return String(ro.blockedByTag || "").trim().toUpperCase() === movedTag;
      });
      for (const blocked of others) {
        if (!blocked.id) continue;
        await updateRO(
          blocked.id,
          { blockedByTag: "" },
          {
            module: "pickup-finish",
            eventType: "blocked_by_cleared",
            message: `Blocked by tag ${movedTag} cleared because that vehicle was moved`,
          },
        );
      }
    }

    await updateRO(
      fresh.id,
      {
        [ROS_FIELDS.currentLocation]: destination.destinationLabel,
        currentLocation: destination.destinationLabel,
        currentLocationArea: destination.destinationArea || "",
        blockedByTag: "",
        blockingTag: "",
        locationUpdatedAt: Date.now(),
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: "",
        moveStartedByUid: "",
      },
      {
        module: "pickup-finish",
        eventType: "location_updated",
        message: `Pickup parked at ${destination.destinationLabel}`,
      },
    );

    if (requestId) {
      await completeRequest(requestId);
    }

    if (notificationId) {
      try {
        await resolveNotificationRequest(notificationId);
      } catch (error) {
        console.warn("Could not resolve notification.", error);
      }
    }

    show(`Parked at ${destination.destinationLabel}.`);
    card.hidden = true;
    setTimeout(() => {
      window.location.href = "/pages/dashboard/index.html";
    }, 800);
  } catch (error) {
    console.error(error);
    show(error?.message || "Could not finish move.");
  }
}

async function cancelMove() {
  const session = getSession();
  show("Cancelling...");

  try {
    const fresh = (await getRO(currentRO.id)) || currentRO;

    await updateRO(
      fresh.id,
      {
        moveStatus: "",
        moveStartedAt: null,
        moveStartedBy: "",
        moveStartedByUid: "",
      },
      {
        module: "pickup-finish",
        eventType: "vehicle_move_cancelled",
        message: "Pickup move cancelled",
      },
    );

    if (requestId) {
      try {
        await releaseRequestInProgress(requestId);
      } catch (error) {
        console.warn("Could not release request.", error);
      }
    }

    if (notificationId) {
      try {
        await releaseNotificationRequest(notificationId);
      } catch (error) {
        console.warn("Could not release notification.", error);
      }
    }

    show("Cancelled. Notification is available again.");
    card.hidden = true;
    setTimeout(() => {
      window.location.href = "/pages/dashboard/index.html";
    }, 800);
  } catch (error) {
    console.error(error);
    show(error?.message || "Could not cancel.");
  }
}

function show(text) {
  message.textContent = text || "";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}