// public/js/services/ocr/ro-ocr-service.js

const SCAN_RO_FUNCTION_URL =
  "https://us-central1-dexp-5056c.cloudfunctions.net/scanRO";

export async function scanROImage(file) {
  if (!file) {
    throw new Error("Missing image file");
  }

  const imageBase64 = await fileToBase64(file);

  const response = await fetch(SCAN_RO_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image: imageBase64
    })
  });

  if (!response.ok) {
    throw new Error("OCR request failed");
  }

  const result = await response.json();

  const rawText = result.rawText || "";

  return {
    roNumber: extractRONumber(rawText),
    tagNumber: extractTagNumber(rawText),
    vin: extractVIN(rawText),
    year: extractYear(rawText),
    make: extractMake(rawText),
    model: extractModel(rawText),
    color: extractColor(rawText),
    customerName: extractCustomerName(rawText),
    customerPhone: extractPhone(rawText),
    rawOcrText: rawText
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function extractRONumber(text) {
  const match = text.match(/\b\d{6,9}\b/);
  return match ? match[0] : "";
}

function extractTagNumber(text) {
  const match = text.match(/\bT[-\s]?\d{3,5}\b/i);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function extractVIN(text) {
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
  return match ? match[0].toUpperCase() : "";
}

function extractYear(text) {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

function extractMake(text) {
  if (/porsche/i.test(text)) return "Porsche";
  if (/ford/i.test(text)) return "Ford";
  if (/toyota/i.test(text)) return "Toyota";
  if (/honda/i.test(text)) return "Honda";
  if (/bmw/i.test(text)) return "BMW";
  if (/mercedes/i.test(text)) return "Mercedes-Benz";

  return "";
}

function extractModel(text) {
  const knownModels = [
    "911",
    "Cayenne",
    "Macan",
    "Panamera",
    "Taycan",
    "Boxster",
    "Cayman"
  ];

  return knownModels.find((model) =>
    text.toLowerCase().includes(model.toLowerCase())
  ) || "";
}

function extractColor(text) {
  const colors = [
    "Black",
    "White",
    "Silver",
    "Gray",
    "Grey",
    "Blue",
    "Red",
    "Green",
    "Yellow",
    "Brown"
  ];

  return colors.find((color) =>
    text.toLowerCase().includes(color.toLowerCase())
  ) || "";
}

function extractCustomerName(text) {
  return "";
}

function extractPhone(text) {
  const match = text.match(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  return match ? match[0] : "";
}