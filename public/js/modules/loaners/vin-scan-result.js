// public/js/modules/loaners/vin-scan-result.js
// Shows the VIN from the native scan.
import { renderAppHeader } from "/js/shared/app-header.js";
import {
  normalizeVin,
  isValidVin,
  passesVinChecksum,
} from "/js/modules/loaners/vin-scanner.js";

const RESULT_KEY = "dexp_scan_vin";

renderAppHeader({
  title: "VIN",
  showHome: true,
});

const vin = normalizeVin(sessionStorage.getItem(RESULT_KEY) || "");
const valid = isValidVin(vin);
const checksumPassed = valid && passesVinChecksum(vin);

const vinOut = document.getElementById("vinOut");
const checksumEl = document.getElementById("checksumBadge");

if (vinOut) {
  vinOut.textContent = vin || "No VIN found";
}

if (checksumEl) {
  if (!vin) {
    checksumEl.textContent = "No VIN to check";
    checksumEl.className = "checksum-badge checksum-missing";
  } else if (checksumPassed) {
    checksumEl.textContent = "Checksum passed";
    checksumEl.className = "checksum-badge checksum-ok";
  } else {
    checksumEl.textContent = "Checksum failed";
    checksumEl.className = "checksum-badge checksum-bad";
  }
}

document.getElementById("scanAgainBtn")?.addEventListener("click", () => {
  sessionStorage.removeItem(RESULT_KEY);
  location.href = "/pages/vin-scan-test/index.html";
});

document.getElementById("useVinBtn")?.addEventListener("click", () => {
  const back =
    sessionStorage.getItem("dexp_scan_return") ||
    "/pages/loaner-returns/loaner-returns.html";
  sessionStorage.removeItem("dexp_scan_return");
  location.href = back;
});