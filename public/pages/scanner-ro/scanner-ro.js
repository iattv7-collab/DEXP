// public/pages/scanner-ro/scanner-ro.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { scanROImage } from "/js/services/ocr/ro-ocr-service.js";
import { createRO } from "/js/services/firestore/ros-service.js";

import { MODULES } from "/js/config/modules.js";
import { ROS_FIELDS } from "/js/config/ros-fields.js";

protectRoute({
    allowedModules: [MODULES.SCANNER_RO]
});

const roImageInput = document.getElementById("roImageInput");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const imagePreview = document.getElementById("imagePreview");

const roNumberInput = document.getElementById("roNumberInput");
const tagNumberInput = document.getElementById("tagNumberInput");
const vinInput = document.getElementById("vinInput");
const yearInput = document.getElementById("yearInput");
const makeInput = document.getElementById("makeInput");
const modelInput = document.getElementById("modelInput");
const colorInput = document.getElementById("colorInput");
const customerNameInput = document.getElementById("customerNameInput");
const customerPhoneInput = document.getElementById("customerPhoneInput");

const fillTestDataButton = document.getElementById("fillTestDataButton");
const saveRoButton = document.getElementById("saveRoButton");
const scannerMessage = document.getElementById("scannerMessage");

window.addEventListener("dexp-session-ready", () => {
    initializeScannerRO();
});

function initializeScannerRO() {
    renderAppHeader({
        title: "Scanner RO"
    });

    roImageInput.addEventListener("change", async (event) => {
        handleImagePreview(event);

        await handleROScan(event);
    });

    fillTestDataButton.addEventListener("click", fillTestData);

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
        yearInput.value = result.year || "";
        makeInput.value = result.make || "";
        modelInput.value = result.model || "";
        colorInput.value = result.color || "";
        customerNameInput.value = result.customerName || "";
        customerPhoneInput.value = result.customerPhone || "";

        showMessage("RO scan complete.");
    } catch (error) {
        console.error("RO scan failed:", error);

        showMessage("Could not scan RO image.");
    }
}

function fillTestData() {
    roNumberInput.value = `RO-${Date.now()}`;
    tagNumberInput.value = `T-${Date.now().toString().slice(-4)}`;
    vinInput.value = "WP0AA2A90RS123456";
    yearInput.value = "2024";
    makeInput.value = "Porsche";
    modelInput.value = "911";
    colorInput.value = "White";
    customerNameInput.value = "Test Customer";
    customerPhoneInput.value = "555-555-5555";

    showMessage("Test data filled.");
}

async function saveRO() {
    clearMessage();

    const roNumber = roNumberInput.value.trim();
    const tagNumber = tagNumberInput.value.trim();
    const vin = vinInput.value.trim();

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
                [ROS_FIELDS.year]: yearInput.value.trim(),
                [ROS_FIELDS.make]: makeInput.value.trim(),
                [ROS_FIELDS.model]: modelInput.value.trim(),
                [ROS_FIELDS.color]: colorInput.value.trim(),
                [ROS_FIELDS.customerName]: customerNameInput.value.trim(),
                [ROS_FIELDS.customerPhone]: customerPhoneInput.value.trim(),
                [ROS_FIELDS.scanSource]: "scanner-ro-manual-test"
            },
            {
                eventType: "scanned_ro_created",
                module: "scanner-ro",
                message: "RO created from Scanner RO"
            }
        );

        clearForm();

        showMessage("RO saved.");
    } catch (error) {
        console.error("Failed to save RO:", error);
        showMessage("Could not save RO. Try again.");
    } finally {
        saveRoButton.disabled = false;
        saveRoButton.textContent = "Save RO";
    }
}

function clearForm() {
    roNumberInput.value = "";
    tagNumberInput.value = "";
    vinInput.value = "";
    yearInput.value = "";
    makeInput.value = "";
    modelInput.value = "";
    colorInput.value = "";
    customerNameInput.value = "";
    customerPhoneInput.value = "";

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