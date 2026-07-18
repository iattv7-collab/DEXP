// ======================================================
// FILE: /public/js/modules/loaners/loaners-page.js
// MODULE: Loaners
// PURPOSE:
// DEXP Loaners Fleet page logic.
// Migrated from ArrowFlow Loaners while keeping the
// same workflow, fields, buttons, status rules, counts,
// VIN scan/decode behavior, RO assignment rules,
// and soft-remove process.
// ======================================================

import { auth } from "/js/services/firebase/auth-service.js";
import { db } from "/js/services/firebase/firestore.js";
import { getSession } from "/js/core/session.js";
import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";

import {
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  scanVinWithCamera,
  normalizeVin,
  decodeVinLive,
} from "/js/modules/loaners/vin-scanner.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["loaner-fleet"],
  });

  renderAppHeader();

  const video = $("scannerVideo");
  const status = $("scannerStatus");

  let fleetRows = [];
  let currentSession = getSession();
  let currentDealerId = currentSession?.dealerId || "";
  let unsubscribeFleet = null;
  let validatedFleetVin = "";
  let fleetSaveInProgress = false;

  function updateSaveFleetButton() {
    const button = $("saveFleetBtn");

    if (!button) return;

    const currentVin = normalizeVin($("vin")?.value);

    button.disabled =
      fleetSaveInProgress ||
      !validatedFleetVin ||
      currentVin !== validatedFleetVin;

    button.textContent = fleetSaveInProgress ? "Saving..." : "Save";
  }

  function clearAddLoanerForm() {
    [
      "manualVin",
      "vin",
      "last8",
      "year",
      "make",
      "model",
      "unitNumber",
      "plate",
    ].forEach((id) => {
      if ($(id)) {
        $(id).value = "";
      }
    });

    validatedFleetVin = "";
    $("fleetMsg").textContent = "";
    updateSaveFleetButton();
  }

  function closeAddLoanerForm() {
    const section = $("addLoanerSection");
    const toggleButton = $("toggleAddLoanerBtn");

    if (section) {
      section.style.display = "none";
    }

    if (toggleButton) {
      toggleButton.style.display = "";
    }

    clearAddLoanerForm();
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

  $("toggleAddLoanerBtn")?.addEventListener("click", () => {
    const section = $("addLoanerSection");
    const toggleButton = $("toggleAddLoanerBtn");

    if (!section || !toggleButton) return;

    clearAddLoanerForm();

    section.style.display = "block";
    toggleButton.style.display = "none";

    $("manualVin")?.focus();
  });

  $("scanFleetBtn").onclick = async () => {
    try {
      status.textContent = "Scanning VIN...";
      openScannerFullscreen();

      const res = await scanVinWithCamera(video, status);

      closeScannerFullscreen();

      if (res?.vin) {
        await fill(res.vin);
        status.textContent = "VIN scanned. Please verify before saving.";
      } else {
        status.textContent = res?.reason || "No VIN found";
      }
    } catch (err) {
      closeScannerFullscreen();
      console.error("Scan failed:", err);
      status.textContent = "Scan failed";
    }
  };

  $("manualVin")?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await fill($("manualVin").value);
    }
  });

  $("fleetSearch")?.addEventListener("input", renderFleetTable);

  async function fill(rawVin) {
    const vin = normalizeVin(rawVin);

    validatedFleetVin = "";
    updateSaveFleetButton();

    $("vin").value = vin;
    $("last8").value = vin ? vin.slice(-8) : "";

    $("year").value = "";
    $("make").value = "";
    $("model").value = "";

    if (!vin) {
      $("fleetMsg").textContent = "Enter or scan a valid VIN.";
      return;
    }

    if (!currentDealerId) {
      $("fleetMsg").textContent = "Dealer session not ready.";
      return;
    }

    $("fleetMsg").textContent = "Checking VIN...";

    try {
      const fleetRef = doc(db, "loanerFleet", vin);
      const fleetSnapshot = await getDoc(fleetRef);

      if (fleetSnapshot.exists()) {
        $("fleetMsg").textContent = "This VIN is already in the loaner fleet.";

        updateSaveFleetButton();
        return;
      }

      $("fleetMsg").textContent = "Decoding VIN...";

      try {
        const decoded = await decodeVinLive(vin);

        $("year").value = decoded?.year || "";
        $("make").value = decoded?.make || "";
        $("model").value = decoded?.model || "";

        $("fleetMsg").textContent = "";
      } catch (error) {
        console.error("VIN decode failed:", error);

        $("year").value = "";
        $("make").value = "";
        $("model").value = "";

        $("fleetMsg").textContent =
          "VIN is valid, but vehicle details could not be decoded.";
      }

      validatedFleetVin = vin;
      updateSaveFleetButton();

      $("unitNumber")?.focus();
    } catch (error) {
      console.error("VIN validation failed:", error);

      $("fleetMsg").textContent = "The VIN could not be validated.";

      validatedFleetVin = "";
      updateSaveFleetButton();
    }
  }

  $("vin")?.addEventListener("input", () => {
    const currentVin = normalizeVin($("vin").value);

    if (currentVin !== validatedFleetVin) {
      validatedFleetVin = "";
    }

    updateSaveFleetButton();
  });

  updateSaveFleetButton();

  $("saveFleetBtn").onclick = async () => {
    if (fleetSaveInProgress) return;

    const vin = normalizeVin($("vin").value);

    if (!vin || vin !== validatedFleetVin) {
      $("fleetMsg").textContent = "Scan or validate the VIN before saving.";

      updateSaveFleetButton();
      return;
    }

    if (!currentDealerId) {
      $("fleetMsg").textContent = "Dealer session not ready.";
      return;
    }

    fleetSaveInProgress = true;
    updateSaveFleetButton();

    try {
      const fleetRef = doc(db, "loanerFleet", vin);
      const fleetSnapshot = await getDoc(fleetRef);

      /*
       * Recheck immediately before saving so two users
       * cannot add the same VIN at nearly the same time.
       */
      if (fleetSnapshot.exists()) {
        validatedFleetVin = "";

        $("fleetMsg").textContent = "This VIN is already in the loaner fleet.";

        return;
      }

      await setDoc(fleetRef, {
        vin,
        dealerId: currentDealerId,
        last8: vin.slice(-8),

        unitNumber: $("unitNumber").value.trim(),
        plate: $("plate").value.trim(),
        year: $("year").value.trim(),
        make: $("make").value.trim(),
        model: $("model").value.trim(),

        status: "Available",
        location: "Front Line",
        assignedRo: "",

        lastReturnedAt: "",
        lastReceivedByName: "",
        lastReceivedByEmail: "",
        lastReceivedByUid: "",
        lastMileage: "",
        lastFuelLevel: "",
        lastDamageNotes: "",

        washedAt: "",
        washedBy: "",
        outAt: "",
        notes: "",
        holdReason: "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      closeAddLoanerForm();
    } catch (error) {
      console.error("Loaner save failed:", error);

      $("fleetMsg").textContent = "The loaner could not be saved.";
    } finally {
      fleetSaveInProgress = false;
      updateSaveFleetButton();
    }
  };

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

  function getFilteredRows() {
    const q = ($("fleetSearch")?.value || "").trim().toUpperCase();

    if (!q) return [...fleetRows];

    return fleetRows.filter((x) => {
      return (
        String(x.vin || "")
          .toUpperCase()
          .includes(q) ||
        String(x.last8 || "")
          .toUpperCase()
          .includes(q) ||
        String(x.unitNumber || "")
          .toUpperCase()
          .includes(q) ||
        String(x.plate || "")
          .toUpperCase()
          .includes(q) ||
        String(x.year || "")
          .toUpperCase()
          .includes(q) ||
        String(x.make || "")
          .toUpperCase()
          .includes(q) ||
        String(x.model || "")
          .toUpperCase()
          .includes(q) ||
        String(x.status || "")
          .toUpperCase()
          .includes(q) ||
        String(x.location || "")
          .toUpperCase()
          .includes(q) ||
        String(x.assignedRo || "")
          .toUpperCase()
          .includes(q)
      );
    });
  }
  function renderFleetTable() {
    const filtered = getFilteredRows();

    let html = "";

    filtered.forEach((x) => {
      const vin = x.vin || "";
      const safeId = makeSafeId(vin);

      const rowStatus = String(x.status || "").toUpperCase();
      const showReturnDetails = rowStatus !== "OUT";

      let rowClass = "";

      if (rowStatus === "AVAILABLE") {
        rowClass = "loaner-row-available";
      } else if (rowStatus === "OUT") {
        rowClass = "loaner-row-out";
      } else if (rowStatus === "DISABLED") {
        rowClass = "loaner-row-disabled";
      }

      html += `
      <tr class="${rowClass}">
        <td class="col-unit">${escapeHtml(x.unitNumber || "")}</td>
        <td class="col-last8">${escapeHtml(x.last8 || "")}</td>
        <td class="col-year">${escapeHtml(x.year || "")}</td>
        <td class="col-make">${escapeHtml(x.make || "")}</td>
        <td class="col-model">${escapeHtml(x.model || "")}</td>
        <td class="col-plate">${escapeHtml(x.plate || "")}</td>

        <td class="col-ro">
          <input
            class="cell-edit"
            id="ro-${safeId}"
            value="${escapeAttr(x.assignedRo || "")}"
            placeholder="RO #"
          >
        </td>

        <td class="col-status">
          <select
            class="cell-edit"
            id="status-${safeId}"
          >
            ${statusOptions(x.status || "")}
          </select>
        </td>

        <td class="col-location">
          <input
            class="cell-edit"
            id="location-${safeId}"
            value="${escapeAttr(x.location || "")}"
            placeholder="Location"
          >
        </td>

        <td class="col-returned">
          ${escapeHtml(
            String(x.status || "").toLowerCase() === "out"
              ? x.outAt || ""
              : x.lastReturnedAt || "",
          )}
        </td>
        <td class="col-received">
          ${showReturnDetails ? escapeHtml(x.lastReceivedByName || "") : ""}
        </td>

        <td class="col-mileage">
          ${showReturnDetails ? escapeHtml(x.lastMileage || "") : ""}
        </td>

        <td class="col-fuel">
          ${showReturnDetails ? escapeHtml(x.lastFuelLevel || "") : ""}
        </td>

        <td class="col-damage">
          ${showReturnDetails ? escapeHtml(x.lastDamageNotes || "") : ""}
        </td>

        <td class="col-notes">
          <input
            class="cell-edit"
            id="notes-${safeId}"
            value="${escapeAttr(x.notes || "")}"
            placeholder="Notes"
          >
        </td>

        <td class="col-actions center">
          <div class="loaner-row-actions">
            <button
              type="button"
              data-vin="${escapeAttr(vin)}"
              class="save-row-btn loaner-small-action-button"
            >
              Update
            </button>

            <button
              type="button"
              data-vin="${escapeAttr(vin)}"
              class="remove-row-btn loaner-small-action-button"
            >
              Remove
            </button>
          </div>
        </td>
      </tr>
    `;
    });

    $("fleetTableBody").innerHTML = html;

    bindRowActions();
  }

  function bindRowActions() {
    document.querySelectorAll(".save-row-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await saveRow(btn.dataset.vin);
      });
    });

    document.querySelectorAll(".remove-row-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await removeRow(btn.dataset.vin);
      });
    });
  }

  async function saveRow(vin) {
    const cleanVin = normalizeVin(vin);

    if (!cleanVin) return;

    const safeId = makeSafeId(cleanVin);

    const assignedRo =
      document.getElementById(`ro-${safeId}`)?.value.trim() || "";

    const location =
      document.getElementById(`location-${safeId}`)?.value.trim() || "";

    const notes =
      document.getElementById(`notes-${safeId}`)?.value.trim() || "";

    let status = document.getElementById(`status-${safeId}`)?.value || "";

    let loanerOutAt = "";

    const fleetRow =
      fleetRows.find((x) => normalizeVin(x.vin) === cleanVin) || {};

    const previousRo = String(fleetRow.assignedRo || "").trim();

    if (assignedRo && previousRo && previousRo !== assignedRo) {
      alert(
        `This loaner is already assigned to RO # ${previousRo}. Return it first before assigning it to another RO.`,
      );
      return;
    }

    if (assignedRo) {
      const roDoc = await findRoByNumber(assignedRo);

      if (!roDoc) {
        alert(`RO # ${assignedRo} was not found in RO Tracker.`);
        return;
      }

      const roRef = roDoc.ref;
      const roData = roDoc.data();

      if (
        roData?.hasLoaner &&
        roData?.loanerVin &&
        normalizeVin(roData.loanerVin) !== cleanVin
      ) {
        alert(
          `RO # ${assignedRo} already has a different loaner assigned. Return that loaner first.`,
        );
        return;
      }

      status = "Out";
      loanerOutAt = new Date().toLocaleString();

      await setDoc(
        roRef,
        {
          hasLoaner: true,
          loanerUnitNumber: fleetRow.unitNumber || "",
          loanerVin: cleanVin,
          loanerStatus: "Out",
          loanerAssignedAt: serverTimestamp(),
          loanerOutAt,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    if (previousRo && previousRo !== assignedRo) {
      const previousRoDoc = await findRoByNumber(previousRo);

      if (previousRoDoc) {
        await setDoc(
          previousRoDoc.ref,
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
    }

    if (!assignedRo && previousRo) {
      status = status || "Available";
    }

    const fleetUpdate = {
      assignedRo,
      status,
      location,
      notes,
      updatedAt: serverTimestamp(),
    };

    if (assignedRo && status === "Out") {
      fleetUpdate.outAt = loanerOutAt;
    }

    await setDoc(doc(db, "loanerFleet", cleanVin), fleetUpdate, {
      merge: true,
    });

    await load();
  }

  async function removeRow(vin) {
    const cleanVin = normalizeVin(vin);

    if (!cleanVin) return;

    const fleetRow =
      fleetRows.find((x) => normalizeVin(x.vin) === cleanVin) || {};

    const assignedRo = String(fleetRow.assignedRo || "").trim();
    const status = String(fleetRow.status || "")
      .trim()
      .toUpperCase();

    if (assignedRo || status === "OUT") {
      alert(
        "This loaner is currently out. Return it before removing it from the fleet.",
      );
      return;
    }

    const skip = !!$("skipRemoveConfirm")?.checked;

    if (!skip) {
      const ok = window.confirm(
        `Remove loaner ${cleanVin.slice(-8)} from fleet?`,
      );

      if (!ok) return;
    }

    await deleteDoc(doc(db, "loanerFleet", cleanVin));
  }

  function statusOptions(selected) {
    const items = ["", "Available", "Out", "Disabled", "At Wash", "Hold"];

    return items
      .map((item) => {
        const sel = item === selected ? "selected" : "";
        const label = item || "Select";

        return `<option value="${escapeAttr(item)}" ${sel}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function makeSafeId(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "_");
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

  function escapeAttr(s) {
    return escapeHtml(s);
  }

    function updateCounts() {
    let total = 0;
    let out = 0;
    let available = 0;
    let atWash = 0;
    let inShop = 0;

    fleetRows.forEach((row) => {
      const status = String(row.status || "")
        .trim()
        .toUpperCase();

      if (status === "REMOVED") {
        return;
      }

      total++;

      if (status === "OUT") {
        out++;
      } else if (status === "AVAILABLE") {
        available++;
      } else if (status === "AT WASH") {
        atWash++;
      } else if (
        status === "DISABLED" ||
        status === "HOLD"
      ) {
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
  }

  async function load() {
    if (!currentDealerId || unsubscribeFleet) return;

    const q = query(
      collection(db, "loanerFleet"),
      where("dealerId", "==", currentDealerId),
    );

    unsubscribeFleet = onSnapshot(
      q,
      (snap) => {
        fleetRows = [];

        snap.forEach((d) => {
          const row = d.data();

          if ((row.status || "") === "Removed") return;

          fleetRows.push(row);
        });

        fleetRows.sort((a, b) => {
          const aAvailable =
            String(a.status || "").toUpperCase() === "AVAILABLE";

          const bAvailable =
            String(b.status || "").toUpperCase() === "AVAILABLE";

          if (aAvailable !== bAvailable) {
            return aAvailable ? -1 : 1;
          }

          return String(a.unitNumber || "").localeCompare(
            String(b.unitNumber || ""),
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            },
          );
        });

        renderFleetTable();
        updateCounts();
      },
      (err) => {
        console.error("Fleet listener failed:", err);
      },
    );
  }

  currentSession = await waitForSession();
  currentDealerId = currentSession?.dealerId || "";

  await load();

  window.addEventListener("beforeunload", () => {
    if (unsubscribeFleet) {
      unsubscribeFleet();
      unsubscribeFleet = null;
    }
  });
});
