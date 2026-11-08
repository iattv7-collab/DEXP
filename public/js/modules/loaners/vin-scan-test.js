// public/js/modules/loaners/vin-scan-test.js
// Live camera. Red cross flashes. Stops the instant a VIN is read.

import {
  normalizeVin,
  isValidVin,
  passesVinChecksum,
} from "/js/modules/loaners/vin-scanner.js";

const $ = (id) => document.getElementById(id);

const PREFIXES = [
  "1FA","1FB","1FC","1FD","1FM","1FT","1FU","1FV","1G1","1G4","1G6","1GC","1GT","1GY",
  "1HG","1J4","1J8","1N4","1N6","1VW","19U","2HG","2HK","2T1","3FA","3VW","4T1","5FN",
  "5NP","5TD","5YJ","5UX","JA3","JA4","JF1","JF2","JH4","JHM","JM1","JN1","JN8","JS2",
  "JT2","JTD","JTE","JTH","KL4","KMH","KNA","KND","SAL","SAJ","TRU","WA1","WAU","WBA",
  "WBS","WDB","WDC","WDD","WP0","WP1","WVW","WV1","YV1","YV4","ZFF","ZF8","WP0"
];

function setStatus(text) {
  $("status").textContent = text || "";
}

function setVin(vin) {
  $("vinOut").textContent = vin || "VIN Number";
}

function vinFromText(raw) {
  const cleaned = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/Q/g, "0");

  for (let i = 0; i <= cleaned.length - 17; i += 1) {
    const vin = normalizeVin(cleaned.slice(i, i + 17));
    if (isValidVin(vin) && passesVinChecksum(vin)) return vin;
  }

  return "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || "");
      resolve(dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function grabFrame(videoEl) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  canvas.width = vw;
  canvas.height = vh;
  ctx.drawImage(videoEl, 0, 0, vw, vh);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

async function readPlate(blob) {
  const plugins = window.Capacitor?.Plugins || {};
  const TextRecognition = plugins.TextRecognition;
  const Filesystem = plugins.Filesystem;
  if (!TextRecognition?.processImage || !Filesystem?.writeFile) {
    return { vin: "", note: "Open this in the DEXP app" };
  }

  const base64 = await blobToBase64(blob);
  const path = `vin-live-${Date.now()}.jpg`;

  try {
    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: "CACHE",
    });
    const result = await TextRecognition.processImage({
      path: written.uri || path,
      script: "LATIN",
    });
    const raw = result?.text || "";
    return { vin: vinFromText(raw), note: raw.slice(0, 60) || "nothing" };
  } catch (error) {
    return { vin: "", note: error?.message || "read failed" };
  } finally {
    await Filesystem.deleteFile({ path, directory: "CACHE" }).catch(() => {});
  }
}

async function openCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return () => {
    stream.getTracks().forEach((item) => item.stop());
    videoEl.srcObject = null;
  };
}

let stopCamera = () => {};
let running = false;

async function startScan() {
  if (running) return;
  running = true;
  setVin("");
  setStatus("Looking...");
  $("cross").classList.remove("locked");

  try {
    stopCamera = await openCamera($("scannerVideo"));
    const video = $("scannerVideo");
    const started = Date.now();



    running = false;
    stopCamera();
    setStatus("No VIN");
  } catch (error) {
    running = false;
    stopCamera();
    setStatus(error?.message || "Camera failed");
  }
}

$("clearBtn")?.addEventListener("click", () => {
  running = false;
  stopCamera();
  setVin("");
  setStatus("Point at the VIN");
  $("cross").classList.remove("locked");
  startScan();
});

startScan();