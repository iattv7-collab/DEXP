// ======================================================
// FILE: /functions/loaners/scan-vin.js
// MODULE: Loaners
// PURPOSE:
// Receive a camera image, run Google Cloud Vision OCR,
// identify the best VIN candidate, repair controlled OCR
// mistakes, validate the VIN, and return it to Loaners.
// ======================================================

const { onRequest } = require("firebase-functions/v2/https");
const vision = require("@google-cloud/vision");
const cors = require("cors")({ origin: true });

const visionClient = new vision.ImageAnnotatorClient();

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

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

const VIN_WEIGHTS = [
  8, 7, 6, 5, 4, 3, 2, 10, 0,
  9, 8, 7, 6, 5, 4, 3, 2,
];

// =========================
// MULTIPART IMAGE UPLOAD
// =========================

function readUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(
      req.headers["content-type"] || "",
    );

    if (!contentType.includes("multipart/form-data")) {
      reject(new Error("Expected multipart/form-data."));
      return;
    }

    const busboy = require("busboy")({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: 10 * 1024 * 1024,
      },
    });

    const chunks = [];
    let fileFound = false;
    let uploadError = null;

    busboy.on("file", (fieldName, file) => {
      if (fieldName !== "file") {
        file.resume();
        return;
      }

      fileFound = true;

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("limit", () => {
        uploadError = new Error(
          "Uploaded image is too large.",
        );
      });

      file.on("error", (error) => {
        uploadError = error;
      });
    });

    busboy.on("error", reject);

    busboy.on("finish", () => {
      if (uploadError) {
        reject(uploadError);
        return;
      }

      if (!fileFound || !chunks.length) {
        reject(new Error("Missing uploaded image."));
        return;
      }

      resolve(Buffer.concat(chunks));
    });

    if (req.rawBody) {
      busboy.end(req.rawBody);
      return;
    }

    req.pipe(busboy);
  });
}

// =========================
// VIN VALIDATION
// =========================

function passesVinChecksum(vin = "") {
  if (!VIN_PATTERN.test(vin)) {
    return false;
  }

  let total = 0;

  for (let index = 0; index < vin.length; index += 1) {
    const character = vin[index];

    const value = /^\d$/.test(character)
      ? Number(character)
      : VIN_TRANSLITERATION[character];

    if (value === undefined) {
      return false;
    }

    total += value * VIN_WEIGHTS[index];
  }

  const remainder = total % 11;

  const expectedCheckDigit =
    remainder === 10 ? "X" : String(remainder);

  return vin[8] === expectedCheckDigit;
}

// =========================
// VIN OCR REPAIR
// =========================

function repairVinCandidate(value = "") {
  const original = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (original.length !== 17) {
    return null;
  }

  let repairCount = 0;

  const repaired = original
    .split("")
    .map((character) => {
      if (character === "O") {
        repairCount += 1;
        return "0";
      }

      if (character === "I") {
        repairCount += 1;
        return "1";
      }

      if (character === "Q") {
        repairCount += 1;
        return "0";
      }

      return character;
    })
    .join("");

  if (!VIN_PATTERN.test(repaired)) {
    return null;
  }

  return {
    vin: repaired,
    original,
    repairCount,
    checksumValid: passesVinChecksum(repaired),
  };
}

// =========================
// VIN CANDIDATE COLLECTION
// =========================

function addCandidate(candidateMap, value, options = {}) {
  const repaired = repairVinCandidate(value);

  if (!repaired) {
    return;
  }

  const {
    nearVinLabel = false,
    standalone = false,
    lineIndex = -1,
    source = "unknown",
  } = options;

  let score = 0;

  if (repaired.checksumValid) {
    score += 100;
  }

  if (nearVinLabel) {
    score += 50;
  }

  if (standalone) {
    score += 25;
  }

  if (source === "exact-token") {
    score += 20;
  }

  if (source === "line-window") {
    score += 10;
  }

  score -= repaired.repairCount * 4;

  const existing = candidateMap.get(repaired.vin);

  if (!existing || score > existing.score) {
    candidateMap.set(repaired.vin, {
      ...repaired,
      score,
      nearVinLabel,
      standalone,
      lineIndex,
      source,
    });
  }
}

function collectCandidatesFromLine(
  candidateMap,
  line,
  lineIndex,
  nearVinLabel,
) {
  const upperLine = String(line).toUpperCase();

  /*
   * First inspect each OCR token independently.
   * This is the safest case because the VIN is not joined
   * to surrounding RO or vehicle information.
   */
  const tokens = upperLine
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

  for (const token of tokens) {
    if (token.length === 17) {
      addCandidate(candidateMap, token, {
        nearVinLabel,
        standalone: true,
        lineIndex,
        source: "exact-token",
      });
    }
  }

  /*
   * Then inspect the compacted line with a sliding
   * 17-character window. This catches VINs touching
   * nearby punctuation or OCR text.
   */
  const compactLine = upperLine.replace(/[^A-Z0-9]/g, "");

  if (compactLine.length < 17) {
    return;
  }

  for (
    let start = 0;
    start <= compactLine.length - 17;
    start += 1
  ) {
    const window = compactLine.slice(start, start + 17);

    addCandidate(candidateMap, window, {
      nearVinLabel,
      standalone: compactLine.length === 17,
      lineIndex,
      source: "line-window",
    });
  }
}

function findBestVin(rawText = "") {
  const lines = String(rawText)
    .toUpperCase()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      vin: "",
      checksumValid: false,
      repairCount: 0,
      score: 0,
      source: "",
    };
  }

  const candidateMap = new Map();

  const labelIndexes = new Set();

  lines.forEach((line, index) => {
    if (
      /\bVIN\b/i.test(line) ||
      /VEHICLE\s+(?:I\.?\s*D\.?|L\.?\s*D\.?)\s*(?:NO\.?|NUMBER)?/i.test(
        line,
      ) ||
      /VEHICLE\s+IDENTIFICATION/i.test(line)
    ) {
      labelIndexes.add(index);
    }
  });

  lines.forEach((line, index) => {
    const nearVinLabel = Array.from(labelIndexes).some(
      (labelIndex) =>
        index >= labelIndex &&
        index <= labelIndex + 4,
    );

    collectCandidatesFromLine(
      candidateMap,
      line,
      index,
      nearVinLabel,
    );
  });

  /*
   * OCR can occasionally split a VIN across two lines.
   * Inspect neighboring lines, but score these candidates
   * below standalone candidates.
   */
  for (let index = 0; index < lines.length - 1; index += 1) {
    const combined =
      `${lines[index]} ${lines[index + 1]}`;

    const nearVinLabel = Array.from(labelIndexes).some(
      (labelIndex) =>
        index >= labelIndex &&
        index <= labelIndex + 4,
    );

    const compactCombined = combined
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (compactCombined.length < 17) {
      continue;
    }

    for (
      let start = 0;
      start <= compactCombined.length - 17;
      start += 1
    ) {
      const window =
        compactCombined.slice(start, start + 17);

      addCandidate(candidateMap, window, {
        nearVinLabel,
        standalone: false,
        lineIndex: index,
        source: "joined-lines",
      });
    }
  }

  const candidates = Array.from(candidateMap.values());

  if (!candidates.length) {
    return {
      vin: "",
      checksumValid: false,
      repairCount: 0,
      score: 0,
      source: "",
    };
  }

  candidates.sort((first, second) => {
    if (
      first.checksumValid !== second.checksumValid
    ) {
      return first.checksumValid ? -1 : 1;
    }

    if (first.score !== second.score) {
      return second.score - first.score;
    }

    if (first.repairCount !== second.repairCount) {
      return first.repairCount - second.repairCount;
    }

    return first.lineIndex - second.lineIndex;
  });

  const best = candidates[0];

  /*
   * A checksum-valid candidate is always accepted.
   *
   * A non-checksum candidate is accepted only when it has
   * strong context, such as being a standalone 17-character
   * token or appearing near a VIN label.
   */
  const acceptable =
    best.checksumValid ||
    best.nearVinLabel ||
    best.standalone;

  if (!acceptable) {
    return {
      vin: "",
      checksumValid: false,
      repairCount: 0,
      score: 0,
      source: "",
    };
  }

  return best;
}

// =========================
// LOANER LIVE VIN SCANNER
// =========================

const scanVIN = onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
          success: false,
          vin: "",
          error: "Method not allowed",
        });
      }

      const imageBuffer = await readUpload(req);

      const request = {
        image: {
          content: imageBuffer,
        },
      };

      const visionResponse =
        await visionClient.textDetection(request);

      const result = visionResponse[0];
      const detections = result.textAnnotations || [];

      const rawText =
        detections[0] && detections[0].description
          ? detections[0].description
          : "";

      const bestCandidate = findBestVin(rawText);

      console.log("scanVIN result", {
        vinFound: Boolean(bestCandidate.vin),
        checksumValid:
          bestCandidate.checksumValid || false,
        repairCount:
          bestCandidate.repairCount || 0,
        score:
          bestCandidate.score || 0,
        source:
          bestCandidate.source || "",
      });

      return res.json({
        success: true,
        vin: bestCandidate.vin || "",
        validated:
          bestCandidate.checksumValid || false,
        repaired:
          (bestCandidate.repairCount || 0) > 0,
      });
    } catch (error) {
      console.error("scanVIN failed:", error);

      return res.status(500).json({
        success: false,
        vin: "",
        error: "VIN OCR failed",
      });
    }
  });
});

module.exports = {
  scanVIN,
};