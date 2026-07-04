// public/pages/move-locate/move-locate-parking.js
// Parking availability rendering for Move & Locate.
// This file only renders UI. It does not read or write Firestore.

import { escapeHtml } from "./move-locate-helpers.js";

export function renderParkingAvailability({
  parkingAvailabilityList,
  groupedLocations,
  ros,
  getROArea,
  getROLot,
}) {
  if (!parkingAvailabilityList) {
    return;
  }

  parkingAvailabilityList.innerHTML = "";

  const locations = Object.values(groupedLocations)
    .flat()
    .map((location) => {
      const area = String(location.area || "").trim();
      const lot = String(location.label || "").trim();
      const capacity = Number(location.capacity || 0);

      const used = ros.filter((ro) => {
        return getROArea(ro) === area && getROLot(ro) === lot;
      }).length;

      const available = Math.max(capacity - used, 0);

      return {
        location,
        lot,
        available,
      };
    })
    .sort((a, b) => b.available - a.available);

  locations.forEach((itemData) => {
    const item = document.createElement("div");

    item.className =
      itemData.available > 0
        ? "parking-availability-item"
        : "parking-availability-item parking-full";

    item.innerHTML = `
      <span class="parking-availability-label">
        ${escapeHtml(itemData.lot)}
      </span>

      <span class="parking-availability-count">
        ${itemData.available}
      </span>
    `;

    parkingAvailabilityList.appendChild(item);
  });
}