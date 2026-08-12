// ======================================================
// FILE: /public/js/modules/loaners/vin-scanner.js
// MODULE: Loaners
// PURPOSE:
// Capture VIN from camera → send focused camera crops to backend OCR,
// validate VIN, decode VIN using NHTSA,
// and return vehicle information to Loaners.
// ======================================================

const SCAN_ENDPOINT = "https://scanvin-kaxooupkzq-uc.a.run.app";

const SCAN_TIMEOUT_MS = 15000;
const CAMERA_SETTLE_MS = 600;
const BETWEEN_ATTEMPTS_MS = 1500; // slower between rounds
const REQUEST_TIMEOUT_MS = 6000;

// Characters I, O and Q are not permitted in VINs.
function normalizeVin(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "")
    .trim();
}

function isValidVin(vin = "") {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin));
}

// =========================
// VIN CHECK DIGIT
// =========================

const VIN_TRANSLITERATION = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function passesVinChecksum(vin = "") {
  vin = normalizeVin(vin);

  if (!isValidVin(vin)) return false;

  let total = 0;

  for (let index = 0; index < vin.length; index += 1) {
    const char = vin[index];

    const value = /^\d$/.test(char) ? Number(char) : VIN_TRANSLITERATION[char];

    if (value === undefined) return false;

    total += value * VIN_WEIGHTS[index];
  }

  const remainder = total % 11;
  const expectedCheckDigit = remainder === 10 ? "X" : String(remainder);

  return vin[8] === expectedCheckDigit;
}

// =========================
// VIN DECODER (NHTSA)
// =========================

export async function decodeVinLive(vin = "") {
  vin = normalizeVin(vin);

  if (!isValidVin(vin)) return null;

  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`,
  );

  if (!res.ok) {
    throw new Error(`VIN decoder failed with status ${res.status}`);
  }

  const data = await res.json();
  const row = data?.Results?.[0];

  if (!row) return null;

  return {
    vin,
    make: row.Make || "",
    model: row.Model || "",
    year: row.ModelYear || "",
  };
}

// =========================
// CAMERA IMAGE CREATION
// =========================

async function makeCropBlob(videoEl, zone, quality = 0.86) {
  const sourceX = Math.max(0, Math.floor(zone.x));
  const sourceY = Math.max(0, Math.floor(zone.y));
  const sourceWidth = Math.max(1, Math.floor(zone.w));
  const sourceHeight = Math.max(1, Math.floor(zone.h));

  /*
   * Limit the uploaded image width.
   * Sending the camera's full 1920-pixel crop is slower and usually
   * does not provide a meaningful OCR benefit for a VIN.
   */
  const maximumOutputWidth = 1100;
  const scale = Math.min(1, maximumOutputWidth / sourceWidth);

  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));

  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", {
    alpha: false,
  });

  if (!ctx) {
    throw new Error("Unable to create scanner canvas");
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  ctx.drawImage(
    videoEl,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

// =========================
// BACKEND OCR REQUEST
// =========================

async function sendBlob(blob, zoneName, signal) {
  const fd = new FormData();
  fd.append("file", blob, `${zoneName}.jpg`);

  const res = await fetch(SCAN_ENDPOINT, {
    method: "POST",
    body: fd,
    signal,
  });

  if (!res.ok) {
    throw new Error(`VIN scanner returned status ${res.status}`);
  }

  const json = await res.json().catch(() => null);

  return normalizeVin(json?.vin || "");
}

async function scanZone(videoEl, zone, parentSignal) {
  const blob = await makeCropBlob(videoEl, zone, zone.quality ?? 0.86);

  if (!blob) return "";

  const requestController = new AbortController();

  const abortFromParent = () => {
    requestController.abort();
  };

  parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const requestTimer = setTimeout(() => {
    requestController.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await sendBlob(blob, zone.name, requestController.signal);
  } finally {
    clearTimeout(requestTimer);

    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

// =========================
// CAMERA → BACKEND OCR SCAN
// =========================

export async function scanVinWithCamera(videoEl, statusEl) {
  if (!videoEl) {
    throw new Error("scannerVideo not found");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is not supported on this device");
  }

  if (statusEl) {
    statusEl.textContent = "Opening camera...";
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: {
        ideal: "environment",
      },
      width: {
        ideal: 1920,
      },
      height: {
        ideal: 1080,
      },
    },
    audio: false,
  });

  const scanController = new AbortController();

  let cameraStopped = false;
  let timeoutId = null;

  const stopCamera = () => {
    if (cameraStopped) return;

    cameraStopped = true;
    scanController.abort();

    try {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (error) {
      console.warn("Unable to stop VIN scanner camera", error);
    }

    videoEl.srcObject = null;
  };

  try {
    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("autoplay", "true");
    videoEl.muted = true;
    videoEl.srcObject = stream;

    await new Promise((resolve) => {
      if (videoEl.readyState >= 1) {
        resolve();
        return;
      }

      videoEl.onloadedmetadata = () => {
        resolve();
      };
    });

    await videoEl.play();

    /*
     * Apply continuous focus when the browser and camera support it.
     * Unsupported constraints are safely ignored.
     */
    const videoTrack = stream.getVideoTracks()[0];

    if (videoTrack?.getCapabilities) {
      const capabilities = videoTrack.getCapabilities();
      const advanced = {};

      if (
        Array.isArray(capabilities.focusMode) &&
        capabilities.focusMode.includes("continuous")
      ) {
        advanced.focusMode = "continuous";
      }

      if (
        Array.isArray(capabilities.exposureMode) &&
        capabilities.exposureMode.includes("continuous")
      ) {
        advanced.exposureMode = "continuous";
      }

      if (
        Array.isArray(capabilities.whiteBalanceMode) &&
        capabilities.whiteBalanceMode.includes("continuous")
      ) {
        advanced.whiteBalanceMode = "continuous";
      }

      if (Object.keys(advanced).length > 0) {
        await videoTrack
          .applyConstraints({
            advanced: [advanced],
          })
          .catch(() => {});
      }
    }

    const startedAt = Date.now();

    timeoutId = setTimeout(() => {
      stopCamera();
    }, SCAN_TIMEOUT_MS);

    await new Promise((resolve) => {
      setTimeout(resolve, CAMERA_SETTLE_MS);
    });

    /*
     * Only three useful crops are sent.
     *
     * The narrow middle crop is first because a VIN is normally
     * presented horizontally near the center of the camera.
     *
     * The larger center crop handles paper and off-center scans.
     *
     * The full image is the final fallback rather than the first request.
     */
    while (!cameraStopped) {
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;

      if (!videoWidth || !videoHeight) {
        await new Promise((resolve) => {
          setTimeout(resolve, 150);
        });

        continue;
      }

      const zones = [
        {
          name: "vin-strip",
          x: videoWidth * 0.05,
          y: videoHeight * 0.36,
          w: videoWidth * 0.9,
          h: videoHeight * 0.28,
          quality: 0.92,
        },
        {
          name: "center",
          x: videoWidth * 0.1,
          y: videoHeight * 0.2,
          w: videoWidth * 0.8,
          h: videoHeight * 0.6,
          quality: 0.85,
        },
      ];

      for (const zone of zones) {
        if (cameraStopped) break;

        const elapsed = Date.now() - startedAt;
        const remainingSeconds = Math.max(
          1,
          Math.ceil((SCAN_TIMEOUT_MS - elapsed) / 1000),
        );

        if (statusEl) {
          statusEl.textContent = `Reading VIN... ${remainingSeconds}s`;
        }

        let vin = "";

        try {
          vin = await scanZone(videoEl, zone, scanController.signal);
        } catch (error) {
          if (error?.name === "AbortError") {
            if (cameraStopped) break;
          } else {
            console.warn(`VIN scan failed for ${zone.name}`, error);
          }

          continue;
        }

        if (!isValidVin(vin)) continue;

        /*
         * A checksum match is preferred, but a correctly formatted VIN
         * is still returned because some non-North-American or unusual
         * VIN records may not follow the expected check-digit behavior.
         */
        const checksumValid = passesVinChecksum(vin);

        clearTimeout(timeoutId);
        timeoutId = null;

        stopCamera();

        return {
          vin,
          reason: checksumValid ? "VIN detected and validated" : "VIN detected",
        };
      }

      await new Promise((resolve) => {
        setTimeout(resolve, BETWEEN_ATTEMPTS_MS);
      });
    }

    return {
      vin: "",
      reason: `No VIN found after ${SCAN_TIMEOUT_MS / 1000} seconds`,
    };
  } catch (error) {
    if (error?.name === "AbortError" && cameraStopped) {
      return {
        vin: "",
        reason: `No VIN found after ${SCAN_TIMEOUT_MS / 1000} seconds`,
      };
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    stopCamera();
  }
}

export { normalizeVin, isValidVin, passesVinChecksum };
