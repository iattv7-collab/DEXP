// public/pages/notifications/notifications-page.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";

import { MODULES } from "/js/config/modules.js";

import {
  buildTableHeaders,
  formatTableDate,
  renderDataTable
} from "/js/shared/data-table.js";

import {
  watchDealerNotifications
} from "/js/services/firestore/notification-requests-service.js";

protectRoute({
  allowedModules: [MODULES.NOTIFICATIONS]
});

const NOTIFICATION_COLUMNS = [
  {
    key: "createdAtMs",
    label: "Created",
    width: "160px"
  },
  {
    key: "module",
    label: "Module",
    width: "120px"
  },
  {
    key: "eventType",
    label: "Event Type",
    width: "140px"
  },
  {
    key: "title",
    label: "Title",
    width: "260px"
  },
  {
    key: "statusDisplay",
    label: "Status",
    width: "120px"
  },
  {
    key: "openedByName",
    label: "Opened By",
    width: "180px"
  }
];

const tableHead = document.getElementById(
  "notificationsTableHead"
);

const notificationsList = document.getElementById(
  "notificationsList"
);

const searchInput = document.getElementById(
  "notificationSearchInput"
);

let currentNotifications = [];
let currentFilter = "all";
let unsubscribeNotifications = null;

window.addEventListener(
  "dexp-session-ready",
  initializeNotificationsPage
);

function initializeNotificationsPage() {
  renderAppHeader({
    title: "Notifications"
  });

  tableHead.innerHTML =
    buildTableHeaders(NOTIFICATION_COLUMNS);

  searchInput.addEventListener("input", () => {
    renderNotifications(
      getFilteredNotifications()
    );
  });

  document
    .querySelectorAll(".js-filter")
    .forEach((button) => {
      button.addEventListener("click", () => {
        currentFilter =
          button.dataset.filter || "all";

        renderNotifications(
          getFilteredNotifications()
        );
      });
    });

  startNotificationListener();
}

function startNotificationListener() {
  if (unsubscribeNotifications) {
    unsubscribeNotifications();
  }

  unsubscribeNotifications =
    watchDealerNotifications(
      (notifications) => {
        currentNotifications = notifications;

        renderNotifications(
          getFilteredNotifications()
        );
      }
    );
}

function getFilteredNotifications() {
  const search =
    searchInput.value.trim().toLowerCase();

  let rows = [...currentNotifications];

  rows = rows.filter((item) => {
    const displayStatus =
      getDisplayStatus(item);

    if (
      currentFilter !== "all" &&
      displayStatus !== currentFilter
    ) {
      return false;
    }

    if (!search) {
      return true;
    }

    const text = [
      item.module,
      item.eventType,
      item.title,
      item.message,
      item.openedByName,
      displayStatus
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(search);
  });

  return rows;
}

function renderNotifications(rows) {
  renderDataTable({
    columns: NOTIFICATION_COLUMNS,
    rows,
    container: notificationsList,
    rowRenderer: renderNotificationRow
  });
}

function renderNotificationRow(
  notification,
  columns
) {
  return `
    <tr>
      ${columns
        .map((column) => {
          return `
            <td data-label="${column.label}">
              ${getColumnValue(
                notification,
                column
              )}
            </td>
          `;
        })
        .join("")}
    </tr>
  `;
}

function getColumnValue(
  notification,
  column
) {
  if (
    column.key === "createdAtMs"
  ) {
    return formatTableDate(
      notification.createdAtMs
    );
  }

  if (
    column.key === "statusDisplay"
  ) {
    return getDisplayStatus(
      notification
    );
  }

  return (
    notification[column.key] || ""
  );
}

function getDisplayStatus(
  notification
) {
  if (
    notification.status ===
    "resolved"
  ) {
    return "resolved";
  }

  if (
    notification.status ===
    "in_progress"
  ) {
    return "in_progress";
  }

  if (
    notification.openedBy
  ) {
    return "opened";
  }

  return "active";
}