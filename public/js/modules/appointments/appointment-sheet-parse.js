// public/js/modules/appointments/appointment-sheet-parse.js

import { TRANSPORT_TYPE } from "/js/services/firestore/appointments-service.js";

const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi;
const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const TRANSPORT_RE = /\b(LOANER|WAITER|VALET)\b/gi;

export function parseAppointmentSheetText(rawText = "") {
  const text = String(rawText || "").replace(/\r/g, "");
  const dateMatch = text.match(DATE_RE);
  const appointmentDate = dateMatch ? normalizeSheetDate(dateMatch[1]) : "";

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let rows = parseLineRows(lines, appointmentDate);
  const columnRows = parseColumnRows(text, appointmentDate);
  if (columnRows.length > rows.length) {
    rows = mergeRowSets(columnRows, rows);
  }

  rows = rows.map((row) => polishRow(row)).filter((row) => row.appointmentTime || row.vin || row.customerName);
  return { appointmentDate, rows, rawText: text };
}

function parseLineRows(lines, appointmentDate) {
  const rows = [];
  for (const line of lines) {
    if (isHeaderLine(line)) continue;
    const timeMatch = line.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
    const vin = recoverVin(line);
    if (!timeMatch && !vin) continue;
    rows.push(buildRow(line, appointmentDate, {
      time: timeMatch ? cleanTime(timeMatch[1]) : "",
      vin,
    }));
  }
  return rows;
}

function parseColumnRows(text, appointmentDate) {
  const times = [...text.matchAll(TIME_RE)].map((m) => cleanTime(m[1]));
  const vins = collectVins(text);
  const phones = collectPhones(text);
  const transports = [...text.matchAll(TRANSPORT_RE)].map((m) => normalizeTransport(m[1]));
  const count = Math.max(times.length, vins.length);
  if (count < 3) return [];

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const transportationType = transports[i] || TRANSPORT_TYPE.NONE;
    rows.push({
      appointmentDate,
      appointmentTime: times[i] || "",
      customerName: "",
      phone: phones[i] || "",
      vin: vins[i] || "",
      license: "",
      vehicle: "",
      advisorCode: "",
      concern: "",
      transportationType,
      loanerRequired: transportationType === TRANSPORT_TYPE.LOANER,
      rawLine: [times[i], vins[i], phones[i]].filter(Boolean).join(" "),
      source: "sheet-ocr-columns",
    });
  }
  return rows;
}

function isHeaderLine(line) {
  if (/^date\b/i.test(line) || /^advisor\b/i.test(line)) return true;
  if (/^time\b/i.test(line)) return true;
  if (/appointments/i.test(line) && /customer/i.test(line)) return true;
  return false;
}

function buildRow(line, appointmentDate, bits) {
  const phone = firstPhone(line);
  const transportMatch = line.match(/\b(LOANER|WAITER|VALET)\b/i);
  const transportationType = normalizeTransport(transportMatch?.[1]);

  let working = line;
  if (bits.time) working = working.replace(new RegExp(bits.time.replace(/\s+/g, "\\s*"), "i"), " ");
  if (bits.vin) working = stripVinToken(working, bits.vin);
  if (phone) working = working.replace(phone, " ");
  if (transportMatch) working = working.replace(transportMatch[0], " ");
  working = working.replace(/\b[SD]\b/g, " ").replace(/\s+/g, " ").trim();

  const advisorMatch = working.match(/\b(\d{3,5})\b/);
  const advisorCode = advisorMatch ? advisorMatch[1] : "";
  if (advisorCode) working = working.replace(advisorCode, " ").replace(/\s+/g, " ").trim();

  const concern = extractConcern(working);
  const nameAndVehicle = concern
    ? working.slice(0, working.toLowerCase().lastIndexOf(concern.toLowerCase())).trim()
    : working;
  const { customerName, vehicle, license } = splitNameVehicle(nameAndVehicle);

  return {
    appointmentDate,
    appointmentTime: bits.time || "",
    customerName: cleanName(customerName),
    phone,
    vin: bits.vin || "",
    license,
    vehicle: stripVinNoise(vehicle),
    advisorCode,
    concern,
    transportationType,
    loanerRequired: transportationType === TRANSPORT_TYPE.LOANER,
    rawLine: line,
    source: "sheet-ocr",
  };
}


function normalizeVehicle(value) {
  const text = String(value || "");
  const match = text.match(/\d{2}\s+(?:PO|PORSCHE)\s+(?:911|MACAN|CAYENNE|PANAMERA|TAYCAN|718)[A-Z0-9\s]*?(?=\s+WP|\s+\(|$)/i);
  if (match) return match[0].replace(/\s+/g, " ").trim();
  return stripVinNoise(text).replace(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeName(value) {
  const text = String(value || "").trim();
  if (text.length < 3) return false;
  if (/\d/.test(text)) return false;
  if (/=/.test(text)) return false;
  if (/DRIVEABILITY|CAMPAIGN|QUICK SERVICE|LOANER|WAITER|VALET|TELEPHONE/i.test(text)) return false;
  return /[A-Z]{2,}/i.test(text);
}

function polishRow(row) {
  const blob = `${row.vin || ""} ${row.vehicle || ""} ${row.customerName || ""} ${row.phone || ""} ${row.rawLine || ""}`;
  const vin = (row.vin && row.vin.length === 17 ? row.vin : recoverVin(blob)) || recoverVin(row.vehicle);
  let phone = row.phone || firstPhone(`${row.vehicle} ${row.rawLine || ""}`);
  if (phone && vin && vin.includes(phone.replace(/\D/g, "").slice(0, 8))) {
    phone = "";
  }
  let vehicle = normalizeVehicle(row.vehicle);
  let customerName = cleanName(stripVinNoise(row.customerName));
  if (!looksLikeName(customerName)) customerName = "";
  return {
    ...row,
    vin,
    phone,
    customerName,
    vehicle,
    loanerRequired: row.transportationType === TRANSPORT_TYPE.LOANER,
  };
}

function mergeRowSets(primary, extra) {
  const map = new Map();
  for (const row of [...primary, ...extra]) {
    const key = row.vin || `${row.appointmentTime}-${row.customerName}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row });
      continue;
    }
    map.set(key, {
      ...current,
      customerName: longer(current.customerName, row.customerName),
      vehicle: preferVehicle(current.vehicle, row.vehicle),
      phone: current.phone || row.phone,
      vin: current.vin.length === 17 ? current.vin : row.vin,
      advisorCode: current.advisorCode || row.advisorCode,
      concern: current.concern || row.concern,
      appointmentTime: current.appointmentTime || row.appointmentTime,
      transportationType:
        current.transportationType !== TRANSPORT_TYPE.NONE
          ? current.transportationType
          : row.transportationType,
      loanerRequired:
        current.transportationType === TRANSPORT_TYPE.LOANER ||
        row.transportationType === TRANSPORT_TYPE.LOANER,
    });
  }
  return [...map.values()];
}

function longer(a, b) {
  return String(a || "").length >= String(b || "").length ? a : b;
}

function preferVehicle(a, b) {
  const av = stripVinNoise(a);
  const bv = stripVinNoise(b);
  if (/\d{2}\s+(PO|PORSCHE)/i.test(av) && !/\d{2}\s+(PO|PORSCHE)/i.test(bv)) return av;
  if (/\d{2}\s+(PO|PORSCHE)/i.test(bv) && !/\d{2}\s+(PO|PORSCHE)/i.test(av)) return bv;
  return av.length >= bv.length ? av : bv;
}

function collectVins(text) {
  const found = [];
  const seen = new Set();
  for (const vin of recoverAllVins(text)) {
    if (!seen.has(vin)) {
      seen.add(vin);
      found.push(vin);
    }
  }
  return found;
}

function collectPhones(text) {
  return (String(text).match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || []).filter((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length === 10 && !digits.startsWith("20");
  });
}

function firstPhone(text) {
  return collectPhones(text)[0] || "";
}

function recoverVin(text) {
  return recoverAllVins(text)[0] || "";
}

function recoverAllVins(text) {
  const compact = String(text || "")
    .toUpperCase()
    .replace(/VIPO/g, "WP0")
    .replace(/VIP1/g, "WP1")
    .replace(/WPO/g, "WP0")
    .replace(/WPI/g, "WP1")
    .replace(/WPL/g, "WP1")
    .replace(/[^A-Z0-9]/g, "");
  const hits = [];
  const start = /WP[01]/g;
  let match = start.exec(compact);
  while (match) {
    const chunk = compact.slice(match.index, match.index + 17);
    if (chunk.length === 17 && !/[IOQ]/.test(chunk.slice(3))) {
      hits.push(chunk);
    } else if (chunk.length === 17) {
      hits.push(chunk.replace(/O/g, "0").replace(/I/g, "1"));
    }
    match = start.exec(compact);
  }
  return hits;
}

function stripVinToken(text, vin) {
  if (!vin) return text;
  return String(text).replace(new RegExp(vin.split("").join("\\s*"), "i"), " ");
}

function stripVinNoise(value) {
  return String(value || "")
    .replace(/\b(VIP?O?|WP[O0I1L])[A-Z0-9\s]{8,}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  return String(value || "")
    .replace(/\b(LOANER|WAITER|VALET)\b/gi, " ")
    .replace(/^[^A-Z]+/i, "")
    .replace(/^(FA|S|D)\s+/i, "")
    .replace(/\b(PO|PORSCHE|CAYENNE|MACAN|PANAMERA|TAYCAN|911|SPYDER)\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractConcern(text) {
  const patterns = [
    /CAMPAIGN.*$/i,
    /DRIVEABILITY.*$/i,
    /PRE PAID.*$/i,
    /OIL\s*(&|AND)\s*FILTER.*$/i,
    /CHECK ENGINE.*$/i,
    /QUICK SERVICE.*$/i,
    /TOWING.*$/i,
    /\d+\s*YEAR\s*SVC.*$/i,
    /M\s*(&|AND)\s*B.*$/i,
    /BATTERY.*$/i,
    /EXTERIOR.*$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return "";
}

function splitNameVehicle(text) {
  let working = String(text || "");
  const vehicleMatch = working.match(/(\d{2}\s+(?:PO|PORSCHE)\s+.+)$/i);
  if (vehicleMatch) {
    return {
      customerName: cleanName(working.replace(vehicleMatch[1], "")),
      vehicle: stripVinNoise(vehicleMatch[1]),
      license: "",
    };
  }
  return { customerName: cleanName(working), vehicle: "", license: "" };
}

function normalizeSheetDate(value) {
  const [month, day, year] = String(value).split("/");
  const yy = String(year).length === 4 ? String(year).slice(-2) : String(year).padStart(2, "0");
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${yy}`;
}

function cleanTime(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
}

function normalizeTransport(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "loaner") return TRANSPORT_TYPE.LOANER;
  if (key === "waiter") return TRANSPORT_TYPE.WAITER;
  if (key === "valet") return TRANSPORT_TYPE.VALET;
  return TRANSPORT_TYPE.NONE;
}

export async function recognizeAppointmentImage(file) {
  if (!file) throw new Error("No image selected.");
  await loadTesseract();
  const prepared = await prepareImage(file);
  const result = await window.Tesseract.recognize(prepared, "eng", { logger: () => {} });
  return result?.data?.text || "";
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = image.width < 1600 ? 2.2 : 1.4;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        const bw = gray > 168 ? 255 : gray < 88 ? 0 : gray;
        data[i] = data[i + 1] = data[i + 2] = bw;
      }
      ctx.putImageData(pixels, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not prepare photo."));
          return;
        }
        resolve(blob);
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open photo."));
    };
    image.src = url;
  });
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load OCR library."));
    document.head.appendChild(script);
  });
}


export async function enrichVehiclesFromVin(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  await Promise.all(list.map(async (row) => {
    const vin = String(row.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (vin.length !== 17) return;
    const decoded = await decodeVinAnyDealer(vin);
    if (decoded) row.vehicle = decoded;
  }));
  return list;
}

async function decodeVinAnyDealer(vin) {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const response = await fetch(url);
    if (!response.ok) return "";
    const payload = await response.json();
    const result = payload?.Results?.[0] || {};
    const year = String(result.ModelYear || "").trim();
    const make = String(result.Make || "").trim();
    const model = String(result.Model || "").trim();
    if (!make && !model) return "";
    return [year.slice(-2), make, model].filter(Boolean).join(" ");
  } catch (error) {
    return "";
  }
}
