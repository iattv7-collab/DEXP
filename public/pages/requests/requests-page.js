// public/pages/requests/requests-page.js
// Requests page for creating and tracking dealer requests.

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import { getNotificationGroups } from "/js/services/firestore/notification-groups-service.js";

import {
  cancelRequest,
  createRequest,
  REQUEST_STATUS,
  watchDealerRequests,
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

const myRequestsToggleButton = document.getElementById(
  "myRequestsToggleButton",
);

const allRequestsToggleButton = document.getElementById(
  "allRequestsToggleButton",
);

const requestsTableBody = document.getElementById("requestsTableBody");

let notificationGroups = [];
let dealerNotifications = [];
let dealerRequests = [];
let requestViewMode = "my";

let unsubscribeDealerRequests = null;
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
  wireViewToggle();
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

function wireViewToggle() {
  myRequestsToggleButton?.addEventListener("click", () => {
    requestViewMode = "my";
    updateToggleButtons();
    renderRequestsTable();
  });

  allRequestsToggleButton?.addEventListener("click", () => {
    requestViewMode = "all";
    updateToggleButtons();
    renderRequestsTable();
  });

  updateToggleButtons();
}

function updateToggleButtons() {
  myRequestsToggleButton.classList.toggle("secondary", requestViewMode !== "my");
  allRequestsToggleButton.classList.toggle(
    "secondary",
    requestViewMode !== "all",
  );
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

    requestViewMode = "my";
    updateToggleButtons();

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
      String(group.name || "").trim().toLowerCase() ===
      String(groupName || "").trim().toLowerCase()
    );
  });
}

function setFormMessage(message) {
  requestFormMessage.textContent = message || "";
}

function listenToRequests() {
  if (unsubscribeDealerRequests) {
    unsubscribeDealerRequests();
  }

  if (unsubscribeDealerNotifications) {
    unsubscribeDealerNotifications();
  }

  unsubscribeDealerNotifications = watchDealerNotifications((notifications) => {
    dealerNotifications = notifications;
    renderRequestsTable();
  });

  unsubscribeDealerRequests = watchDealerRequests((requests) => {
    dealerRequests = requests;
    renderRequestsTable();
  });
}

function getVisibleRequests() {
  const session = getSession();

  let rows = [...dealerRequests];

  if (requestViewMode === "my") {
    rows = rows.filter((request) => {
      return request.requestedByUid === session?.uid;
    });
  }

  return rows;
}

function renderRequestsTable() {
  const rows = getVisibleRequests();

  if (!rows.length) {
    requestsTableBody.innerHTML = `
      <tr>
        <td colspan="10">No requests found.</td>
      </tr>
    `;
    return;
  }

  requestsTableBody.innerHTML = rows.map(renderRequestRow).join("");

  requestsTableBody
    .querySelectorAll(".js-cancel-request")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        const requestId = button.dataset.id;
        const request = dealerRequests.find((item) => item.id === requestId);

        if (!request) {
          return;
        }

        const confirmed = confirm("Cancel this request?");

        if (!confirmed) {
          return;
        }

        try {
          await cancelRequest(request);
        } catch (error) {
          console.error(error);
          setFormMessage(error.message || "Could not cancel request.");
        }
      });
    });
}

function renderRequestRow(request) {
  const notification = getNotificationForRequest(request);
  const canCancel = canCancelRequest(request);

  return `
    <tr>
      <td data-label="Created">${formatDateTime(request.createdAtMs)}</td>
      <td data-label="Type">${escapeHtml(request.title || request.requestType || "")}</td>
      <td data-label="RO">${escapeHtml(request.roNumber || "")}</td>
      <td data-label="Tag">${escapeHtml(request.tagNumber || "")}</td>
      <td data-label="Target">${escapeHtml(request.targetGroupName || request.targetGroupId || "")}</td>
      <td data-label="Status">${escapeHtml(formatStatus(request.status))}</td>
      <td data-label="Opened By">${escapeHtml(notification?.openedByName || "")}</td>
      <td data-label="Started By">${escapeHtml(request.startedByName || "")}</td>
      <td data-label="Completed By">${escapeHtml(request.completedByName || request.cancelledByName || "")}</td>
      <td data-label="Action">
        ${
          canCancel
            ? `<button class="small-button secondary js-cancel-request" type="button" data-id="${request.id}">Cancel</button>`
            : ""
        }
      </td>
    </tr>
  `;
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

function canCancelRequest(request = {}) {
  const session = getSession();

  if (
    request.status === REQUEST_STATUS.COMPLETED ||
    request.status === REQUEST_STATUS.CANCELLED
  ) {
    return false;
  }

  if (request.requestedByUid === session?.uid) {
    return true;
  }

  return ["platform-admin", "admin", "manager", "dispatcher"].includes(
    session?.role,
  );
}

function formatStatus(status = "") {
  if (status === REQUEST_STATUS.IN_PROGRESS) {
    return "In Progress";
  }

  if (status === REQUEST_STATUS.COMPLETED) {
    return "Completed";
  }

  if (status === REQUEST_STATUS.CANCELLED) {
    return "Cancelled";
  }

  return "Active";
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}