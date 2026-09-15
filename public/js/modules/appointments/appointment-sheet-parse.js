// public/js/modules/appointments/appointment-sheet-parse.js

import { TRANSPORT_TYPE } from "/js/services/firestore/appointments-service.js";

const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/g;
const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const TRANSPORT_RE = /\b(LOANER|WAITER|VALET)\b/i;
const ADVISOR_RE = /\b(\d{3,5})\b/;

export function parseAppointmentSheetText(rawText = "") {
  const text = String(rawText || "").replace(/\r/g, "");
  const dateMatch = text.match(DATE_RE);
  const appointmentDate = dateMatch ? normalizeSheetDate(dateMatch[1]) : "";

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows = [];
  for (const line of lines) {
    if (/^date\b/i.test(line) || /^advisor\b/i.test(line)) continue;
    if (/appointments/i.test(line) && /customer name/i.test(line)) continue;
    if (/^time\b/i.test(line)) continue;

    const vinMatch = line.match(VIN_RE);
    const timeMatch = line.match(TIME_RE);
    if (!vinMatch && !timeMatch) continue;

    const phoneMatch = line.match(PHONE_RE);
    const transportMatch = line.match(TRANSPORT_RE);
    const transportationType = normalizeTransport(transportMatch?.[1]);

    let working = line;
    if (timeMatch) working = working.replace(timeMatch[0], " ");
    if (vinMatch) working = working.replace(vinMatch[0], " ");
    if (phoneMatch) working = working.replace(phoneMatch[0], " ");
    if (transportMatch) working = working.replace(transportMatch[0], " ");
    working = working
      .replace(/\b(S|D)\b/g, " ")
      .replace(/\bPO\b/g, "PO")
      .replace(/\s+/g, " ")
      .trim();

    const advisorMatch = working.match(ADVISOR_RE);
    const advisorCode = advisorMatch ? advisorMatch[1] : "";
    if (advisorCode) {
      working = working.replace(advisorCode, " ").replace(/\s+/g, " ").trim();
    }

    const concern = extractConcern(working);
    const nameAndVehicle = concern
      ? working.slice(0, working.toLowerCase().lastIndexOf(concern.toLowerCase())).trim()
      : working;

    const { customerName, vehicle, license } = splitNameVehicle(nameAndVehicle);

    rows.push({
      appointmentDate,
      appointmentTime: timeMatch ? cleanTime(timeMatch[1]) : "",
      customerName,
      phone: phoneMatch ? phoneMatch[0] : "",
      vin: vinMatch ? vinMatch[0].toUpperCase() : "",
      license,
      vehicle,
      advisorCode,
      concern,
      transportationType,
      loanerRequired: transportationType === TRANSPORT_TYPE.LOANER,
      rawLine: line,
      source: "sheet-ocr",
    });
  }

  return {
    appointmentDate,
    rows,
    rawText: text,
  };
}

function normalizeSheetDate(value) {
  const [month, day, year] = String(value).split("/");
  const yy = String(year).length === 4 ? String(year).slice(-2) : String(year).padStart(2, "0");
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${yy}`;
}

function cleanTime(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTransport(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "loaner") return TRANSPORT_TYPE.LOANER;
  if (key === "waiter") return TRANSPORT_TYPE.WAITER;
  if (key === "valet") return TRANSPORT_TYPE.VALET;
  return TRANSPORT_TYPE.NONE;
}

function extractConcern(text) {
  const patterns = [
    /CAMPAIGN.*$/i,
    /DRIVEABILITY.*$/i,
    /PRE PAID.*$/i,
    /OIL\s*&\s*FILTER.*$/i,
    /CHECK ENGINE.*$/i,
    /QUICK SERVICE.*$/i,
    /TOWING.*$/i,
    /\d+\s*YEAR\s*SVC.*$/i,
    /\d+\s*YEAR\s*SERVICE.*$/i,
    /M&B.*$/i,
    /BATTERY.*$/i,
    /EXTERIOR.*$/i,
    /2 YEAR.*$/i,
    /4 YEAR.*$/i,
    /3 YEAR.*$/i,
    /1 YEAR.*$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return "";
}

function splitNameVehicle(text) {
  const licenseMatch = text.match(/\b([A-Z0-9]{4,8})\b(?=\s+\d{2}\s+PO|\s+\d{2}\s)/);
  let license = "";
  let working = text;
  if (licenseMatch && !/PO|CAYENNE|MACAN|911|PANAMERA|TAYCAN/i.test(licenseMatch[1])) {
    license = licenseMatch[1];
    working = working.replace(license, " ").replace(/\s+/g, " ").trim();
  }

  const vehicleMatch = working.match(/(\d{2}\s+PO\s+.+)$/i);
  if (vehicleMatch) {
    return {
      customerName: working.replace(vehicleMatch[1], "").trim(),
      vehicle: vehicleMatch[1].trim(),
      license,
    };
  }
  return { customerName: working, vehicle: "", license };
}

export async function recognizeAppointmentImage(file) {
  if (!file) {
    throw new Error("No image selected.");
  }
  await loadTesseract();
  const result = await window.Tesseract.recognize(file, "eng", {
    logger: () => {},
  });
  return result?.data?.text || "";
}

function loadTesseract() {
  if (window.Tesseract) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load OCR library."));
    document.head.appendChild(script);
  });
}