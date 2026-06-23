// public/pages/requests/requests-page.js

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import { getNotificationGroups } from "/js/services/firestore/notification-groups-service.js";

import {
  createRequest,
  watchActiveRequests,
  watchCompletedRequests,
} from "/js/services/firestore/requests-service.js";

import {
  findActiveROByNumber,
  findActiveROByTag,
} from "/js/services/firestore/ros-service.js";

import {
  watchDealerNotifications,
} from "/js/services/firestore/notification-requests-service.js";

protectRoute();

const requestRoNumberInput = document.getElementById("requestRoNumberInput");

const requestTagNumberInput = document.getElementById("requestTagNumberInput");

const requestMessageInput = document.getElementById("requestMessageInput");

const requestFormMessage = document.getElementById("requestFormMessage");

const requestPickupButton = document.getElementById("requestPickupButton");

const requestBringToShopButton = document.getElementById(
  "requestBringToShopButton",
);

const requestMoveToAnnexButton = document.getElementById(
  "requestMoveToAnnexButton",
);

const activeRequestsContainer = document.getElementById(
  "activeRequestsContainer",
);

const completedRequestsContainer = document.getElementById(
  "completedRequestsContainer",
);

let notificationGroups = [];
let dealerNotifications = [];

let unsubscribeActiveRequests = null;
let unsubscribeCompletedRequests = null;
let unsubscribeDealerNotifications = null;

const REQUEST_PRESETS = {
  pickup: {
    requestType: "pickup",
    title: "Pickup Request",
    targetGroupName: "Front Valet",
    defaultMessage: "Vehicle needs pickup.",
  },

  bring_to_shop: {
    requestType: "bring_to_shop",
    title: "Bring Vehicle to Shop",
    targetGroupName: "Shop Valets",
    defaultMessage: "Vehicle needs to be brought to the shop.",
  },

  move_to_annex: {
    requestType: "move_to_annex",
    title: "Move Vehicle to Annex",
    targetGroupName: "Shop to shop Valets",
    defaultMessage: "Vehicle needs to be moved to the annex.",
  },
};

window.addEventListener("dexp-session-ready", () => {
  initializeRequestsPage();
});

async function initializeRequestsPage() {
  const session = getSession();

  if (!session) {
    return;
  }

  renderAppHeader({
    title: "Requests",
    showHome: true,
  });

  notificationGroups = await getNotificationGroups();

  wireRequestButtons();

  listenToRequests();
}

function wireRequestButtons() {
  requestPickupButton?.addEventListener("click", () => {
    handleCreatePresetRequest(REQUEST_PRESETS.pickup);
  });

  requestBringToShopButton?.addEventListener("click", () => {
    handleCreatePresetRequest(REQUEST_PRESETS.bring_to_shop);
  });

  requestMoveToAnnexButton?.addEventListener("click", () => {
    handleCreatePresetRequest(REQUEST_PRESETS.move_to_annex);
  });
}

async function handleCreatePresetRequest(preset) {
  try {
    setFormMessage("");

    const roNumber = requestRoNumberInput.value.trim();
    const tagNumber = requestTagNumberInput.value.trim();
    const customMessage = requestMessageInput.value.trim();

    if (!roNumber && !tagNumber) {
      setFormMessage("Enter an RO number or tag number.");
      return;
    }

    const ro = await findMatchingRO({
      roNumber,
      tagNumber,
    });

    if (!ro) {
      setFormMessage("No active RO found for that RO/tag.");
      return;
    }

    const targetGroup = findTargetGroupByName(preset.targetGroupName);

    if (!targetGroup) {
      setFormMessage(
        `Target group "${preset.targetGroupName}" was not found. Check Notification Groups.`,
      );
      return;
    }

    const finalRoNumber = ro.roNumber || roNumber || "";

    const finalTagNumber = ro.tagNumber || tagNumber || "";

    await createRequest({
      roId: ro.id || "",
      roNumber: finalRoNumber,
      tagNumber: finalTagNumber,
      vinLast8: ro.vinLast8 || "",

      requestType: preset.requestType,
      sourceModule: "requests",

      targetGroupId: targetGroup.id,
      targetGroupName: targetGroup.name,

      title: preset.title,

      message:
        customMessage ||
        `${preset.defaultMessage} RO ${finalRoNumber || "N/A"} Tag ${finalTagNumber || "N/A"}.`,

      route: "/pages/move-locate/move-locate.html",

      routeParams: {
        tagNumber: finalTagNumber,
      },
    });

    requestRoNumberInput.value = "";
    requestTagNumberInput.value = "";
    requestMessageInput.value = "";

    setFormMessage("Request created.");
  } catch (error) {
    console.error(error);

    setFormMessage(error.message || "Failed to create request.");
  }
}

async function findMatchingRO({ roNumber, tagNumber }) {
  if (roNumber) {
    const ro = await findActiveROByNumber(roNumber);

    if (ro) {
      return ro;
    }
  }

  if (tagNumber) {
    return await findActiveROByTag(tagNumber);
  }

  return null;
}

function findTargetGroupByName(groupName) {
  return notificationGroups.find((group) => {
    return (
      String(group.name || "")
        .trim()
        .toLowerCase() ===
      String(groupName || "")
        .trim()
        .toLowerCase()
    );
  });
}

function setFormMessage(message) {
  requestFormMessage.textContent = message || "";
}

function listenToRequests() {
  if (unsubscribeActiveRequests) {
    unsubscribeActiveRequests();
  }

  if (unsubscribeCompletedRequests) {
    unsubscribeCompletedRequests();
  }

  if (unsubscribeDealerNotifications) {
    unsubscribeDealerNotifications();
  }

  let latestActiveRequests = [];
  let latestCompletedRequests = [];

  function renderAllRequestLists() {
    renderRequestsList({
      container: activeRequestsContainer,
      requests: latestActiveRequests,
      emptyMessage: "No active requests yet.",
    });

    renderRequestsList({
      container: completedRequestsContainer,
      requests: latestCompletedRequests,
      emptyMessage: "No completed requests yet.",
    });
  }

  unsubscribeDealerNotifications = watchDealerNotifications((notifications) => {
    dealerNotifications = notifications;
    renderAllRequestLists();
  });

  unsubscribeActiveRequests = watchActiveRequests((requests) => {
    latestActiveRequests = requests;
    renderAllRequestLists();
  });

  unsubscribeCompletedRequests = watchCompletedRequests((requests) => {
    latestCompletedRequests = requests;
    renderAllRequestLists();
  });
}

function getNotificationForRequest(request = {}) {
  if (!request.notificationRequestId) {
    return null;
  }

  return (
    dealerNotifications.find((notification) => {
      return notification.id === request.notificationRequestId;
    }) || null
  );
}

function buildRequestOpenedLine(request = {}) {
  const notification = getNotificationForRequest(request);

  if (!notification?.openedByName) {
    return "";
  }

  return `
    <div>
      <strong>Opened By:</strong> ${notification.openedByName}
    </div>
  `;
}

function renderRequestsList({ container, requests, emptyMessage }) {
  if (!requests.length) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  container.innerHTML = requests
    .map((request) => {
      return `
        <div class="tool-card">
          <h3>${request.title || "Request"}</h3>

          <div class="tool-details">
            <div><strong>Status:</strong> ${request.status || ""}</div>
            ${buildRequestOpenedLine(request)}
            <div><strong>Type:</strong> ${request.requestType || ""}</div>
            <div><strong>RO:</strong> ${request.roNumber || ""}</div>
            <div><strong>Tag:</strong> ${request.tagNumber || ""}</div>
            <div><strong>From:</strong> ${request.requestedByName || ""}</div>
            <div><strong>Target:</strong> ${
              request.targetGroupName || request.targetGroupId || ""
            }</div>
            <div><strong>Message:</strong> ${request.message || ""}</div>
          </div>
        </div>
      `;
    })
    .join("");
}
