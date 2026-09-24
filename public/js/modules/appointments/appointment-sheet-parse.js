// public/js/modules/appointments/appointment-sheet-parse.js

import { TRANSPORT_TYPE } from "/js/services/firestore/appointments-service.js";

const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/gi;
const DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const TRANSPORT_RE = /\b(LOANER|WAITER|VALET)\b/gi;

const VIN_TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const MAKE_ALIASES = {
  PORSCHE: ["PORSCHE", "PO"],
  BMW: ["BMW"],
  MINI: ["MINI"],
  AUDI: ["AUDI"],
  VOLKSWAGEN: ["VOLKSWAGEN", "VW"],
  "MERCEDES-BENZ": ["MERCEDES-BENZ", "MERCEDES", "BENZ", "MB"],
  TOYOTA: ["TOYOTA"],
  LEXUS: ["LEXUS"],
  HONDA: ["HONDA"],
  ACURA: ["ACURA"],
  NISSAN: ["NISSAN"],
  INFINITI: ["INFINITI"],
  FORD: ["FORD"],
  LINCOLN: ["LINCOLN"],
  CHEVROLET: ["CHEVROLET", "CHEVY"],
  CADILLAC: ["CADILLAC"],
  GMC: ["GMC"],
  BUICK: ["BUICK"],
  JEEP: ["JEEP"],
  RAM: ["RAM"],
  DODGE: ["DODGE"],
  CHRYSLER: ["CHRYSLER"],
  HYUNDAI: ["HYUNDAI"],
  KIA: ["KIA"],
  GENESIS: ["GENESIS"],
  MAZDA: ["MAZDA"],
  SUBARU: ["SUBARU"],
  VOLVO: ["VOLVO"],
  JAGUAR: ["JAGUAR"],
  LANDROVER: ["LAND ROVER", "LANDROVER", "RANGE"],
  "LAND ROVER": ["LAND ROVER", "RANGE"],
  TESLA: ["TESLA"],
  FERRARI: ["FERRARI"],
  LAMBORGHINI: ["LAMBORGHINI"],
  MASERATI: ["MASERATI"],
  BENTLEY: ["BENTLEY"],
  "ROLLS-ROYCE": ["ROLLS", "ROLLS-ROYCE"],
  ASTON: ["ASTON"],
  "ASTON MARTIN": ["ASTON"],
};

export function parseAppointmentSheetText(rawText = "") {
  if (rawText && typeof rawText === "object") {
    return parseAppointmentSheetOcr(rawText);
  }
  return parseTextOnly(String(rawText || ""));
}

export function parseAppointmentSheetOcr(ocr = {}) {
  const text = String(ocr.text || "");
  const fromText = parseTextOnly(text);
  const fromLayout = parseLayoutRows(ocr.words || [], fromText.appointmentDate);
  const rows = finalizeRows(mergeRowSets(
    fromLayout.length ? fromLayout : fromText.rows,
    fromText.rows,
  ));
  return {
    appointmentDate: fromText.appointmentDate,
    rows,
    rawText: text,
  };
}

function parseTextOnly(rawText = "") {
  const text = String(rawText || "").replace(/\r/g, "");
  const dateMatch = text.match(DATE_RE);
  const appointmentDate = dateMatch ? normalizeSheetDate(dateMatch[1]) : "";

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let rows = parseLineRows(lines, appointmentDate);
  rows = finalizeRows(rows);
  return { appointmentDate, rows, rawText: text };
}

function parseLayoutRows(words, appointmentDate) {
  if (!Array.isArray(words) || words.length < 8) return [];
  const lines = clusterWordsIntoRows(words);
  const rows = [];
  for (const line of lines) {
    if (isHeaderLine(line.text)) continue;
    const timeMatch = line.text.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
    const vin = recoverVin(line.text) || recoverVin(line.words.map((word) => word.text).join("")) || recoverSuspectVin(line.text);
    if (!timeMatch) continue;
    const built = buildRow(line.text, appointmentDate, {
      time: timeMatch ? cleanTime(timeMatch[1]) : "",
      vin,
    });
    built.source = "sheet-ocr-layout";
    rows.push(built);
  }
  return rows;
}

function clusterWordsIntoRows(words) {
  const usable = words
    .map((word) => {
      const box = word.bbox || word;
      return {
        text: String(word.text || "").trim(),
        x0: Number(box.x0 ?? word.x0 ?? 0),
        y0: Number(box.y0 ?? word.y0 ?? 0),
        x1: Number(box.x1 ?? word.x1 ?? 0),
        y1: Number(box.y1 ?? word.y1 ?? 0),
        confidence: Number(word.confidence ?? 100),
      };
    })
    .filter((word) => word.text && word.confidence >= 15)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  const rows = [];
  for (const word of usable) {
    const height = Math.max(14, word.y1 - word.y0);
    const existing = rows.find((row) => Math.abs(row.y0 - word.y0) <= height * 0.6);
    if (existing) {
      existing.words.push(word);
      existing.y0 = Math.min(existing.y0, word.y0);
    } else {
      rows.push({ y0: word.y0, words: [word] });
    }
  }

  return rows.map((row) => {
    row.words.sort((a, b) => a.x0 - b.x0);
    return {
      y0: row.y0,
      words: row.words,
      text: row.words.map((word) => word.text).join(" "),
    };
  });
}

function parseLineRows(lines, appointmentDate) {
  const rows = [];
  for (const line of lines) {
    if (isHeaderLine(line)) continue;
    const timeMatch = line.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
    const vin = recoverVin(line) || recoverSuspectVin(line);
    if (!timeMatch) continue;
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
  const match = text.match(/\d{2}\s+(?:PO|PORSCHE|BMW|AUDI|MINI|MB|MERCEDES|VW|FORD|CHEVY|CHEVROLET|TOYOTA|LEXUS|HONDA|NISSAN|JEEP|RAM|HYUNDAI|KIA|VOLVO|TESLA)\s+(?:911|MACAN|CAYENNE|PANAMERA|TAYCAN|718|X[1-7]|[1-8]SERIES|[A-Z0-9][A-Z0-9\s]*?)(?=\s+WP|\s+\(|$)/i);
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
  const validVin = firstValidVin(row.vin) || recoverVin(blob) || recoverVin(row.vehicle);
  const suspectVin = validVin || firstSuspectVin(row.vin) || recoverSuspectVin(blob) || recoverSuspectVin(row.vehicle);
  const vin = validVin || suspectVin || "";
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
    vinIssue: validVin ? "ok" : vin ? "invalid" : "missing",
    phone,
    customerName,
    vehicle,
    loanerRequired: row.transportationType === TRANSPORT_TYPE.LOANER,
  };
}

function mergeRowSets(primary, extra) {
  const map = new Map();
  for (const row of [...primary, ...extra]) {
    const key = firstValidVin(row.vin) || `${row.appointmentTime}-${row.customerName}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row, vin: firstValidVin(row.vin) });
      continue;
    }
    map.set(key, {
      ...current,
      customerName: longer(current.customerName, row.customerName),
      vehicle: preferVehicle(current.vehicle, row.vehicle),
      phone: current.phone || row.phone,
      vin: firstValidVin(current.vin) || firstValidVin(row.vin),
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

function finalizeRows(rows = []) {
  const cleaned = rows
    .map((row) => polishRow(row))
    .filter((row) => row.appointmentTime && (row.customerName || looksLikeVin(row.vin) || firstValidVin(row.vin)))
    .map((row) => {
      const banned = vinHasJunkWords(row.vin);
      return banned ? { ...row, vin: "", vinIssue: "missing" } : row;
    });

  const byStamp = new Map();
  for (const row of cleaned) {
    const key = `${row.appointmentTime}|${String(row.advisorCode || "").slice(0, 3)}|${String(row.customerName || "").slice(0, 16).toUpperCase()}`;
    const current = byStamp.get(key);
    if (!current) {
      byStamp.set(key, row);
      continue;
    }
    byStamp.set(key, {
      ...current,
      customerName: longer(current.customerName, row.customerName),
      vehicle: preferVehicle(current.vehicle, row.vehicle),
      phone: current.phone || row.phone,
      vin: preferVin(current.vin, row.vin),
      advisorCode: longer(String(current.advisorCode || ""), String(row.advisorCode || "")),
      concern: current.concern || row.concern,
      transportationType:
        current.transportationType !== TRANSPORT_TYPE.NONE
          ? current.transportationType
          : row.transportationType,
      loanerRequired: current.loanerRequired || row.loanerRequired,
    });
  }
  return [...byStamp.values()].sort((a, b) => String(a.appointmentTime).localeCompare(String(b.appointmentTime)));
}

function preferVin(a, b) {
  return firstValidVin(a) || firstValidVin(b) || (looksLikeVin(a) ? a : "") || (looksLikeVin(b) ? b : "") || "";
}

function vinHasJunkWords(value) {
  const vin = String(value || "").toUpperCase();
  return /CHECK|ENGINE|LIGHT|LOANER|WAITER|DRIVE|PANAM|MACAN|CAYEN|PORSCH|TAYCAN|QUICK|CAMPAIGN|SERVICE|CUSTOMER/.test(vin);
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
  const vinDigits = [...recoverAllVins(text), ...recoverSuspectVins(text)]
    .join(" ");
  return (String(text).match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || []).filter((value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 10 || digits.startsWith("20")) return false;
    if (vinDigits.includes(digits)) return false;
    return true;
  });
}

function firstPhone(text) {
  return collectPhones(text)[0] || "";
}

function recoverVin(text) {
  for (const slice of collectVinSlices(prepVinRaw(text))) {
    const repaired = repairVin(slice);
    if (isValidVin(repaired)) return repaired;
  }
  return recoverAllVins(text)[0] || "";
}

function recoverSuspectVin(text) {
  for (const slice of collectVinSlices(prepVinRaw(text))) {
    const repaired = repairVin(slice);
    if (repaired) return repaired;
  }
  return recoverSuspectVins(text)[0] || "";
}

function prepVinRaw(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/VIPO/g, "WP0")
    .replace(/VIP1/g, "WP1")
    .replace(/WPO/g, "WP0")
    .replace(/WPI/g, "WP1")
    .replace(/WPL/g, "WP1");
}

const VIN_LOOKALIKES = {
  O: ["0"],
  0: ["O", "D"],
  I: ["1"],
  L: ["1"],
  1: ["I"],
  B: ["8"],
  8: ["B"],
  S: ["5"],
  5: ["S"],
  G: ["6"],
  6: ["G"],
  Z: ["2"],
  2: ["Z"],
  D: ["0"],
  Q: ["0"],
};

function repairVin(value) {
  const vin = normalizeVinCandidate(value);
  if (isValidVin(vin)) return vin;
  if (vin.length !== 17) return looksLikeVin(vin) ? vin : "";
  if (!looksLikeVin(vin) && !/^WP[01]/.test(vin)) return "";

  const candidates = [vin];
  for (let i = 0; i < 17; i += 1) {
    for (const alt of VIN_LOOKALIKES[vin[i]] || []) {
      candidates.push(`${vin.slice(0, i)}${alt}${vin.slice(i + 1)}`);
    }
  }
  for (const first of [...candidates]) {
    if (isValidVin(first) && /^WP[01]/.test(first)) return first;
  }
  if (/^WP[01]/.test(vin)) {
    for (let i = 0; i < 17; i += 1) {
      for (const alt of VIN_LOOKALIKES[vin[i]] || []) {
        const one = `${vin.slice(0, i)}${alt}${vin.slice(i + 1)}`;
        for (let j = i + 1; j < 17; j += 1) {
          for (const alt2 of VIN_LOOKALIKES[one[j]] || []) {
            const two = `${one.slice(0, j)}${alt2}${one.slice(j + 1)}`;
            if (isValidVin(two) && /^WP[01]/.test(two)) return two;
          }
        }
      }
    }
  }
  return looksLikeVin(vin) || /^WP[01]/.test(vin) ? vin : "";
}

function firstSuspectVin(value) {
  const vin = normalizeVinCandidate(value);
  return looksLikeVin(vin) ? vin : "";
}

const VIN_WMI_RE = /WP[01]|WBA|WBS|WBY|WMW|WAU|WA1|WVW|WVG|WDD|WDC|W1[KN]|1G[A-Z0-9]|1F[A-Z]|1C[A-Z]|1J[A-Z]|1N[A-Z]|2H[A-Z]|2G[A-Z]|2T[A-Z]|3V[A-Z]|4T[A-Z]|5YJ|5TD|JN[A-Z]|JH[A-Z]|KM[A-Z]|KN[A-Z]|SAL|SAJ|YV1/g;

function looksLikeVin(value) {
  const vin = String(value || "").toUpperCase();
  if (vin.length !== 17) return false;
  if (vinHasJunkWords(vin)) return false;
  if ((vin.match(/[A-Z]/g) || []).length >= 12) return false;
  if (/^\d{3,5}S/.test(vin)) return false;
  const wmi = new RegExp(`^(?:${VIN_WMI_RE.source})`);
  if (!wmi.test(vin)) return false;
  if (!/[A-HJ-NPR-TV-Y1-9]/.test(vin[9] || "")) return false;
  const digits = (vin.match(/\d/g) || []).length;
  const letters = (vin.match(/[A-Z]/g) || []).length;
  return digits >= 3 && letters >= 3;
}

function firstValidVin(value) {
  const vin = normalizeVinCandidate(value);
  return isValidVin(vin) ? vin : "";
}

function normalizeVinCandidate(value) {
  let vin = String(value || "")
    .toUpperCase()
    .replace(/VIPO/g, "WP0")
    .replace(/VIP1/g, "WP1")
    .replace(/WPO/g, "WP0")
    .replace(/WPI/g, "WP1")
    .replace(/WPL/g, "WP1")
    .replace(/[^A-Z0-9]/g, "");
  if (vin.length > 17) vin = vin.slice(0, 17);
  vin = vin.replace(/O/g, "0").replace(/I/g, "1").replace(/Q/g, "0");
  return vin;
}

export function isValidVin(value) {
  const vin = String(value || "").toUpperCase();
  if (vin.length !== 17) return false;
  if (/[IOQ]/.test(vin)) return false;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const ch = vin[i];
    const n = /\d/.test(ch) ? Number(ch) : VIN_TRANSLIT[ch];
    if (n == null) return false;
    sum += n * VIN_WEIGHTS[i];
  }

  const check = sum % 11;
  const expected = check === 10 ? "X" : String(check);
  return vin[8] === expected;
}

function recoverAllVins(text) {
  const raw = String(text || "")
    .toUpperCase()
    .replace(/VIPO/g, "WP0")
    .replace(/VIP1/g, "WP1")
    .replace(/WPO/g, "WP0")
    .replace(/WPI/g, "WP1")
    .replace(/WPL/g, "WP1");

  const candidates = [];
  const seen = new Set();

  function add(token) {
    const vin = firstValidVin(token);
    if (!vin || seen.has(vin)) return;
    seen.add(vin);
    candidates.push(vin);
  }

  collectVinSlices(raw).forEach(add);
  return candidates;
}

function recoverSuspectVins(text) {
  const raw = String(text || "")
    .toUpperCase()
    .replace(/VIPO/g, "WP0")
    .replace(/VIP1/g, "WP1")
    .replace(/WPO/g, "WP0")
    .replace(/WPI/g, "WP1")
    .replace(/WPL/g, "WP1");

  const found = [];
  const seen = new Set();

  function add(token) {
    const vin = firstSuspectVin(token);
    if (!vin || seen.has(vin)) return;
    seen.add(vin);
    found.push(vin);
  }

  collectVinSlices(raw).forEach(add);
  return found;
}

function collectVinSlices(raw) {
  const slices = [];
  const compact = String(raw || "").replace(/[^A-Z0-9]/g, "");
  const wmi = new RegExp(VIN_WMI_RE.source, "g");
  let match = wmi.exec(compact);
  while (match) {
    slices.push(compact.slice(match.index, match.index + 17));
    match = wmi.exec(compact);
  }
  const spaced = String(raw || "").match(/\b(?:WP[O0I1L]|WBA|WDD|WAU|WVW|5YJ)[A-Z0-9\s]{10,20}\b/g) || [];
  spaced.forEach((token) => slices.push(token));
  return slices;
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
  const ocr = await recognizeAppointmentSheet(file);
  return ocr.text;
}

export async function recognizeAppointmentSheet(file) {
  if (!file) throw new Error("No image selected.");
  await loadTesseract();
  const canvas = await prepareImageCanvas(file);
  const pageBlob = await canvasToBlob(canvas);
  const page = await window.Tesseract.recognize(pageBlob, "eng", {
    logger: () => {},
    tessedit_pageseg_mode: "6",
  });

  const words = Array.isArray(page?.data?.words) ? page.data.words : [];
  let vinColumnText = "";

  const vinBoxes = words.filter((word) => /WP[O0I1L]/i.test(String(word.text || "")));
  if (vinBoxes.length >= 2) {
    const x0 = Math.max(0, median(vinBoxes.map((word) => word.bbox?.x0 ?? 0)) - 40);
    const x1 = Math.min(canvas.width, median(vinBoxes.map((word) => word.bbox?.x1 ?? canvas.width)) + 40);
    const crop = cropCanvas(canvas, x0, 0, Math.max(80, x1 - x0), canvas.height);
    const cropBlob = await canvasToBlob(crop);
    const column = await window.Tesseract.recognize(cropBlob, "eng", {
      logger: () => {},
      tessedit_pageseg_mode: "6",
      tessedit_char_whitelist: "ABCDEFGHJKLMNPRSTUVWXYZ0123456789 ",
    });
    vinColumnText = String(column?.data?.text || "");
  }

  return {
    text: `${page?.data?.text || ""}\n${vinColumnText}`.trim(),
    words,
    vinColumnText,
  };
}

function median(values) {
  const list = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return 0;
  return list[Math.floor(list.length / 2)];
}

function cropCanvas(source, x, y, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare photo."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function prepareImageCanvas(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = image.width < 1800 ? 2.6 : 1.8;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        let gray = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        gray = (gray - 128) * 1.25 + 128;
        const bw = gray > 186 ? 255 : gray < 96 ? 0 : gray;
        data[i] = data[i + 1] = data[i + 2] = bw;
      }
      ctx.putImageData(pixels, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
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
    const typed = normalizeVinCandidate(row.vin);
    const vin = firstValidVin(typed);
    if (!vin) {
      row.vin = typed.length === 17 ? typed : String(row.vin || "").trim();
      row.vinIssue = row.vin ? "invalid" : "missing";
      row.vehicle = "";
      return;
    }

    const decoded = await decodeVinAnyDealer(vin);
    row.vin = vin;
    if (!decoded) {
      row.vinIssue = "ok";
      row.vehicle = "";
      return;
    }

    row.vinIssue = "ok";
    row.vehicle = formatDecodedVehicle(decoded);
  }));
  return list;
}

export async function lookupVehicleFromVin(value) {
  const vin = firstValidVin(value);
  if (!vin) return "";
  const decoded = await decodeVinAnyDealer(vin);
  return decoded ? formatDecodedVehicle(decoded) : "";
}

export function vinNeedsReview(value) {
  return !isValidVin(normalizeVinCandidate(value) || String(value || "").trim());
}

function vehicleMatchesDecoded(sheetVehicle, decoded = {}) {
  const sheet = String(sheetVehicle || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!sheet) return true;

  const year = String(decoded.year || "").trim();
  const yy = year.slice(-2);
  const sheetHasYear = /\b(?:19|20)\d{2}\b|\b\d{2}\b/.test(sheet);
  if (sheetHasYear && yy && !sheet.includes(yy) && !sheet.includes(year)) {
    return false;
  }

  const make = String(decoded.make || "").toUpperCase().trim();
  if (make) {
    const aliases = MAKE_ALIASES[make] || [make, ...make.split(/[\s-]+/)].filter((item) => item.length >= 2);
    if (!aliases.some((alias) => sheet.includes(alias))) {
      return false;
    }
  }

  const model = String(decoded.model || "").toUpperCase().trim();
  const modelTokens = model.split(/[\s-/]+/).filter((token) => token.length >= 3);
  if (modelTokens.length && !modelTokens.some((token) => sheet.includes(token))) {
    return false;
  }

  return true;
}

function formatDecodedVehicle(decoded = {}) {
  const year = String(decoded.year || "").trim();
  const make = String(decoded.make || "").trim();
  const model = String(decoded.model || "").trim();
  if (!make && !model) return "";
  return [year.slice(-2), make, model].filter(Boolean).join(" ");
}

async function decodeVinAnyDealer(vin) {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const result = payload?.Results?.[0] || {};
    const year = String(result.ModelYear || "").trim();
    const make = String(result.Make || "").trim();
    const model = String(result.Model || "").trim();
    if (!make && !model) return null;
    return { year, make, model };
  } catch (error) {
    return null;
  }
}
