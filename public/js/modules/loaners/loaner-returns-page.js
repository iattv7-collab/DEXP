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
  decodeVinLive,
} from "/js/modules/loaners/vin-scanner.js";

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

    const fleetRef = doc(db, "loanerFleet", cleanVin);
    const fleetSnap = await getDoc(fleetRef);

    if (!fleetSnap.exists()) {
      return {
        valid: false,
        message: "This vehicle was not found in the loaner fleet.",
        fleetRef,
        fleetData: null,
      };
    }

    const fleetData = fleetSnap.data() || {};

    if (fleetData.dealerId !== currentDealerId) {
      return {
        valid: false,
        message: "This vehicle does not belong to this dealer.",
        fleetRef,
        fleetData,
      };
    }

    const fleetStatus = String(fleetData.status || "")
      .trim()
      .toUpperCase();

    if (fleetStatus !== "OUT") {
      return {
        valid: false,
        message: "Return rejected. This vehicle is not currently out on loan.",
        fleetRef,
        fleetData,
      };
    }

    return {
      valid: true,
      message: "",
      fleetRef,
      fleetData,
    };
  }

  async function fillReturnFromVin(rawVin) {
  const vin = normalizeVin(rawVin);

  $("vin").value = "";

    if (!vin) {
      $("returnMsg").textContent = "Invalid VIN";
      return;
    }

    $("returnMsg").textContent = "Checking fleet status...";

    const validation = await validateLoanerForReturn(vin);

    if (!validation.valid) {
  [
    "manualVin",
    "vin",
    "year",
    "model",
    "returnedAt",
    "receivedBy",
    "mileage",
    "fuelLevel",
    "damageNotes",
  ].forEach((id) => {
    if ($(id)) $(id).value = "";
  });

  $("returnMsg").textContent = validation.message;
  return;
}

    $("returnMsg").textContent = "Decoding VIN...";

    try {
      const decoded = await decodeVinLive(vin);

      $("vin").value = vin;
      $("year").value = decoded?.year || "";
      $("model").value = decoded?.model || "";
      $("returnedAt").value = stampNow();
      $("receivedBy").value =
        currentSession?.displayName || auth.currentUser?.displayName || "";

      $("returnMsg").textContent = "";
      $("mileage")?.focus();
    } catch (err) {
      console.error("VIN decode failed:", err);

      $("vin").value = vin;
      $("year").value = "";
      $("model").value = "";
      $("returnedAt").value = stampNow();
      $("receivedBy").value =
        currentSession?.displayName || auth.currentUser?.displayName || "";

      $("returnMsg").textContent = "VIN scanned, decode failed";
    }
  }

  $("scanReturnBtn").addEventListener("click", async () => {
    try {
      status.textContent = "Scanning VIN...";
      openScannerFullscreen();

      const res = await scanVinWithCamera(video, status);

      closeScannerFullscreen();

      if (res?.vin) {
        await fillReturnFromVin(res.vin);
        status.textContent = "VIN captured. Verify before saving.";
      } else {
        status.textContent = res?.reason || "No VIN found";
      }
    } catch (err) {
      closeScannerFullscreen();
      console.error("Scan failed:", err);
      status.textContent = err.message || "Camera error";
      $("returnMsg").textContent = err.message || "Camera error";
    }
  });

  $("manualVin")?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await fillReturnFromVin($("manualVin").value);
    }
  });


      $("saveReturnBtn").addEventListener("click", async () => {
    const vin = normalizeVin($("vin").value);

    if (!vin) {
      $("returnMsg").textContent = "VIN is required";
      return;
    }

    if (!currentDealerId) {
      $("returnMsg").textContent = "Dealer session not ready";
      return;
    }

    $("returnMsg").textContent = "Checking fleet status...";

    const validation = await validateLoanerForReturn(vin);

    if (!validation.valid) {
      $("returnMsg").textContent = validation.message;
      return;
    }

    const fleetRef = validation.fleetRef;
    const fleetData = validation.fleetData || {};
    const assignedRo = String(fleetData.assignedRo || "").trim();

    const returnedAtText = $("returnedAt")?.value || stampNow();
    const receivedByName = $("receivedBy")?.value || "";
    const receivedByEmail =
      currentSession?.email || auth.currentUser?.email || "";
    const receivedByUid =
      currentSession?.uid || auth.currentUser?.uid || "";
    const mileage = $("mileage")?.value || "";
    const fuelLevel = $("fuelLevel")?.value || "";
    const damageNotes = $("damageNotes")?.value || "";
    const year = $("year")?.value || "";
    const model = $("model")?.value || "";

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
        mileage,
        fuelLevel,
        damageNotes,
        assignedRo,
        createdAt: serverTimestamp(),
      });

      await setDoc(
        fleetRef,
        {
          status: "At Wash",
          assignedRo: "",
          lastReturnedAt: returnedAtText,
          lastReceivedByName: receivedByName,
          lastReceivedByEmail: receivedByEmail,
          lastReceivedByUid: receivedByUid,
          lastMileage: mileage,
          lastFuelLevel: fuelLevel,
          lastDamageNotes: damageNotes,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (assignedRo) {
        await clearLoanerFromRo(assignedRo, vin);
      }

      $("returnMsg").textContent = "Saved and moved to At Wash";

      [
        "manualVin",
        "vin",
        "year",
        "model",
        "returnedAt",
        "receivedBy",
        "mileage",
        "fuelLevel",
        "damageNotes",
      ].forEach((id) => {
        if ($(id)) $(id).value = "";
      });
    } catch (err) {
      console.error("Return save failed:", err);
      $("returnMsg").textContent = "Return could not be saved.";
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
        let out = 0;
        let available = 0;
        let inShop = 0;

        snap.forEach((d) => {
          const s = (d.data().status || "").toUpperCase();

          if (s === "OUT") out++;
          else if (s === "AVAILABLE") available++;
          else if (s === "REMOVED") return;
          else inShop++;
        });

        const el = $("loanerCounts");

        if (el) {
          el.textContent = `Out: ${out} | Available: ${available} | In Shop: ${inShop}`;
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
