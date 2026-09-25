// public/js/modules/loaners/loaner-manage-page.js

import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { db } from "/js/services/firebase/firestore.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  decodeVinLive,
  isValidVin,
  normalizeVin,
  passesVinChecksum,
  scanVinWithCamera,
} from "/js/modules/loaners/vin-scanner.js";

protectRoute({ allowedModules: ["loaner-fleet"] });

const $ = (id) => document.getElementById(id);

let currentDealerId = "";
let session = null;
let fleetRows = [];
let validatedVin = "";
let saveBusy = false;
let importByVin = {};
let manageSearch = "";

window.addEventListener("dexp-session-ready", () => {
  session = getSession();
  currentDealerId = session?.dealerId || "";
  renderAppHeader({ title: "Manage Fleet", showHome: true });
  wireAddForm();
  wireImport();
  $("manageFleetSearch")?.addEventListener("input", (event) => {
    manageSearch = String(event.target.value || "").trim().toUpperCase();
    renderTables();
  });
  watchFleet();
});

function isRetired(row = {}) {
  return String(row.status || "").trim().toUpperCase() === "RETIRED";
}

function isOut(row = {}) {
  return String(row.status || "").trim().toUpperCase() === "OUT";
}

function vehicleLabel(row = {}) {
  return [row.year, row.make, row.model].filter(Boolean).join(" ") || "";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function watchFleet() {
  if (!currentDealerId) return;
  const q = query(
    collection(db, "loanerFleet"),
    where("dealerId", "==", currentDealerId),
  );
  onSnapshot(q, (snap) => {
    fleetRows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderTables();
    if (Object.keys(importByVin).length) {
      renderCompare(Object.values(importByVin));
    }
  });
}

function renderTables() {
  const active = fleetRows.filter((row) => !isRetired(row));
  const retired = fleetRows.filter((row) => isRetired(row));
  renderActive(filterActiveRows(active));
  renderRetired(retired);
}

function filterActiveRows(rows) {
  if (!manageSearch) return rows;
  return rows.filter((row) => {
    const hay = [
      row.vin,
      row.last8,
      row.unitNumber,
      row.year,
      row.make,
      row.model,
      row.status,
    ]
      .map((value) => String(value || "").toUpperCase())
      .join(" ");
    return hay.includes(manageSearch);
  });
}

function renderActive(rows) {
  const body = $("activeFleetBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6">No active units.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((row) => {
      const vin = normalizeVin(row.vin || row.id);
      const flagged = row.retireOnReturn === true;
      return `
        <tr class="${flagged ? "loaner-row-retire" : ""}">
          <td>${escapeHtml(row.unitNumber || "")}</td>
          <td>${escapeHtml(row.last8 || vin.slice(-8))}</td>
          <td>${escapeHtml(vehicleLabel(row))}</td>
          <td>${escapeHtml(row.status || "")}${flagged ? " · retire on return" : ""}</td>
          <td>
            <label>
              <input type="checkbox" class="js-retire-flag" data-vin="${escapeHtml(vin)}" ${flagged ? "checked" : ""} />
              Retire on return
            </label>
          </td>
          <td>
            ${
              isOut(row)
                ? ""
                : `<button type="button" class="small-button secondary js-retire-now" data-vin="${escapeHtml(vin)}">Retire now</button>`
            }
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll(".js-retire-flag").forEach((box) => {
    box.addEventListener("change", async () => {
      await setRetireOnReturn(box.dataset.vin, box.checked);
    });
  });
  body.querySelectorAll(".js-retire-now").forEach((button) => {
    button.addEventListener("click", async () => {
      const vin = button.dataset.vin;
      if (!confirm(`Retire ${vin} now? It will leave the active fleet.`)) return;
      await retireNow(vin);
    });
  });
}

function renderRetired(rows) {
  const body = $("retiredFleetBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5">No retired units.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((row) => {
      const when = row.retiredAtText || "";
      return `
        <tr>
          <td>${escapeHtml(row.unitNumber || "")}</td>
          <td>${escapeHtml(row.last8 || String(row.vin || "").slice(-8))}</td>
          <td>${escapeHtml(vehicleLabel(row))}</td>
          <td>${escapeHtml(when)}</td>
          <td>${escapeHtml(row.lastMileage || "")}</td>
        </tr>
      `;
    })
    .join("");
}

async function setRetireOnReturn(vin, flagged) {
  const clean = normalizeVin(vin);
  if (!clean) return;
  await setDoc(
    doc(db, "loanerFleet", clean),
    {
      retireOnReturn: Boolean(flagged),
      retireOnReturnAtMs: flagged ? Date.now() : "",
      retireOnReturnByName: flagged ? session?.displayName || session?.email || "" : "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function retireNow(vin) {
  const clean = normalizeVin(vin);
  if (!clean) return;
  const row = fleetRows.find((item) => normalizeVin(item.vin || item.id) === clean);
  if (row && isOut(row)) {
    alert("This unit is still out. Toggle Retire on return instead.");
    return;
  }
  await setDoc(
    doc(db, "loanerFleet", clean),
    {
      status: "Retired",
      location: "Retired",
      retireOnReturn: false,
      assignedRo: "",
      retiredAtMs: Date.now(),
      retiredAtText: new Date().toLocaleString(),
      retiredByName: session?.displayName || session?.email || "",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function wireAddForm() {
  const video = $("scannerVideo");
  const status = $("scannerStatus");

  function updateSave() {
    const button = $("saveFleetBtn");
    const vin = normalizeVin($("vin")?.value);
    const mileage = Number($("mileage")?.value);
    const ok =
      vin &&
      vin === validatedVin &&
      Number.isFinite(mileage) &&
      mileage >= 1 &&
      !saveBusy;
    if (button) {
      button.disabled = !ok;
      button.textContent = saveBusy ? "Saving..." : "Save";
    }
  }

  async function fill(raw) {
    const vin = normalizeVin(raw);
    $("fleetMsg").textContent = "";
    validatedVin = "";
    if (!isValidVin(vin) || !passesVinChecksum(vin)) {
      $("fleetMsg").textContent = "Enter a valid 17-character VIN.";
      updateSave();
      return;
    }
    $("vin").value = vin;
    const existing = await getDoc(doc(db, "loanerFleet", vin));
    if (existing.exists() && existing.data()?.dealerId === currentDealerId) {
      $("fleetMsg").textContent = "This VIN is already in the fleet.";
      updateSave();
      return;
    }
    try {
      const decoded = await decodeVinLive(vin);
      if (decoded) {
        $("year").value = decoded.year || $("year").value;
        $("make").value = decoded.make || $("make").value;
        $("model").value = decoded.model || $("model").value;
      }
    } catch (error) {
      console.warn(error);
    }
    validatedVin = vin;
    $("fleetMsg").textContent = "VIN ready. Add mileage and save.";
    updateSave();
  }

  $("lookupVinBtn")?.addEventListener("click", () => fill($("vin")?.value));
  $("vin")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      fill($("vin").value);
    }
  });
  $("mileage")?.addEventListener("input", updateSave);
  $("vin")?.addEventListener("input", () => {
    if (normalizeVin($("vin").value) !== validatedVin) validatedVin = "";
    updateSave();
  });

  $("scanFleetBtn")?.addEventListener("click", async () => {
    try {
      status.textContent = "Scanning VIN...";
      video.style.display = "block";
      const res = await scanVinWithCamera(video, status);
      video.style.display = "none";
      if (res?.vin) await fill(res.vin);
      else status.textContent = res?.reason || "No VIN.";
    } catch (error) {
      video.style.display = "none";
      status.textContent = error.message || "Scan failed";
    }
  });

  $("saveFleetBtn")?.addEventListener("click", async () => {
    const vin = normalizeVin($("vin")?.value);
    const mileage = Number($("mileage")?.value);
    if (!vin || vin !== validatedVin) return;
    if (!Number.isFinite(mileage) || mileage < 1) return;
    saveBusy = true;
    updateSave();
    try {
      const ref = doc(db, "loanerFleet", vin);
      if ((await getDoc(ref)).exists()) {
        $("fleetMsg").textContent = "This VIN is already in the fleet.";
        return;
      }
      await setDoc(ref, {
        vin,
        dealerId: currentDealerId,
        last8: vin.slice(-8),
        unitNumber: $("unitNumber")?.value.trim() || "",
        plate: $("plate")?.value.trim() || "",
        year: $("year")?.value.trim() || "",
        make: $("make")?.value.trim() || "",
        model: $("model")?.value.trim() || "",
        status: "Available",
        location: "Front Line",
        assignedRo: "",
        retireOnReturn: false,
        lastMileage: String(mileage),
        lastFuelLevel: "",
        lastDamageNotes: "",
        notes: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      $("fleetMsg").textContent = "Saved to fleet.";
      validatedVin = "";
      ["vin", "year", "make", "model", "unitNumber", "plate", "mileage"].forEach((id) => {
        if ($(id)) $(id).value = "";
      });
    } catch (error) {
      console.error(error);
      $("fleetMsg").textContent = "Could not save.";
    } finally {
      saveBusy = false;
      updateSave();
    }
  });
}

function wireImport() {
  $("fleetImportBtn")?.addEventListener("click", async () => {
    const file = $("fleetImportFile")?.files?.[0];
    if (!file) {
      $("importMsg").textContent = "Choose the FleetExport CSV first.";
      return;
    }
    try {
      const rows = await readFleetExport(file);
      importByVin = {};
      rows.forEach((row) => {
        importByVin[row.vin] = row;
      });
      renderCompare(rows);
    } catch (error) {
      console.error(error);
      $("importMsg").textContent = error.message || "Could not read file.";
    }
  });
}

function cleanExcelCell(value = "") {
  let text = String(value ?? "").trim();
  text = text.replace(/^"+/, "").replace(/"+$/, "");
  if (text.startsWith("=")) {
    text = text.replace(/^=\"?/, "").replace(/\"?$/, "");
  }
  return text.trim();
}

function parseCsvRows(text = "") {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(current);
    current = "";
  };
  const pushRow = () => {
    if (row.some((cell) => String(cell).trim())) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      pushCell();
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      pushCell();
      pushRow();
    } else {
      current += char;
    }
  }
  pushCell();
  pushRow();
  return rows;
}

async function addImportedVin(vin) {
  const clean = normalizeVin(vin);
  if (!isValidVin(clean) || !passesVinChecksum(clean)) {
    throw new Error("Invalid VIN");
  }
  const ref = doc(db, "loanerFleet", clean);
  if ((await getDoc(ref)).exists()) return;

  const imported = importByVin[clean] || {};
  let mileage = Number(imported.mileage);
  if (!Number.isFinite(mileage) || mileage < 1) mileage = 1;

  let year = "";
  let make = "";
  let model = "";
  try {
    const decoded = await decodeVinLive(clean);
    year = decoded?.year || "";
    make = decoded?.make || "";
    model = decoded?.model || "";
  } catch (error) {
    console.warn("Decode failed", clean, error);
  }

  await setDoc(ref, {
    vin: clean,
    dealerId: currentDealerId,
    last8: clean.slice(-8),
    unitNumber: "",
    plate: "",
    year,
    make,
    model,
    status: "Available",
    location: "Front Line",
    assignedRo: "",
    retireOnReturn: false,
    lastMileage: String(mileage),
    lastFuelLevel: "",
    lastDamageNotes: "",
    notes: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function readFleetExport(file) {
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new Error("Save FleetExport as CSV and import that file.");
  }

  const table = parseCsvRows(await file.text());
  if (!table.length) throw new Error("File is empty.");

  const headers = table[0].map((cell) => cleanExcelCell(cell).toLowerCase());
  const vinIndex = headers.findIndex((header) => header === "vin");
  const mileageIndex = headers.findIndex((header) =>
    ["current odometer", "odometer", "mileage", "current mileage"].includes(header),
  );

  if (vinIndex < 0) {
    throw new Error("No VIN column found. Use the Porsche FleetExport CSV.");
  }

  const byVin = new Map();
  table.slice(1).forEach((cells) => {
    const vin = normalizeVin(cleanExcelCell(cells[vinIndex] || ""));
    if (!isValidVin(vin) || !passesVinChecksum(vin)) return;
    const mileageRaw =
      mileageIndex >= 0 ? cleanExcelCell(cells[mileageIndex] || "") : "";
    const mileage = Number(String(mileageRaw).replace(/[^0-9.]/g, ""));
    byVin.set(vin, {
      vin,
      mileage: Number.isFinite(mileage) && mileage >= 0 ? mileage : "",
    });
  });

  return [...byVin.values()];
}

function renderCompare(sheetRows) {
  const sheetVins = sheetRows.map((row) => row.vin);
  const active = fleetRows.filter((row) => !isRetired(row));
  const activeVins = new Set(active.map((row) => normalizeVin(row.vin || row.id)));
  const sheet = new Set(sheetVins);
  const toAdd = sheetRows.filter((row) => !activeVins.has(row.vin));
  const missing = active.filter((row) => !sheet.has(normalizeVin(row.vin || row.id)));
  $("importMsg").textContent = `Sheet ${sheetVins.length} VIN · ${toAdd.length} new · ${missing.length} in DEXP not on sheet.`;
  const preview = $("importPreview");
  preview.innerHTML = `
    <p><strong>New on sheet</strong> ${
      toAdd.length
        ? `<button type="button" class="small-button" id="importAddAllBtn">Add all ${toAdd.length}</button>`
        : ""
    }</p>
    <div>${
      toAdd.length
        ? toAdd
            .map(
              (row) =>
                `<div>${escapeHtml(row.vin)} · mi ${escapeHtml(row.mileage || "—")} <button type="button" class="small-button js-import-add" data-vin="${escapeHtml(row.vin)}">Add</button></div>`,
            )
            .join("")
        : "None"
    }</div>
    <p style="margin-top:12px"><strong>In DEXP, not on sheet</strong></p>
    <div>${
      missing.length
        ? missing
            .map((row) => {
              const vin = normalizeVin(row.vin || row.id);
              const out = isOut(row);
              return `<div>${escapeHtml(vin)} · ${escapeHtml(row.status || "")} ${
                out
                  ? `<button type="button" class="small-button js-import-flag" data-vin="${escapeHtml(vin)}">Retire on return</button>`
                  : `<button type="button" class="small-button js-import-retire" data-vin="${escapeHtml(vin)}">Retire now</button>`
              }</div>`;
            })
            .join("")
        : "None"
    }</div>
  `;
  preview.querySelectorAll(".js-import-add").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await addImportedVin(button.dataset.vin);
      } catch (error) {
        button.disabled = false;
        $("fleetMsg").textContent = error.message || "Could not add.";
      }
    });
  });
  $("importAddAllBtn")?.addEventListener("click", async () => {
    const button = $("importAddAllBtn");
    button.disabled = true;
    button.textContent = "Adding...";
    let added = 0;
    let failed = 0;
    for (const row of toAdd) {
      try {
        await addImportedVin(row.vin);
        added += 1;
      } catch (error) {
        console.warn(row.vin, error);
        failed += 1;
      }
    }
    $("importMsg").textContent = `Added ${added}. ${failed ? failed + " failed." : ""}`;
  });
  preview.querySelectorAll(".js-import-flag").forEach((button) => {
    button.addEventListener("click", () => setRetireOnReturn(button.dataset.vin, true));
  });
  preview.querySelectorAll(".js-import-retire").forEach((button) => {
    button.addEventListener("click", () => retireNow(button.dataset.vin));
  });
}
