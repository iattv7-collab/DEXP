// public/pages/master-ro/master-ro.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";

import {
  createRO,
  getDealerROs
} from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

protectRoute({
  allowedModules: [MODULES.MASTER_RO]
});

const roList = document.getElementById("roList");
const createTestRoButton =
  document.getElementById("createTestRoButton");

window.addEventListener("dexp-session-ready", () => {
  initializeMasterRO();
});

async function initializeMasterRO() {
  renderAppHeader({
    title: "Master RO"
  });

  createTestRoButton.addEventListener("click", async () => {
    await createTestRO();
  });

  await loadROs();
}

async function createTestRO() {
  await createRO({
    [ROS_FIELDS.roNumber]: `RO-${Date.now()}`,
    [ROS_FIELDS.tagNumber]: `T-${Date.now().toString().slice(-4)}`,
    [ROS_FIELDS.vin]: "WP0AA2A90RS123456",
    [ROS_FIELDS.year]: "2024",
    [ROS_FIELDS.make]: "Porsche",
    [ROS_FIELDS.model]: "911",
    [ROS_FIELDS.color]: "White",
    [ROS_FIELDS.customerName]: "Test Customer",
    [ROS_FIELDS.customerPhone]: "555-555-5555",
    [ROS_FIELDS.scanSource]: "manual-test"
  });

  await loadROs();
}

async function loadROs() {
  roList.innerHTML = "Loading ROs...";

  const ros = await getDealerROs();

  if (!ros.length) {
    roList.innerHTML = "<p>No ROs yet.</p>";
    return;
  }

  roList.innerHTML = ros.map(renderRORow).join("");
}

function renderRORow(ro) {
  return `
    <article class="ro-card">
      <strong>${ro.roNumber || "No RO"}</strong>
      <div>Tag: ${ro.tagNumber || ""}</div>
      <div>VIN Last 8: ${ro.vinLast8 || ""}</div>
      <div>Vehicle: ${ro.year || ""} ${ro.make || ""} ${ro.model || ""}</div>
      <div>Customer: ${ro.customerName || ""}</div>
      <div>Status: ${ro.status || ""}</div>
    </article>
  `;
}