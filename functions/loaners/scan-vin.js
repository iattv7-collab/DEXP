// ======================================================
// FILE: /functions/loaners/scan-vin.js
// MODULE: Loaners
// PURPOSE:
// Receive a camera image, run Google Cloud Vision OCR,
// extract a VIN, and return it to the Loaner modules.
//
// IMPORTANT:
// This is the existing VIN scanner behavior moved out
// of functions/index.js. No OCR behavior is changed yet.
// ======================================================

const { onRequest } = require("firebase-functions/v2/https");
const vision = require("@google-cloud/vision");
const cors = require("cors")({ origin: true });

const visionClient = new vision.ImageAnnotatorClient();

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
// LOANER LIVE VIN SCANNER
// =========================

const scanVIN = onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
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

      const normalizedText = String(rawText)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

      const matches =
        normalizedText.match(
          /[A-HJ-NPR-Z0-9]{17}/g,
        ) || [];

      const vin =
        matches.find((candidate) => {
          return /^[A-HJ-NPR-Z0-9]{17}$/.test(
            candidate,
          );
        }) || "";

      return res.json({
        success: true,
        vin,
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