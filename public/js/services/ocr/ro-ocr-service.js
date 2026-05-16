// public/js/services/ocr/ro-ocr-service.js

const SCAN_RO_FUNCTION_URL =
    "https://us-central1-dexp-5056c.cloudfunctions.net/scanRO";

export async function scanROImage(file) {
    if (!file) {
        throw new Error("Missing image file");
    }

    const croppedImageBase64 =
        await cropImageToIntakeBlock(file);

    const response = await fetch(SCAN_RO_FUNCTION_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            image: croppedImageBase64
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
        year: "",
        make: "",
        model: "",
        color: "",
        customerName: extractCustomerName(rawText),
        customerPhone: extractPhone(rawText),
        advisorName: extractAdvisorName(rawText),
        advisorNumber: extractAdvisorNumber(rawText),
        rawOcrText: rawText
    };
}

async function cropImageToIntakeBlock(file) {
    const image = await loadImage(file);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Porsche Reynolds center intake block.
    // These are percentage-based so it works with different image sizes.
    const crop = {
        x: 0.03,
        y: 0.31,
        width: 0.94,
        height: 0.28
    };

    const sourceX = image.width * crop.x;
    const sourceY = image.height * crop.y;
    const sourceWidth = image.width * crop.width;
    const sourceHeight = image.height * crop.height;

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
    );

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    return dataUrl.split(",")[1] || "";
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            resolve(image);
        };

        image.onerror = reject;

        image.src = URL.createObjectURL(file);
    });
}

function extractRONumber(text) {
    const roLabelMatch =
        text.match(/R\.?\s*O\.?\s*(?:NO\.?|#)?\s*[:\-]?\s*(\d{5,9})/i);

    if (roLabelMatch) {
        return roLabelMatch[1];
    }

    const numbers = text.match(/\b\d{5,9}\b/g) || [];

    return numbers[numbers.length - 1] || "";
}

function extractVIN(text) {
    const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);

    return match ? match[0].toUpperCase() : "";
}

function extractYear(text) {
    const yearMakeModelMatch =
        text.match(/\b(19|20)\d{2}\s*\/\s*[A-Z]+/i);

    if (yearMakeModelMatch) {
        return yearMakeModelMatch[0].match(/\b(19|20)\d{2}\b/)[0];
    }

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
    const colorLabelMatch =
        text.match(/COLOR\s+([A-Z]+)\/?/i);

    if (colorLabelMatch) {
        return normalizeColor(colorLabelMatch[1]);
    }

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
    const lines = text
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const vinIndex = lines.findIndex((line) =>
        /\b[A-HJ-NPR-Z0-9]{17}\b/i.test(line)
    );

    if (vinIndex >= 0 && lines[vinIndex + 1]) {
        return lines[vinIndex + 1]
            .replace(/[^A-Z\s]/gi, "")
            .trim();
    }

    return "";
}

function extractPhone(text) {
    const phones =
        text.match(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g) || [];

    // Customer phone is usually in the middle intake block.
    // Use the first phone found in the cropped area.
    return phones[0] || "";
}

function normalizeColor(color = "") {
    const value = color.toLowerCase();

    if (value === "blk" || value === "black") return "Black";
    if (value === "wht" || value === "white") return "White";
    if (value === "gry" || value === "gray" || value === "grey") return "Gray";
    if (value === "blu" || value === "blue") return "Blue";
    if (value === "red") return "Red";
    if (value === "sil" || value === "silver") return "Silver";

    return color;
}

function extractTagNumber(text) {
    const lines = getCleanLines(text);

    const tagIndex = lines.findIndex((line) =>
        /TAG\s*NO/i.test(line)
    );

    if (tagIndex >= 0) {
        for (let i = tagIndex + 1; i < Math.min(lines.length, tagIndex + 4); i++) {
            if (/^\d{3,6}$/.test(lines[i])) {
                return lines[i];
            }
        }
    }

    return "";
}

function extractAdvisorName(text) {
    const lines = getCleanLines(text);

    const legalTextIndex = lines.findIndex((line) =>
        /I hereby authorize/i.test(line)
    );

    const searchEnd = legalTextIndex >= 0 ? legalTextIndex : lines.length;

    for (let i = 0; i < searchEnd; i++) {
        const line = lines[i];

        if (/^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(line)) {
            return line;
        }
    }

    return "";
}

function extractAdvisorNumber(text) {
    const lines = getCleanLines(text);

    const advisorNoIndex = lines.findIndex((line) =>
        /ADVISOR\s*NO/i.test(line)
    );

    if (advisorNoIndex >= 0) {
        for (let i = advisorNoIndex + 1; i < Math.min(lines.length, advisorNoIndex + 10); i++) {
            if (/^\d{2,5}$/.test(lines[i])) {
                return lines[i];
            }
        }
    }

    return "";
}

function getCleanLines(text) {
    return text
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}
