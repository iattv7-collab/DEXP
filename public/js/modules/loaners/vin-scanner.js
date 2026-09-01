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
const BETWEEN_ATTEMPTS_MS = 1500;
const REQUEST_TIMEOUT_MS = 6000;

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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function normalizeVin(text = "") {
  return String(text)
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "")
    .trim();
}

function isValidVin(vin = "") {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(vin));
}

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

async function makeCropBlob(mediaEl, zone, quality = 0.86) {
  const sourceX = Math.max(0, Math.floor(zone.x));
  const sourceY = Math.max(0, Math.floor(zone.y));
  const sourceWidth = Math.max(1, Math.floor(zone.w));
  const sourceHeight = Math.max(1, Math.floor(zone.h));

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
    mediaEl,
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

async function scanZone(mediaEl, zone, parentSignal) {
  const blob = await makeCropBlob(mediaEl, zone, zone.quality ?? 0.86);

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

async function scanVinFromImage(imageEl, statusEl) {
  const videoWidth = imageEl.naturalWidth || imageEl.width;
  const videoHeight = imageEl.naturalHeight || imageEl.height;

  if (!videoWidth || !videoHeight) {
    throw new Error("Could not read VIN photo");
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
    if (statusEl) {
      statusEl.textContent = `Reading VIN... ${zone.name}`;
    }

    try {
      const vin = await scanZone(imageEl, zone);

      if (isValidVin(vin)) {
        const checksumValid = passesVinChecksum(vin);

        return {
          vin,
          reason: checksumValid ? "VIN detected and validated" : "VIN detected",
        };
      }
    } catch (error) {
      console.warn(`VIN scan failed for ${zone.name}`, error);
    }
  }

  return {
    vin: "",
    reason: "No VIN found in photo",
  };
}

async function scanVinWithNativeCamera(statusEl) {
  const Camera = window.Capacitor?.Plugins?.Camera;

  if (!Camera) {
    throw new Error("Native camera plugin is not available.");
  }

  if (statusEl) {
    statusEl.textContent = "Opening camera...";
  }

  const photo = await Camera.getPhoto({
    quality: 80,
    resultType: "dataUrl",
    source: "CAMERA",
    direction: "REAR",
    saveToGallery: false,
  });

  const image = await loadImageFromDataUrl(photo.dataUrl);
  return scanVinFromImage(image, statusEl);
}

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