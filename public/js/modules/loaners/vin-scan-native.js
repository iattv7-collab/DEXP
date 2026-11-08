// public/js/modules/loaners/vin-scan-native.js
// Native camera. DEXP blue cross. No status text.
import { renderAppHeader } from "/js/shared/app-header.js";
import {
  normalizeVin,
  isValidVin,
  passesVinChecksum,
} from "/js/modules/loaners/vin-scanner.js";

const RESULT_KEY = "dexp_scan_vin";
const FAIL_MS = 12000;
const CONFIRM_READS = 2;

function extractValidVin(raw) {
  const cleaned = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/Q/g, "0");

  for (let i = 0; i <= cleaned.length - 17; i += 1) {
    const candidate = cleaned.slice(i, i + 17);
    if (isValidVin(candidate) && passesVinChecksum(candidate)) {
      return candidate;
    }
  }
  return "";
}

function textsFromEvent(event) {
  const chunks = [];
  const push = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    const text = typeof value === "string" ? value : String(value);
    if (text.trim()) chunks.push(text);
  };
  push(event?.text);
  const blocks = event?.blocks || [];
  for (const block of blocks) {
    push(block?.text);
    for (const line of block?.lines || []) {
      push(line?.text);
    }
  }
  return chunks;
}

function vinFromText(raw) {
  const vin = extractValidVin(raw);
  return vin && isValidVin(vin) && passesVinChecksum(vin) ? vin : "";
}

function vinFromEvent(event) {
  const chunks = textsFromEvent(event);
  const found = new Map();
  for (const chunk of chunks) {
    const vin = vinFromText(chunk);
    if (!vin) continue;
    found.set(vin, (found.get(vin) || 0) + 1);
  }
  if (!found.size) return "";
  let best = "";
  let bestCount = 0;
  let ties = 0;
  for (const [vin, count] of found) {
    if (count > bestCount) {
      best = vin;
      bestCount = count;
      ties = 1;
    } else if (count === bestCount) {
      ties += 1;
    }
  }
  return ties === 1 ? best : "";
}

function vinFromBarcode(barcode) {
  return vinFromText(
    barcode?.displayValue || barcode?.rawValue || barcode?.value || ""
  );
}

function showFail() {
  document.body.classList.remove("scanner-on");
  document.body.classList.add("failed");
}

function goResult(vin) {
  const accepted = normalizeVin(vin);
  if (!isValidVin(accepted) || !passesVinChecksum(accepted)) return;
  sessionStorage.setItem(RESULT_KEY, accepted);
  const back =
    sessionStorage.getItem("dexp_scan_return") ||
    "/pages/loaner-returns/loaner-returns.html";
  sessionStorage.removeItem("dexp_scan_return");
  location.href = back;
}

async function startNativeScan() {
  const plugins = window.Capacitor?.Plugins || {};
  const BarcodeScanner = plugins.BarcodeScanner || plugins.CapacitorMlkitBarcodeTextScanner;
  if (!BarcodeScanner?.startScan) {
    showFail();
    return;
  }
  document.body.classList.remove("failed");
  document.body.classList.add("scanner-on");
  let done = false;
  const votes = new Map();
  const timer = window.setTimeout(() => {
    if (done) return;
    done = true;
    BarcodeScanner.stopScan?.().catch(() => {});
    BarcodeScanner.removeAllListeners?.().catch(() => {});
    showFail();
  }, FAIL_MS);

  async function acceptVin(vin) {
    if (done) return;
    if (!isValidVin(vin) || !passesVinChecksum(vin)) return;
    done = true;
    window.clearTimeout(timer);
    await BarcodeScanner.stopScan?.().catch(() => {});
    await BarcodeScanner.removeAllListeners?.().catch(() => {});
    goResult(vin);
  }

  function voteVin(vin) {
    if (!vin || done) return;
    if (!isValidVin(vin) || !passesVinChecksum(vin)) return;
    const count = (votes.get(vin) || 0) + 1;
    votes.set(vin, count);
    if (count >= CONFIRM_READS) acceptVin(vin);
  }

  try {
    await BarcodeScanner.removeAllListeners?.().catch(() => {});
    await BarcodeScanner.addListener("textScanned", async (event) => {
      if (done) return;
      voteVin(vinFromEvent(event));
    });
    await BarcodeScanner.addListener("barcodesScanned", async (event) => {
      if (done) return;
      const barcodes = event?.barcodes || [];
      for (const barcode of barcodes) {
        const vin = vinFromBarcode(barcode);
        if (vin) {
          await acceptVin(vin);
          return;
        }
      }
    });
    await BarcodeScanner.startScan({
      textRecognition: true,
      textRecognitionInterval: 200,
    });
  } catch {
    done = true;
    window.clearTimeout(timer);
    showFail();
  }
}

renderAppHeader({
  title: "Scan VIN",
  showHome: true,
});

document.getElementById("rescanBtn")?.addEventListener("click", () => {
  startNativeScan();
});

startNativeScan();