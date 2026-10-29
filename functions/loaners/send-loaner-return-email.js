// functions/loaners/send-loaner-return-email.js
// Sends a loaner-return email via Gmail SMTP when a loanerReturns doc is created.

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

const FROM = "DEXP <marlon@dexpglobal.com>";

function cleanEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : "";
}

async function getAdvisorEmail(dealerId, roNumber) {
  if (!dealerId || !roNumber) return "";

  const roSnap = await admin
    .firestore()
    .collection("ros")
    .where("dealerId", "==", dealerId)
    .where("roNumber", "==", String(roNumber).trim())
    .limit(1)
    .get();

  if (roSnap.empty) return "";

  const ro = roSnap.docs[0].data() || {};
  const advisorId = String(ro.advisorId || "").trim();
  if (!advisorId) return "";

  const userSnap = await admin.firestore().doc(`users/${advisorId}`).get();
  if (!userSnap.exists) return "";

  return cleanEmail(userSnap.data()?.email);
}

const sendLoanerReturnEmail = onDocumentCreated(
  {
    document: "loanerReturns/{returnId}",
    secrets: [GMAIL_APP_PASSWORD],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const dealerId = String(data.dealerId || "").trim();
    if (!dealerId) return;

    const dealerSnap = await admin.firestore().doc(`dealers/${dealerId}`).get();
    const settings = dealerSnap.data() || {};

    if (!settings.loanerReturnEmailEnabled) return;

    const recipients = new Set();

    [
      settings.loanerReturnEmailLoanerAdmin,
      settings.loanerReturnEmailWarrantyAdmin,
      settings.loanerReturnEmailShopManager,
    ].forEach((value) => {
      const email = cleanEmail(value);
      if (email) recipients.add(email);
    });

    const advisorEmail = await getAdvisorEmail(dealerId, data.assignedRo);
    if (advisorEmail) recipients.add(advisorEmail);

    const to = Array.from(recipients);
    if (!to.length) {
      console.log("No recipients for loaner return", event.params.returnId);
      return;
    }

    const subject = `Loaner returned — ${data.vin || "VIN"} (RO ${data.assignedRo || "—"})`;

    const lines = [
      `VIN: ${data.vin || ""}`,
      `Year / Model: ${data.year || ""} ${data.model || ""}`.trim(),
      `RO: ${data.assignedRo || ""}`,
      `Returned: ${data.returnedAtText || ""}`,
      `Received by: ${data.receivedByName || ""}`,
      `Mileage: ${data.mileage || ""}`,
      `Fuel / Range: ${data.fuelLevel || ""}`,
      `Damage: ${data.damageNotes || "No"}`,
    ];

    const text = lines.filter(Boolean).join("\n");
    const html = `<pre style="font-family:sans-serif">${text.replace(/\n/g, "<br>")}</pre>`;

    const appPassword = GMAIL_APP_PASSWORD.value();
    if (!appPassword) {
      console.error("GMAIL_APP_PASSWORD not set");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "marlon@dexpglobal.com",
        pass: appPassword,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: FROM,
        to: to.join(", "),
        subject,
        text,
        html,
      });

      await event.data.ref.set(
        {
          emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
          emailSentTo: to,
          emailId: info.messageId || "",
        },
        { merge: true },
      );

      console.log("Loaner return email sent", event.params.returnId, to);
    } catch (error) {
      console.error("Gmail send failed", error);
    }
  },
);

module.exports = { sendLoanerReturnEmail };