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

import { watchDealerNotifications } from "/js/services/firestore/notification-requests-service.js";
import { getActiveRequestTypes } from "/js/services/firestore/request-types-service.js";

protectRoute();

const requestRoNumberInput = document.getElementById("requestRoNumberInput");
const requestTagNumberInput = document.getElementById("requestTagNumberInput");
const requestMessageInput = document.getElementById("requestMessageInput");
const requestFormMessage = document.getElementById("requestFormMessage");

const searchRequestVehicleButton = document.getElementById(
  "searchRequestVehicleButton",
);

const requestVehicleSummary = document.getElementById("requestVehicleSummary");
const requestCreateControls = document.getElementById("requestCreateControls");
const requestTypeSelect = document.getElementById("requestTypeSelect");
const createRequestButton = document.getElementById("createRequestButton");

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
let requestTypes = [];
let selectedRequestRO = null;
let requestViewMode = "my";

let unsubscribeDealerRequests = null;
let unsubscribeDealerNotifications = null;

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
  requestTypes = await getActiveRequestTypes();

  populateRequestTypeSelect();
  wireRequestForm();
  wireViewToggle();
  listenToRequests();
}

function wireRequestForm() {
  searchRequestVehicleButton?.addEventListener("click", async () => {
    await handleSearchRequestVehicle();
  });

  createRequestButton?.addEventListener("click", async () => {
    await handleCreateSelectedRequest();
  });
}

function populateRequestTypeSelect() {
  requestTypeSelect.innerHTML = `
    <option value="">Select request type...</option>
  `;

  requestTypes.forEach((requestType) => {
    const option = document.createElement("option");

    option.value = requestType.id;
    option.textContent = requestType.name || requestType.requestType || "";

    requestTypeSelect.appendChild(option);
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
  myRequestsToggleButton.classList.toggle(
    "secondary",
    requestViewMode !== "my",
  );
  allRequestsToggleButton.classList.toggle(
    "secondary",
    requestViewMode !== "all",
  );
}

async function handleSearchRequestVehicle() {
  setFormMessage("");

  selectedRequestRO = null;
  requestVehicleSummary.classList.add("hidden");
  requestVehicleSummary.innerHTML = "";
  requestCreateControls.classList.add("hidden");

  const roNumber = requestRoNumberInput.value.trim();
  const tagNumber = requestTagNumberInput.value.trim();

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

  selectedRequestRO = ro;

  const openRequest = findOpenRequestForRO(ro);

  renderRequestVehicleSummary(ro, openRequest);

  if (ro.moveStatus === "moving" || openRequest) {
    requestCreateControls.classList.add("hidden");
    return;
  }

  requestCreateControls.classList.remove("hidden");
}

async function handleCreateSelectedRequest() {
  try {
    setFormMessage("");

    if (!selectedRequestRO) {
      setFormMessage("Search and select a vehicle first.");
      return;
    }

    const requestTypeId = requestTypeSelect.value;
    const selectedRequestType = requestTypes.find(
      (item) => item.id === requestTypeId,
    );

    if (!selectedRequestType) {
      setFormMessage("Select request type.");
      return;
    }

    const openRequest = findOpenRequestForRO(selectedRequestRO);

    if (selectedRequestRO.moveStatus === "moving" || openRequest) {
      renderRequestVehicleSummary(selectedRequestRO, openRequest);
      requestCreateControls.classList.add("hidden");
      return;
    }

    const finalRoNumber = selectedRequestRO.roNumber || "";
    const finalTagNumber = selectedRequestRO.tagNumber || "";
    const customMessage = requestMessageInput.value.trim();

    await createRequest({
      roId: selectedRequestRO.id || "",
      roNumber: finalRoNumber,
      tagNumber: finalTagNumber,
      vinLast8: selectedRequestRO.vinLast8 || "",

      requestType: selectedRequestType.requestType,
      sourceModule: "requests",

      targetGroupId: selectedRequestType.targetGroupId,
      targetGroupName: selectedRequestType.targetGroupName,

      title: selectedRequestType.name,

      message:
        customMessage ||
        `${selectedRequestType.defaultMessage || selectedRequestType.name} RO ${
          finalRoNumber || "N/A"
        } Tag ${finalTagNumber || "N/A"}.`,

      route: selectedRequestType.route || "/pages/move-locate/move-locate.html",

      routeParams: {
        tagNumber: finalTagNumber,
      },
    });

    requestRoNumberInput.value = "";
    requestTagNumberInput.value = "";
    requestMessageInput.value = "";
    requestTypeSelect.value = "";
    selectedRequestRO = null;

    requestVehicleSummary.classList.add("hidden");
    requestVehicleSummary.innerHTML = "";
    requestCreateControls.classList.add("hidden");

    requestViewMode = "my";
    updateToggleButtons();

    setFormMessage("Request created.");
  } catch (error) {
    console.error(error);
    setFormMessage(error.message || "Failed to create request.");
  }
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

function renderRequestVehicleSummary(ro = {}, openRequest = null) {
  const isMoving = ro.moveStatus === "moving";
  const hasOpenRequest = Boolean(openRequest);

  requestVehicleSummary.classList.remove("hidden");

  requestVehicleSummary.innerHTML = `
    <div>
      <strong>Vehicle Found</strong>
    </div>

    <div style="margin-top:8px;">
      RO: ${escapeHtml(ro.roNumber || ro.id || "")}
      <br />
      Tag: ${escapeHtml(ro.tagNumber || "")}
      <br />
      Location: ${escapeHtml(ro.currentLocation || "Not set")}
      <br />
      
      Status:
      ${
        isMoving
          ? `<span
               style="
                 color:#b00020;
                 font-weight:700;
               "
             >
               Currently moving by ${escapeHtml(
                 ro.moveStartedBy || "another user",
               )}
             </span>`
          : hasOpenRequest
            ? `<span
           style="
             color:#b00020;
             font-weight:700;
           "
         >
           Request already active: ${escapeHtml(
             openRequest.title || openRequest.requestType || "Request",
           )}
         </span>`
            : "Available"
      }
    </div>

    ${
      isMoving
        ? `
    <div
      style="
        margin-top:10px;
        padding:8px 12px;
        border:1px solid #b00020;
        background:#fff4f4;
        color:#b00020;
        font-weight:700;
        border-radius:6px;
     "
   >
     Vehicle is currently being moved. Complete the move before creating another request.
   </div>
        `
        : ""
    }

    ${
      hasOpenRequest
        ? `
          <div 
            style="
              margin-top:10px;
              padding:8px 12px;
              border:1px solid #b00020;
              background:#fff4f4;
              color:#b00020;
              font-weight:700;
              border-radius:6px;
            "
          >
            An active request already exists for this vehicle. Complete or cancel it before creating another request.
          </div>
        `
        : ""
    }
  `;
}

function findOpenRequestForRO(ro = {}) {
  return dealerRequests.find((request) => {
    const isOpen =
      request.status === REQUEST_STATUS.ACTIVE ||
      request.status === REQUEST_STATUS.IN_PROGRESS;

    if (!isOpen) {
      return false;
    }

    return (
      (ro.id && request.roId === ro.id) ||
      (ro.roNumber && request.roNumber === ro.roNumber) ||
      (ro.tagNumber && request.tagNumber === ro.tagNumber)
    );
  });
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

  requestsTableBody.querySelectorAll(".js-cancel-request").forEach((button) => {
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
      <td data-label="Opened By">${escapeHtml(
        formatPersonWithTime(
          notification?.openedByName,
          notification?.openedAtMs,
        ),
      )}</td>

      <td data-label="Started By">${escapeHtml(
        formatPersonWithTime(request.startedByName, request.startedAtMs),
      )}</td>

     <td data-label="Completed By">${escapeHtml(
       formatPersonWithTime(
         request.completedByName || request.cancelledByName,
         request.completedAtMs || request.cancelledAtMs,
       ),
     )}</td>
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

  return date.toLocaleString([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPersonWithTime(name, timeMs) {
  if (!name) {
    return "";
  }

  if (!timeMs) {
    return name;
  }

  const date = new Date(timeMs);
  const today = new Date();

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameDay) {
    return `${name} • ${time}`;
  }

  const shortDate = date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });

  return `${name} • ${shortDate}, ${time}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
