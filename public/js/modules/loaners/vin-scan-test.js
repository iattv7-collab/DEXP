// public/js/modules/loaners/vin-scan-test.js
// Test only. Still photos. Prefix anchors the VIN.

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
  "WBS","WDB","WDC","WDD","WP0","WP1","WVW","WV1","YV1","YV4","ZFF","ZF8"
];

function ensureOverlay() {
  let overlay = document.getElementById("scanOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "scanOverlay";
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "40px";
    overlay.style.zIndex = "10000";
    overlay.style.color = "#fff";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.padding = "12px";
    overlay.style.fontSize = "18px";
    overlay.style.textAlign = "center";
    overlay.style.display = "none";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function setStatus(text) {
  const line = text || "";
  $("status").textContent = line;
  const overlay = document.getElementById("scanOverlay");
  if (overlay) overlay.textContent = line;
}

function setResult(vin, how) {
  $("result").textContent = vin || "";
  $("how").textContent = how || "";
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

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
}

function vinFromPrefix(raw) {
  const upper = String(raw || "").toUpperCase();
  const cleaned = upper
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/Q/g, "0");

  for (const prefix of PREFIXES) {
    const at = cleaned.indexOf(prefix);
    if (at === -1) continue;

    const rest = cleaned.slice(at + 3).replace(/[IOQ]/g, "");
    if (rest.length < 14) continue;

    const vin = normalizeVin(prefix + rest.slice(0, 14));
    if (isValidVin(vin)) return vin;
  }

  return "";
}

async function readBlob(blob) {
  const plugins = window.Capacitor?.Plugins || {};
  const TextRecognition = plugins.TextRecognition;
  const Filesystem = plugins.Filesystem;
  if (!TextRecognition?.processImage || !Filesystem?.writeFile) {
    return { vin: "", note: "Reader not available" };
  }

  const base64 = await blobToBase64(blob);
  const path = `vin-still-${Date.now()}.jpg`;

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
    const vin = vinFromPrefix(raw);
    return { vin, note: raw.slice(0, 80) || "nothing" };
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
      focusMode: { ideal: "continuous" },
    },
    audio: false,
  });

  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  if (caps.focusMode?.includes("continuous")) {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
  }

  videoEl.style.display = "block";
  videoEl.style.position = "fixed";
  videoEl.style.inset = "0";
  videoEl.style.width = "100vw";
  videoEl.style.height = "100vh";
  videoEl.style.objectFit = "cover";
  videoEl.style.zIndex = "9999";
  videoEl.srcObject = stream;
  await videoEl.play();

  const overlay = ensureOverlay();
  overlay.style.display = "block";

  return () => {
    stream.getTracks().forEach((item) => item.stop());
    videoEl.srcObject = null;
    videoEl.removeAttribute("style");
    videoEl.style.display = "none";
    overlay.style.display = "none";
  };
}

$("scanBtn").addEventListener("click", async () => {
  const video = $("scannerVideo");
  setResult("", "");
  setStatus("Opening camera...");

  let stop = () => {};

  try {
    stop = await openCamera(video);
    setStatus("Focusing...");
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const notes = [];

    for (let shot = 1; shot <= 3; shot += 1) {
      setStatus("Photo " + shot + " of 3");
      await new Promise((resolve) => setTimeout(resolve, 700));

      const blob = await grabFrame(video);
      if (!blob) {
        notes.push(shot + ": no frame");
        continue;
      }

      const read = await readBlob(blob);
      notes.push(shot + ": " + (read.vin || read.note));

      if (read.vin) {
        stop();
        setResult(read.vin, "Found on device, photo " + shot);
        setStatus("Done");
        return;
      }
    }

    stop();
    setResult("", "No VIN");
    setStatus(notes.join(" | "));
  } catch (error) {
    stop();
    setStatus(error?.message || "Scan failed");
  }
});