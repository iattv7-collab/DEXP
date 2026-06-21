// public/pages/scanner-ro/scanner-ro.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { scanROImage } from "/js/services/ocr/ro-ocr-service.js";
import {
  createRO,
  findActiveROByNumber,
  findActiveROByTag,
} from "/js/services/firestore/ros-service.js";

import { decodeVIN } from "/js/services/vin/vin-decoder-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

protectRoute({
  allowedModules: [MODULES.SCANNER_RO],
});

const roImageInput = document.getElementById("roImageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");

const roNumberInput = document.getElementById("roNumberInput");
const tagNumberInput = document.getElementById("tagNumberInput");
const vinInput = document.getElementById("vinInput");
const customerNameInput = document.getElementById("customerNameInput");
const customerPhoneInput = document.getElementById("customerPhoneInput");
const advisorNameInput = document.getElementById("advisorNameInput");
const advisorNumberInput = document.getElementById("advisorNumberInput");
const waiterCheckbox = document.getElementById("waiterCheckbox");
const concernInput = document.getElementById("concernInput");
const ocrDebugText = document.getElementById("ocrDebugText");
const fillTestDataButton = document.getElementById("fillTestDataButton");
const saveRoButton = document.getElementById("saveRoButton");
const scannerMessage = document.getElementById("scannerMessage");

window.addEventListener("dexp-session-ready", () => {
  initializeScannerRO();
});

function initializeScannerRO() {
  renderAppHeader({
    title: "Scan Repair Order",
  });

  roImageInput.addEventListener("change", async (event) => {
    handleImagePreview(event);

    await handleROScan(event);
  });

  fillTestDataButton.addEventListener("click", fillTestData);

  roNumberInput.addEventListener("input", checkScannerDuplicates);
  tagNumberInput.addEventListener("input", checkScannerDuplicates);

  saveRoButton.addEventListener("click", async () => {
    await saveRO();
  });
}

function handleImagePreview(event) {
  const file = event.target.files?.[0];

  if (!file) {
    imagePreviewWrap.classList.add("hidden");
    imagePreview.removeAttribute("src");
    return;
  }

  const imageUrl = URL.createObjectURL(file);

  imagePreview.src = imageUrl;
  imagePreviewWrap.classList.remove("hidden");
}

async function handleROScan(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  clearMessage();

  showMessage("Scanning RO image...");

  try {
    const result = await scanROImage(file);

    roNumberInput.value = result.roNumber || "";
    tagNumberInput.value = result.tagNumber || "";
    vinInput.value = result.vin || "";
    customerNameInput.value = result.customerName || "";
    customerPhoneInput.value = result.customerPhone || "";
    advisorNameInput.value = result.advisorName || "";
    advisorNumberInput.value = result.advisorNumber || "";
    ocrDebugText.value = result.rawOcrText || "";

    await checkScannerDuplicates();

    if (
      !roNumberInput.classList.contains("field-error") &&
      !tagNumberInput.classList.contains("field-error")
    ) {
      showMessage("RO scan complete.");
    }
  } catch (error) {
    console.error("RO scan failed:", error);

    showMessage("Could not scan RO image.");
  }
}

function fillTestData() {
  roNumberInput.value = `RO-${Date.now()}`;
  tagNumberInput.value = `T-${Date.now().toString().slice(-4)}`;
  vinInput.value = "WP0AA2A90RS123456";
  customerNameInput.value = "Test Customer";
  customerPhoneInput.value = "555-555-5555";
  advisorNameInput.value = "";
  advisorNumberInput.value = "";

  showMessage("Test data filled.");
}

async function checkScannerDuplicates() {
  clearMessage();

  roNumberInput.classList.remove("field-error");
  tagNumberInput.classList.remove("field-error");

  const roNumber = roNumberInput.value.trim();
  const tagNumber = tagNumberInput.value.trim();

  let duplicateFound = false;
  const messages = [];

  if (roNumber) {
    const existingRO = await findActiveROByNumber(roNumber);

    if (existingRO) {
      roNumberInput.classList.add("field-error");
      messages.push(`RO number ${roNumber} already exists.`);
      duplicateFound = true;
    }
  }

  if (tagNumber) {
    const existingTag = await findActiveROByTag(tagNumber);

    if (existingTag) {
      tagNumberInput.classList.add("field-error");
      messages.push(`Tag number ${tagNumber} already exists.`);
      duplicateFound = true;
    }
  }

  if (duplicateFound) {
    showMessage(messages.join(" "));
    return true;
  }

  return false;
}

async function saveRO() {
  clearMessage();

  roNumberInput.classList.remove("field-error");
  tagNumberInput.classList.remove("field-error");

  const roNumber = roNumberInput.value.trim();
  const tagNumber = tagNumberInput.value.trim();
  const vin = vinInput.value.trim();

  const hasDuplicate = await checkScannerDuplicates();

  if (hasDuplicate) {
    return;
  }

  let decodedVehicle = {
    year: "",
    make: "",
    model: "",
  };

  if (vin.length === 17) {
    try {
      decodedVehicle = await decodeVIN(vin);
    } catch (error) {
      console.error("VIN decode failed:", error);
    }
  }

  if (!roNumber && !tagNumber && !vin) {
    showMessage("Enter at least RO, tag, or VIN before saving.");
    return;
  }

  saveRoButton.disabled = true;
  saveRoButton.textContent = "Saving...";

  try {
    await createRO(
      {
        [ROS_FIELDS.roNumber]: roNumber,
        [ROS_FIELDS.tagNumber]: tagNumber,
        [ROS_FIELDS.vin]: vin,
        [ROS_FIELDS.year]: decodedVehicle.year,
        [ROS_FIELDS.make]: decodedVehicle.make,
        [ROS_FIELDS.model]: decodedVehicle.model,
        [ROS_FIELDS.customerName]: customerNameInput.value.trim(),
        [ROS_FIELDS.customerPhone]: customerPhoneInput.value.trim(),
        [ROS_FIELDS.advisorName]: advisorNameInput.value.trim(),
        [ROS_FIELDS.advisorCompanyId]: advisorNumberInput.value.trim(),
        [ROS_FIELDS.isWaiter]: waiterCheckbox.checked,
        customerWaiting: waiterCheckbox.checked,
        [ROS_FIELDS.concern]: concernInput.value.trim(),

        [ROS_FIELDS.scanSource]: "scanner-ro",
      },
      {
        eventType: "scanned_ro_created",
        module: "scanner-ro",
        message: "RO created from Scanner RO",
      },
    );

    clearForm();

    showMessage("RO saved.");
  } catch (error) {
    console.error("Failed to save RO:", error);

    showMessage(error?.message || "Could not save RO.");
  } finally {
    saveRoButton.disabled = false;
    saveRoButton.textContent = "Save RO";
  }
}

function clearForm() {
  roNumberInput.value = "";
  tagNumberInput.value = "";
  vinInput.value = "";
  customerNameInput.value = "";
  customerPhoneInput.value = "";
  advisorNameInput.value = "";
  advisorNumberInput.value = "";
  waiterCheckbox.checked = false;
  concernInput.value = "";

  ocrDebugText.value = "";
  roImageInput.value = "";
  imagePreview.removeAttribute("src");
  imagePreviewWrap.classList.add("hidden");
}

function showMessage(message) {
  scannerMessage.textContent = message;
}

function clearMessage() {
  scannerMessage.textContent = "";
}
