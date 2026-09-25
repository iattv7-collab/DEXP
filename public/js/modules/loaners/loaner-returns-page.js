// ======================================================
// FILE: /public/js/modules/loaners/loaner-returns-page.js
// MODULE: Loaners
// PURPOSE:
// DEXP Loaner Returns page logic.
// Migrated from ArrowFlow Loaner Returns while keeping
// the same return intake, VIN scan/decode, return save,
// fleet update, counts, and return history behavior.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  scanVinWithCamera,
  normalizeVin,
  isValidVin,
  decodeVinLive,
} from "/js/modules/loaners/vin-scanner.js";

const VIN_REJECT_NOT_IN_FLEET =
  "VIN rejected — not in loaner fleet. Try again.";
const VIN_REJECT_NOT_CHECKED_OUT =
  "VIN rejected — loaner is not checked out.";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute();

  renderAppHeader();

  const video = $("scannerVideo");
  const status = $("scannerStatus");

  let currentSession = getSession();
  let currentDealerId = currentSession?.dealerId || "";
  let unsubscribeReturns = null;
  let unsubscribeFleetCounts = null;
  const RETURN_FORM_FIELD_IDS = [
    "vin",
    "year",
    "model",
    "returnedAt",
    "receivedBy",
    "mileage",
    "fuelLevel",
    "damageYesNo",
    "damageNotes",
    "returnDestination",
  ];

  let validatedReturnVin = "";
  let savedReturnSnapshot = "";
  let returnSaveInProgress = false;
  let checkoutMileage = null;

  function getReturnFormSnapshot() {
    return JSON.stringify(
      RETURN_FORM_FIELD_IDS.reduce((values, id) => {
        values[id] = String($(id)?.value || "").trim();
        return values;
      }, {}),
    );
  }

  function updateSaveReturnButton() {
    const button = $("saveReturnBtn");

    if (!button) return;

    const currentVin = normalizeVin($("vin")?.value);
    const hasValidatedVin =
      Boolean(validatedReturnVin) && currentVin === validatedReturnVin;

    const mileageValue = Number($("mileage")?.value);
    const hasMileage =
      String($("mileage")?.value || "").trim() !== "" &&
      Number.isFinite(mileageValue);
    const mileageOk =
      hasMileage &&
      (checkoutMileage == null || mileageValue > checkoutMileage);

    const fuelOk = Boolean(String($("fuelLevel")?.value || "").trim());
    const damageChoice = String($("damageYesNo")?.value || "").trim();
    const damageOk = damageChoice === "Yes" || damageChoice === "No";
    const notesOk =
      damageChoice !== "Yes" ||
      Boolean(String($("damageNotes")?.value || "").trim());

    button.disabled =
      returnSaveInProgress ||
      !hasValidatedVin ||
      !mileageOk ||
      !fuelOk ||
      !damageOk ||
      !notesOk;

    button.textContent = returnSaveInProgress ? "Saving..." : "Save Return";
  }

  function setVinRejectMessage(message) {
    const rejectEl = $("vinRejectMsg");

    if (rejectEl) {
      rejectEl.textContent = message || "";
    }
  }

  function applyRetireBanner(fleetData = {}) {
    const banner = $("retireReturnBanner");
    const destination = $("returnDestination");
    const flagged = fleetData?.retireOnReturn === true;
    if (banner) banner.style.display = flagged ? "" : "none";
    if (destination) destination.style.display = flagged ? "none" : "";
  }

  function applyCheckoutMileage(fleetData) {
    const rawCheckout = Number(fleetData?.lastMileage);
    checkoutMileage = Number.isFinite(rawCheckout) ? rawCheckout : null;

    if ($("mileage")) {
      $("mileage").placeholder =
        checkoutMileage == null
          ? "Return mileage"
          : `Must be more than ${checkoutMileage}`;
    }
  }

  function clearReturnForm() {
    ["manualVin", ...RETURN_FORM_FIELD_IDS].forEach((id) => {
      if ($(id)) {
        $(id).value = "";
      }
    });

    if ($("returnDestination")) {
      $("returnDestination").value = "At Wash";
    }
    applyRetireBanner({});

    if ($("mileage")) {
      $("mileage").placeholder = "Return mileage";
    }

    validatedReturnVin = "";
    checkoutMileage = null;
    setVinRejectMessage("");
    savedReturnSnapshot = getReturnFormSnapshot();
    updateSaveReturnButton();
  }

  function waitForSession() {
    return new Promise((resolve) => {
      const existing = getSession();

      if (existing?.dealerId) {
        resolve(existing);
        return;
      }

      window.addEventListener(
        "dexp-session-ready",
        () => {
          resolve(getSession());
        },
        { once: true },
      );
    });
  }

  function openScannerFullscreen() {
    if (!video) return;

    video.style.display = "block";
    video.style.position = "fixed";
    video.style.top = "0";
    video.style.left = "0";
    video.style.width = "100vw";
    video.style.height = "100vh";
    video.style.objectFit = "cover";
    video.style.zIndex = "9999";
    video.style.background = "#000";

    if (video.requestFullscreen) {
      video.requestFullscreen().catch(() => {});
    }
  }

  function closeScannerFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    video.removeAttribute("style");
    video.style.display = "none";
  }

  function stampNow() {
    return new Date().toLocaleString();
  }

  async function resolveReturnVin(rawValue) {
    const searchValue = String(rawValue || "")
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();

    if (!searchValue) {
      return {
        valid: false,
        message: "Enter a full VIN, last 8, or last 6.",
        vin: "",
      };
    }

    if (!currentDealerId) {
      return {
        valid: false,
        message: "Dealer session not ready.",
        vin: "",
      };
    }

    if (searchValue.length === 17) {
      const fullVin = normalizeVin(searchValue);

      if (!isValidVin(fullVin)) {
        return {
          valid: false,
          message: "VIN rejected — not a valid VIN. Try again.",
          vin: "",
        };
      }

      return {
        valid: true,
        message: "",
        vin: fullVin,
      };
    }

    if (searchValue.length !== 8 && searchValue.length !== 6) {
      return {
        valid: false,
        message: "Enter a full VIN, last 8, or last 6.",
        vin: "",
      };
    }

    const fleetQuery = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
    );

    const fleetSnapshot = await getDocs(fleetQuery);

    const matches = [];

    fleetSnapshot.forEach((fleetDocument) => {
      const fleetData = fleetDocument.data() || {};

      const fleetVin = normalizeVin(fleetData.vin || fleetDocument.id || "");

      if (!fleetVin) return;

      if (fleetVin.endsWith(searchValue)) {
        matches.push(fleetVin);
      }
    });

    if (!matches.length) {
      return {
        valid: false,
        message: "No loaner was found with those VIN digits.",
        vin: "",
      };
    }

    if (matches.length > 1) {
      return {
        valid: false,
        message:
          "More than one loaner matches those digits. Enter the last 8 or full VIN.",
        vin: "",
      };
    }

    return {
      valid: true,
      message: "",
      vin: matches[0],
    };
  }

  async function findFleetDocForVin(vin) {
    const cleanVin = normalizeVin(vin);

    if (!cleanVin || !currentDealerId) {
      return null;
    }

    const byIdRef = doc(db, "loanerFleet", cleanVin);
    const byIdSnap = await getDoc(byIdRef);

    if (byIdSnap.exists()) {
      const fleetData = byIdSnap.data() || {};
      const fleetVin = normalizeVin(fleetData.vin || byIdSnap.id);
      const sameDealer =
        !fleetData.dealerId || fleetData.dealerId === currentDealerId;

      if (sameDealer && fleetVin === cleanVin) {
        return { fleetRef: byIdRef, fleetData };
      }
    }

    const vinQuery = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
      where("vin", "==", cleanVin),
    );

    const vinSnap = await getDocs(vinQuery);

    if (!vinSnap.empty) {
      const match = vinSnap.docs[0];
      return { fleetRef: match.ref, fleetData: match.data() || {} };
    }

    const dealerQuery = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
    );

    const dealerSnap = await getDocs(dealerQuery);

    let found = null;

    dealerSnap.forEach((fleetDocument) => {
      if (found) return;

      const fleetData = fleetDocument.data() || {};
      const fleetVin = normalizeVin(fleetData.vin || fleetDocument.id);

      if (fleetVin === cleanVin) {
        found = { fleetRef: fleetDocument.ref, fleetData };
      }
    });

    return found;
  }

  async function validateLoanerForReturn(vin) {
    const cleanVin = normalizeVin(vin);

    if (!cleanVin || !currentDealerId) {
      return {
        valid: false,
        message: "Invalid VIN or dealer session.",
        fleetRef: null,
        fleetData: null,
      };
    }

    const match = await findFleetDocForVin(cleanVin);

    if (!match) {
      return {
        valid: false,
        message: VIN_REJECT_NOT_IN_FLEET,
        fleetRef: null,
        fleetData: null,
      };
    }

    if (
      match.fleetData.dealerId &&
      match.fleetData.dealerId !== currentDealerId
    ) {
      return {
        valid: false,
        message: "This vehicle does not belong to this dealer.",
        fleetRef: match.fleetRef,
        fleetData: match.fleetData,
      };
    }

    const fleetStatus = String(match.fleetData.status || "")
      .trim()
      .toUpperCase();

    if (fleetStatus !== "OUT") {
      return {
        valid: false,
        message: VIN_REJECT_NOT_CHECKED_OUT,
        fleetRef: match.fleetRef,
        fleetData: match.fleetData,
      };
    }

    return {
      valid: true,
      message: "",
      fleetRef: match.fleetRef,
      fleetData: match.fleetData,
    };
  }

  async function fillReturnFromVin(rawVin) {
    validatedReturnVin = "";
    checkoutMileage = null;
    $("vin").value = "";
    setVinRejectMessage("");
    $("returnMsg").textContent = "";
    updateSaveReturnButton();

    $("scannerStatus").textContent = "Searching loaner fleet...";

    const resolvedVin = await resolveReturnVin(rawVin);

    if (!resolvedVin.valid) {
      clearReturnForm();
      setVinRejectMessage(resolvedVin.message);
      return;
    }

    const vin = resolvedVin.vin;

    $("scannerStatus").textContent = "Checking fleet status...";

    const validation = await validateLoanerForReturn(vin);

    if (!validation.valid) {
      clearReturnForm();
      setVinRejectMessage(validation.message);
      return;
    }

    applyCheckoutMileage(validation.fleetData);
    applyRetireBanner(validation.fleetData);

    $("scannerStatus").textContent = "Decoding VIN...";

    try {
      const decoded = await decodeVinLive(vin);

      $("vin").value = vin;
      $("year").value = decoded?.year || "";
      $("model").value = decoded?.model || "";
      $("returnedAt").value = stampNow();
      $("receivedBy").value =
        currentSession?.displayName || auth.currentUser?.displayName || "";

      validatedReturnVin = vin;
      setVinRejectMessage("");
      $("returnMsg").textContent = "";
      $("scannerStatus").textContent = "VIN captured. Verify before saving.";
      updateSaveReturnButton();
      $("mileage")?.focus();
    } catch (err) {
      console.error("VIN decode failed:", err);

      $("vin").value = vin;
      $("year").value = "";
      $("model").value = "";
      $("returnedAt").value = stampNow();
      $("receivedBy").value =
        currentSession?.displayName || auth.currentUser?.displayName || "";

      validatedReturnVin = vin;
      $("returnMsg").textContent = "VIN scanned, decode failed";
      updateSaveReturnButton();
    }
  }

  RETURN_FORM_FIELD_IDS.forEach((id) => {
    $(id)?.addEventListener("input", () => {
      if (id === "vin") {
        const currentVin = normalizeVin($("vin")?.value);

        if (currentVin !== validatedReturnVin) {
          validatedReturnVin = "";
        }
      }

      updateSaveReturnButton();
    });

    $(id)?.addEventListener("change", updateSaveReturnButton);
  });

  savedReturnSnapshot = getReturnFormSnapshot();
  updateSaveReturnButton();

  $("scanReturnBtn").addEventListener("click", async () => {
    try {
      status.textContent = "Scanning VIN...";
      openScannerFullscreen();

      const res = await scanVinWithCamera(video, status);

      closeScannerFullscreen();

      if (res?.vin && isValidVin(res.vin)) {
        await fillReturnFromVin(res.vin);
      } else {
        validatedReturnVin = "";
        updateSaveReturnButton();
        status.textContent = res?.reason || "No VIN found";
        setVinRejectMessage(
          res?.reason || "No valid VIN captured. Press Scan VIN to retry.",
        );
      }
    } catch (err) {
      closeScannerFullscreen();
      console.error("Scan failed:", err);
      status.textContent = err.message || "Camera error";
      setVinRejectMessage(err.message || "Camera error");
    }
  });

  async function searchManualReturnVin() {
    const manualVinInput = $("manualVin");
    const findButton = $("findReturnVinBtn");

    if (!manualVinInput || !findButton) return;

    const searchValue = manualVinInput.value.trim();

    if (!searchValue) {
      setVinRejectMessage("Enter a full VIN, last 8, or last 6.");

      manualVinInput.focus();
      return;
    }

    findButton.disabled = true;
    findButton.textContent = "Finding...";

    try {
      await fillReturnFromVin(searchValue);
    } finally {
      findButton.disabled = false;
      findButton.textContent = "Find";
    }
  }

  $("manualVin")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    await searchManualReturnVin();
  });

  const manualVinInput = $("manualVin");
  const findReturnVinBtn = $("findReturnVinBtn");

  function updateFindButton() {
    if (!manualVinInput || !findReturnVinBtn) return;

    findReturnVinBtn.disabled = manualVinInput.value.trim().length === 0;
  }

  manualVinInput?.addEventListener("input", updateFindButton);

  findReturnVinBtn?.addEventListener("click", async () => {
    findReturnVinBtn.disabled = true;

    try {
      await searchManualReturnVin();
    } finally {
      updateFindButton();
    }
  });

  updateFindButton();

  $("saveReturnBtn").addEventListener("click", async () => {
    if (returnSaveInProgress) return;

    const vin = normalizeVin($("vin").value);

    if (!vin || vin !== validatedReturnVin) {
      setVinRejectMessage("Scan or validate the loaner VIN before saving.");
      $("returnMsg").textContent = "";
      updateSaveReturnButton();
      return;
    }

    if (!currentDealerId) {
      $("returnMsg").textContent = "Dealer session not ready";
      return;
    }

    const mileageValue = Number($("mileage")?.value);
    const fuelValue = String($("fuelLevel")?.value || "").trim();
    const damageChoice = String($("damageYesNo")?.value || "").trim();
    const notesValue = String($("damageNotes")?.value || "").trim();

    if (!Number.isFinite(mileageValue) || String($("mileage")?.value || "").trim() === "") {
      $("returnMsg").textContent = "Mileage is required.";
      return;
    }

    if (checkoutMileage != null && mileageValue <= checkoutMileage) {
      $("returnMsg").textContent = `Mileage must be more than ${checkoutMileage}.`;
      return;
    }

    if (!fuelValue) {
      $("returnMsg").textContent = "Fuel level is required.";
      return;
    }

    if (damageChoice !== "Yes" && damageChoice !== "No") {
      $("returnMsg").textContent = "Choose Damage Yes or No.";
      return;
    }

    if (damageChoice === "Yes" && !notesValue) {
      $("returnMsg").textContent = "Enter damage notes.";
      return;
    }

    const damageRecord =
      damageChoice === "Yes" ? `Yes — ${notesValue}` : "No";

    $("returnMsg").textContent = "Checking fleet status...";

    const validation = await validateLoanerForReturn(vin);

    if (!validation.valid) {
      setVinRejectMessage(validation.message);
      $("returnMsg").textContent = "";
      validatedReturnVin = "";
      updateSaveReturnButton();
      return;
    }

    const fleetRef = validation.fleetRef;
    const fleetData = validation.fleetData || {};
    const assignedRo = String(fleetData.assignedRo || "").trim();

    const returnedAtText = $("returnedAt")?.value || stampNow();
    const receivedByName = $("receivedBy")?.value || "";
    const receivedByEmail =
      currentSession?.email || auth.currentUser?.email || "";
    const receivedByUid = currentSession?.uid || auth.currentUser?.uid || "";
    const year = $("year")?.value || "";
    const model = $("model")?.value || "";
    const retireOnReturn = validation.fleetData?.retireOnReturn === true;
    const returnDestination = retireOnReturn
      ? "Retired"
      : String($("returnDestination")?.value || "At Wash").trim() === "Available"
        ? "Available"
        : "At Wash";

    returnSaveInProgress = true;
    updateSaveReturnButton();

    try {
      await addDoc(collection(db, "loanerReturns"), {
        dealerId: currentDealerId,
        vin,
        year,
        model,
        returnedAtText,
        receivedByName,
        receivedByEmail,
        receivedByUid,
        mileage: String(mileageValue),
        checkoutMileage:
          checkoutMileage == null ? "" : String(checkoutMileage),
        fuelLevel: fuelValue,
        damageNotes: damageRecord,
        assignedRo,
        createdAt: serverTimestamp(),
      });

      await setDoc(
        fleetRef,
        {
          status: returnDestination,
          location: retireOnReturn ? "Retired" : fleetData.location || "",
          assignedRo: "",
          lastReturnedAt: returnedAtText,
          lastReceivedByName: receivedByName,
          lastReceivedByEmail: receivedByEmail,
          lastReceivedByUid: receivedByUid,
          lastMileage: String(mileageValue),
          lastFuelLevel: fuelValue,
          lastDamageNotes: damageRecord,
          retireOnReturn: false,
          ...(retireOnReturn
            ? {
                retiredAtMs: Date.now(),
                retiredAtText: returnedAtText,
                retiredByName: receivedByName,
              }
            : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (assignedRo) {
        await clearLoanerFromRo(assignedRo, vin);
      }

      $("returnMsg").textContent = retireOnReturn
        ? "Saved. Unit retired — not sent to wash."
        : returnDestination === "Available"
          ? "Saved and marked Available"
          : "Saved and moved to At Wash";

      clearReturnForm();
    } catch (err) {
      console.error("Return save failed:", err);
      $("returnMsg").textContent = "Return could not be saved.";
    } finally {
      returnSaveInProgress = false;
      updateSaveReturnButton();
    }
  });

  async function clearLoanerFromRo(roNumber, vin) {
    const cleanRo = String(roNumber || "").trim();

    if (!cleanRo || !currentDealerId) return;

    const roDoc = await findRoByNumber(cleanRo);

    if (!roDoc) return;

    const roData = roDoc.data() || {};

    if (
      roData.loanerVin &&
      normalizeVin(roData.loanerVin) !== normalizeVin(vin)
    ) {
      return;
    }

    await setDoc(
      roDoc.ref,
      {
        hasLoaner: false,
        loanerUnitNumber: "",
        loanerVin: "",
        loanerStatus: "",
        loanerAssignedAt: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function findRoByNumber(roNumber) {
    const cleanRo = String(roNumber || "").trim();

    if (!cleanRo || !currentDealerId) return null;

    const roNumberQuery = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where("roNumber", "==", cleanRo),
    );

    const roNumberSnap = await getDocs(roNumberQuery);

    if (!roNumberSnap.empty) {
      return roNumberSnap.docs[0];
    }

    const legacyRoQuery = query(
      collection(db, "ros"),
      where("dealerId", "==", currentDealerId),
      where("ro", "==", cleanRo),
    );

    const legacyRoSnap = await getDocs(legacyRoQuery);

    if (!legacyRoSnap.empty) {
      return legacyRoSnap.docs[0];
    }

    return null;
  }

  async function updateCounts() {
    if (!currentDealerId || unsubscribeFleetCounts) return;

    const q = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
    );

    unsubscribeFleetCounts = onSnapshot(
      q,
      (snap) => {
        let total = 0;
        let out = 0;
        let available = 0;
        let atWash = 0;
        let inShop = 0;

        snap.forEach((documentSnapshot) => {
          const status = String(documentSnapshot.data().status || "")
            .trim()
            .toUpperCase();

          if (status === "REMOVED" || status === "RETIRED") {
            return;
          }

          total++;

          if (status === "OUT") {
            out++;
          } else if (status === "AVAILABLE") {
            available++;
          } else if (status === "AT WASH") {
            atWash++;
          } else if (status === "DISABLED" || status === "HOLD") {
            inShop++;
          }
        });

        const totalCount = $("loanerTotalCount");
        const outCount = $("loanerOutCount");
        const availableCount = $("loanerAvailableCount");
        const atWashCount = $("loanerAtWashCount");
        const inShopCount = $("loanerInShopCount");

        if (totalCount) {
          totalCount.textContent = String(total);
        }

        if (outCount) {
          outCount.textContent = String(out);
        }

        if (availableCount) {
          availableCount.textContent = String(available);
        }

        if (atWashCount) {
          atWashCount.textContent = String(atWash);
        }

        if (inShopCount) {
          inShopCount.textContent = String(inShop);
        }
      },
      (err) => {
        console.error("Fleet count listener failed:", err);
      },
    );
  }

  async function load() {
    if (!currentDealerId || unsubscribeReturns) return;

    const q = query(
      collection(db, "loanerReturns"),
      where("dealerId", "==", currentDealerId),
    );

    unsubscribeReturns = onSnapshot(
      q,
      (snap) => {
        let html = `
          <table class="data-table">
            <thead>
              <tr>
                <th>VIN</th>
                <th>Year</th>
                <th>Model</th>
                <th>Returned At</th>
                <th>Received By</th>
                <th>Mileage</th>
                <th>Fuel</th>
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>
        `;

        snap.forEach((d) => {
          const x = d.data();

          html += `
            <tr>
              <td>${escapeHtml(x.vin || "")}</td>
              <td>${escapeHtml(x.year || "")}</td>
              <td>${escapeHtml(x.model || "")}</td>
              <td>${escapeHtml(x.returnedAtText || "")}</td>
              <td>${escapeHtml(x.receivedByName || "")}</td>
              <td>${escapeHtml(x.mileage || "")}</td>
              <td>${escapeHtml(x.fuelLevel || "")}</td>
              <td>${escapeHtml(x.damageNotes || "")}</td>
            </tr>
          `;
        });

        html += `
            </tbody>
          </table>
        `;

        $("returnTable").innerHTML = html;
      },
      (err) => {
        console.error("Returns listener failed:", err);
      },
    );
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  }

  currentSession = await waitForSession();
  currentDealerId = currentSession?.dealerId || "";

  await load();
  await updateCounts();

  window.addEventListener("beforeunload", () => {
    if (unsubscribeReturns) {
      unsubscribeReturns();
      unsubscribeReturns = null;
    }

    if (unsubscribeFleetCounts) {
      unsubscribeFleetCounts();
      unsubscribeFleetCounts = null;
    }
  });
});