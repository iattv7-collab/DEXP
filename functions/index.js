const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");

const vision = require("@google-cloud/vision");
const cors = require("cors")({origin: true});

setGlobalOptions({
  maxInstances: 10,
});

const visionClient = new vision.ImageAnnotatorClient();

exports.scanRO = onRequest(async (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({
          error: "Method not allowed",
        });
      }

      const imageBase64 = req.body && req.body.image;

      if (!imageBase64) {
        return res.status(400).json({
          error: "Missing image",
        });
      }

      const request = {
        image: {
          content: imageBase64,
        },
      };

      const visionResponse = await visionClient.textDetection(request);
      const result = visionResponse[0];
      const detections = result.textAnnotations || [];

      const rawText = detections[0] && detections[0].description ?
        detections[0].description :
        "";

      return res.json({
        success: true,
        rawText: rawText,
      });
    } catch (error) {
      console.error("scanRO failed:", error);

      return res.status(500).json({
        error: "OCR failed",
      });
    }
  });
});
