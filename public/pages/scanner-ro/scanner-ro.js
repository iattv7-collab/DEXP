// public/pages/scanner-ro/scanner-ro.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { scanROImage } from "/js/services/ocr/ro-ocr-service.js?v=tag13";
import {
  createRO,
  findActiveROByNumber,
  findActiveROByTag,
  findActiveAdvisorByCompanyId,
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

function isCapacitorNative() {
  try {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform()
    );
  } catch (error) {
    return false;
  }
}

function dataUrlToFile(dataUrl, fileName) {
  const parts = String(dataUrl || "").split(",");
  const header = parts[0] || "";
  const data = parts[1] || "";
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], fileName, { type: mime });
}

async function resolveScannedAdvisor({ advisorNumber = "" }) {
  const number = String(advisorNumber || "").trim();

  if (!number) {
    return {
      name: "",
      number: "",
    };
  }

  try {
    const advisor = await findActiveAdvisorByCompanyId(number);

    if (!advisor) {
      return {
        name: "",
        number: "",
      };
    }

    return {
      name: advisor.displayName || "",
      number: advisor.companyId || number,
    };
  } catch (error) {
    console.error("Advisor lookup failed:", error);

    return {
      name: "",
      number: "",
    };
  }
}

async function processRoImageFile(file) {
  if (!file) {
    return;
  }

  const imageUrl = URL.createObjectURL(file);
  imagePreview.src = imageUrl;
  imagePreviewWrap.classList.remove("hidden");

  clearMessage();
  showMessage("Scanning RO image...");

  try {
    const result = await scanROImage(file);

    const resolvedAdvisor = await resolveScannedAdvisor({
      advisorNumber: result.advisorNumber || "",
    });

    roNumberInput.value = result.roNumber || "";
    tagNumberInput.value = result.tagNumber || "";
    vinInput.value = result.vin || "";
    customerNameInput.value = result.customerName || "";
    customerPhoneInput.value = result.customerPhone || "";
    advisorNameInput.value = resolvedAdvisor.name;
    advisorNumberInput.value = resolvedAdvisor.number;
    ocrDebugText.value = result.rawOcrText || "";

    await checkScannerDuplicates();

    if (
      !roNumberInput.classList.contains("field-error") &&
      !tagNumberInput.classList.contains("field-error")
    ) {
      showMessage(
        result.tagNumber
          ? `RO scan complete. Tag ${result.tagNumber}`
          : "RO scan complete. Tag not found",
      );
    }
  } catch (error) {
    console.error("RO scan failed:", error);
    showMessage(
      error?.message
        ? `Could not scan RO image. ${error.message}`
        : "Could not scan RO image.",
    );
  }
}

async function takeRoPhotoWithNativeCamera() {
  const Camera = window.Capacitor?.Plugins?.Camera;

  if (!Camera) {
    throw new Error("Native camera plugin is not available.");
  }

  const photo = await Camera.getPhoto({
    quality: 80,
    resultType: "dataUrl",
    source: "CAMERA",
    direction: "REAR",
    saveToGallery: false,
  });

  const file = dataUrlToFile(photo.dataUrl, "ro-scan.jpg");
  await processRoImageFile(file);
}

window.addEventListener("dexp-session-ready", () => {
  initializeScannerRO();
});

function initializeScannerRO() {
  renderAppHeader({
    title: "Scan Repair Order",
  });

  roImageInput.addEventListener("click", async (event) => {
    if (!isCapacitorNative()) {
      return;
    }

    event.preventDefault();

    try {
      showMessage("Opening camera...");
      await takeRoPhotoWithNativeCamera();
    } catch (error) {
      console.error("Native RO camera failed:", error);
      showMessage(
        error?.message
          ? `Camera error. ${error.message}`
          : "Camera error.",
      );
    }
  });

  roImageInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await processRoImageFile(file);
  });

    if (fillTestDataButton) {
    fillTestDataButton.addEventListener("click", fillTestData);
  }

  roNumberInput.addEventListener("input", checkScannerDuplicates);
  tagNumberInput.addEventListener("input", checkScannerDuplicates);

  saveRoButton.addEventListener("click", async () => {
    await saveRO();
  });
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