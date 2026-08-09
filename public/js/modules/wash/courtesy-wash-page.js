// ======================================================
// FILE: /public/js/modules/wash/courtesy-wash-page.js
// MODULE: Courtesy Wash
// PURPOSE:
// Courtesy Wash intake.
// Scan VIN, decode vehicle, collect customer name/phone,
// display estimated completion, then send into wash flow.
// ======================================================

import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  scanVinWithCamera,
  normalizeVin,
  decodeVinLive,
} from "/js/modules/loaners/vin-scanner.js";

import {
  createCourtesyWash,
  getCourtesyWashEstimate,
  findActiveCourtesyWashByVin,
} from "/js/services/firestore/courtesy-wash-service.js";

import { getWashSettings } from "/js/services/firestore/wash-settings-service.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["courtesy-wash"],
  });

  renderAppHeader();

  const scanVinBtn = $("scanVinBtn");
  const scannerVideo = $("scannerVideo");
  const scannerStatus = $("scannerStatus");

  const vinEl = $("vin");
  const yearEl = $("year");
  const makeEl = $("make");
  const modelEl = $("model");

  const customerNameEl = $("customerName");
  const customerPhoneEl = $("customerPhone");

  const estimateSection = $("estimateSection");
  const vehiclesAheadEl = $("vehiclesAhead");
  const estimatedCompletionEl = $("estimatedCompletion");

  const sendBtn = $("sendBtn");
  const msgEl = $("msg");

  let currentSession = await waitForSession();

  let currentEstimate = null;
  let validatedVin = "";
  let washIsOpen = true;

  // ====================================================
  // HELPERS
  // ====================================================

  function clean(value) {
    return String(value || "").trim();
  }

  function setMsg(message, ok = true) {
    msgEl.textContent = message || "";
    msgEl.style.color = ok ? "green" : "crimson";
  }

  function formatTime(milliseconds) {
    if (!milliseconds) {
      return "";
    }

    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function openScannerView() {
    scannerVideo.style.display = "block";
    scannerVideo.style.position = "fixed";
    scannerVideo.style.inset = "0";
    scannerVideo.style.width = "100vw";
    scannerVideo.style.height = "100vh";
    scannerVideo.style.objectFit = "cover";
    scannerVideo.style.background = "#000";
    scannerVideo.style.zIndex = "9999";
  }

  function closeScannerView() {
    scannerVideo.removeAttribute("style");
    scannerVideo.style.display = "none";
  }

  function clearVehicle() {
    validatedVin = "";
    currentEstimate = null;

    vinEl.value = "";
    yearEl.value = "";
    makeEl.value = "";
    modelEl.value = "";

    estimateSection.style.display = "none";
    vehiclesAheadEl.textContent = "";
    estimatedCompletionEl.textContent = "";

    updateSendButton();
  }

  function clearForm() {
    clearVehicle();

    customerNameEl.value = "";
    customerPhoneEl.value = "";

    scannerStatus.textContent = "";

    updateSendButton();
  }

  function updateSendButton() {
    const ready =
      washIsOpen &&
      validatedVin &&
      clean(customerNameEl.value) &&
      clean(customerPhoneEl.value) &&
      currentEstimate?.estimatedCompletionAtMs;

    sendBtn.disabled = !ready;
  }

  // ====================================================
  // ESTIMATE
  // ====================================================

  async function loadEstimate() {
    const washSettings = await getWashSettings();

    washIsOpen = Boolean(washSettings?.isOpen);

    if (!washIsOpen) {
      currentEstimate = null;

      estimateSection.style.display = "block";
      vehiclesAheadEl.textContent = "";
      estimatedCompletionEl.textContent = "Wash is currently closed.";

      updateSendButton();

      return;
    }

    /*
     * If Wash Settings later includes an estimated
     * minutes-per-vehicle value, use it automatically.
     */
    const configuredMinutes = Number(washSettings?.estimatedMinutesPerVehicle);

    const estimateOptions =
      Number.isFinite(configuredMinutes) && configuredMinutes > 0
        ? {
            minutesPerVehicle: configuredMinutes,
          }
        : {};

    currentEstimate = await getCourtesyWashEstimate(estimateOptions);

    vehiclesAheadEl.textContent = String(currentEstimate.vehiclesAhead);

    estimatedCompletionEl.textContent = formatTime(
      currentEstimate.estimatedCompletionAtMs,
    );

    estimateSection.style.display = "block";

    updateSendButton();
  }

  // ====================================================
  // VIN
  // ====================================================

  async function processVin(rawVin) {
    const vin = normalizeVin(rawVin);

    if (!vin || vin.length !== 17) {
      clearVehicle();
      setMsg("Valid VIN not found.", false);
      return;
    }

    setMsg("Checking VIN...");

    const existing = await findActiveCourtesyWashByVin(vin);

    if (existing) {
      clearVehicle();

      setMsg("This vehicle already has an active Courtesy Wash.", false);

      return;
    }

    setMsg("Decoding VIN...");

    const decoded = await decodeVinLive(vin);

    validatedVin = vin;

    vinEl.value = vin;
    yearEl.value = clean(decoded?.year);
    makeEl.value = clean(decoded?.make);
    modelEl.value = clean(decoded?.model);

    await loadEstimate();

    setMsg("Vehicle ready.");

    customerNameEl.focus();

    updateSendButton();
  }

  // ====================================================
  // SCAN VIN
  // ====================================================

  scanVinBtn.addEventListener("click", async () => {
    setMsg("");
    scannerStatus.textContent = "";

    try {
      scanVinBtn.disabled = true;

      openScannerView();

      const result = await scanVinWithCamera(scannerVideo, scannerStatus);

      closeScannerView();

      const vin = normalizeVin(result?.vin);

      if (!vin) {
        setMsg(result?.reason || "VIN was not detected.", false);

        return;
      }

      await processVin(vin);
    } catch (error) {
      console.error(error);

      closeScannerView();

      setMsg(error?.message || "Could not scan VIN.", false);
    } finally {
      scanVinBtn.disabled = false;
    }
  });

  // ====================================================
  // MANUAL VIN
  // ====================================================

  vinEl.addEventListener("change", async () => {
    const vin = normalizeVin(vinEl.value);

    if (!vin) {
      clearVehicle();
      return;
    }

    try {
      await processVin(vin);
    } catch (error) {
      console.error(error);

      setMsg(error?.message || "Could not process VIN.", false);
    }
  });

  // ====================================================
  // FORM STATE
  // ====================================================

  customerNameEl.addEventListener("input", updateSendButton);

  customerPhoneEl.addEventListener("input", updateSendButton);

  // ====================================================
  // SEND TO WASH
  // ====================================================

  sendBtn.addEventListener("click", async () => {
    setMsg("");

    if (!washIsOpen) {
      setMsg("Wash is currently closed.", false);
      return;
    }

    if (!validatedVin) {
      setMsg("Scan the VIN first.", false);
      return;
    }

    const customerName = clean(customerNameEl.value);
    const customerPhone = clean(customerPhoneEl.value);

    if (!customerName) {
      setMsg("Enter customer name.", false);
      customerNameEl.focus();
      return;
    }

    if (!customerPhone) {
      setMsg("Enter customer phone number.", false);
      customerPhoneEl.focus();
      return;
    }

    try {
      sendBtn.disabled = true;

      /*
       * Refresh the estimate immediately before sending
       * because another vehicle may have entered the queue.
       */
      await loadEstimate();

      if (!washIsOpen || !currentEstimate) {
        setMsg("Wash is currently closed.", false);
        return;
      }

      const courtesyWash = await createCourtesyWash({
        vin: validatedVin,

        year: yearEl.value,
        make: makeEl.value,
        model: modelEl.value,

        customerName,
        customerPhone,

        estimatedCompletionAtMs: currentEstimate.estimatedCompletionAtMs,
      });

      const completionTime = formatTime(
        currentEstimate.estimatedCompletionAtMs,
      );

      setMsg(`Courtesy Wash sent. Estimated completion: ${completionTime}`);

      clearForm();

      customerNameEl.focus();

      console.log("Courtesy Wash created:", courtesyWash.id);
    } catch (error) {
      console.error(error);

      setMsg(error?.message || "Could not send Courtesy Wash.", false);
    } finally {
      updateSendButton();
    }
  });

  // ====================================================
  // INITIAL STATE
  // ====================================================

  if (!currentSession?.dealerId) {
    setMsg("Dealer session not ready.", false);
    return;
  }

  clearForm();

  try {
    const washSettings = await getWashSettings();

    washIsOpen = Boolean(washSettings?.isOpen);

    if (!washIsOpen) {
      setMsg("Wash is currently closed.", false);
    }
  } catch (error) {
    console.error(error);

    setMsg("Could not load Wash status.", false);
  }
});

// ======================================================
// SESSION
// ======================================================

function waitForSession() {
  return new Promise((resolve) => {
    const existing = getSession();

    if (existing?.dealerId) {
      resolve(existing);
      return;
    }

    window.addEventListener("dexp-session-ready", () => resolve(getSession()), {
      once: true,
    });
  });
}
