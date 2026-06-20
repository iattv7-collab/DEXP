// functions/index.js
// DEXP Firebase Functions
// - OCR Scanner
// - User Role Management
// - Admin Account Controls

const { setGlobalOptions } = require("firebase-functions");

const {
  onRequest,
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");

const { onSchedule } = require("firebase-functions/v2/scheduler");

const admin = require("firebase-admin");

const vision = require("@google-cloud/vision");

const cors = require("cors")({ origin: true });

admin.initializeApp();

setGlobalOptions({
  maxInstances: 10,
});

const visionClient = new vision.ImageAnnotatorClient();

const ALLOWED_ROLES = [
  "platform-admin",
  "admin",
  "manager",
  "advisor",
  "foreman",
  "tech",
  "wash",
  "valet",
  "qc",
  "booker",
  "staff",
  "pending",
];

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required.");
  }
}

function callerRole(request) {
  return request.auth?.token?.role || "pending";
}

function callerActive(request) {
  return request.auth?.token?.active === true;
}

function requireActive(request) {
  if (!callerActive(request)) {
    throw new HttpsError("permission-denied", "Account disabled.");
  }
}

function requireRole(request, allowedRoles) {
  const role = callerRole(request);

  if (!allowedRoles.includes(role)) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
}

async function countActiveAdmins() {
  const snapshot = await admin
    .firestore()
    .collection("users")
    .where("role", "==", "admin")
    .where("active", "==", true)
    .get();

  return snapshot.size;
}

async function getUserClaims(uid) {
  const user = await admin.auth().getUser(uid);

  return {
    user,
    claims: user.customClaims || {},
  };
}

async function setClaims(uid, claims) {
  await admin.auth().setCustomUserClaims(uid, claims);
}

exports.checkLoginEmail = onCall(async (request) => {
  const email = String(request.data?.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new HttpsError("invalid-argument", "Email is required.");
  }

  const snapshot = await admin
    .firestore()
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return {
      exists: false,
      status: "not-found",
    };
  }

  const user = snapshot.docs[0].data();

  if (user.role === "pending") {
    return {
      exists: true,
      status: "pending",
    };
  }

  if (user.active === false) {
    return {
      exists: true,
      status: "disabled",
    };
  }

  return {
    exists: true,
    status: "active",
  };
});

exports.checkDealerCompanyId = onCall(async (request) => {
  const dealerId = String(request.data?.dealerId || "").trim();
  const companyId = String(request.data?.companyId || "").trim();

  if (!dealerId || !companyId) {
    throw new HttpsError(
      "invalid-argument",
      "Dealer ID and Company ID are required.",
    );
  }

  const snapshot = await admin
    .firestore()
    .collection("users")
    .where("dealerId", "==", dealerId)
    .where("companyId", "==", companyId)
    .limit(1)
    .get();

  return {
    exists: !snapshot.empty,
  };
});

exports.bootstrapAdmin = onCall(async (request) => {
  requireAuth(request);

  const allowedEmails = ["777mlvl@gmail.com", "iattv7@gmail.com"];

  const callerEmail = request.auth.token.email || "";

  if (!allowedEmails.includes(callerEmail)) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }

  await setClaims(request.auth.uid, {
    role: "platform-admin",
    active: true,
  });

  await admin.firestore().doc(`users/${request.auth.uid}`).set(
    {
      role: "platform-admin",
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
  };
});

exports.approveUser = onCall(async (request) => {
  requireAuth(request);
  requireActive(request);

  requireRole(request, ["platform-admin", "admin", "manager"]);

  const { uid, role } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid required.");
  }

  if (!ALLOWED_ROLES.includes(role) || role === "pending") {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }

  if (callerRole(request) === "manager" && role === "admin") {
    throw new HttpsError("permission-denied", "Managers cannot assign admin.");
  }

  await setClaims(uid, {
    role,
    active: true,
  });

  await admin.firestore().doc(`users/${uid}`).set(
    {
      role,
      active: true,

      approvedAt: admin.firestore.FieldValue.serverTimestamp(),

      approvedBy: request.auth.uid,

      inactiveAt: null,
      inactiveBy: "",

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
  };
});

exports.setUserRole = onCall(async (request) => {
  requireAuth(request);
  requireActive(request);

  requireRole(request, ["platform-admin", "admin"]);

  const { uid, role } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid required.");
  }

  if (!ALLOWED_ROLES.includes(role) || role === "pending") {
    throw new HttpsError("invalid-argument", "Invalid role.");
  }

  if (uid === request.auth.uid) {
    throw new HttpsError("permission-denied", "Admin cannot change own role.");
  }

  const { claims } = await getUserClaims(uid);

  const currentRole = claims.role || "pending";

  const currentActive = claims.active !== false;

  if (currentRole === "admin" && role !== "admin") {
    const adminCount = await countActiveAdmins();

    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot remove the last admin.",
      );
    }
  }

  await setClaims(uid, {
    role,
    active: currentActive,
  });

  await admin.firestore().doc(`users/${uid}`).set(
    {
      role,

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
  };
});

exports.setUserActive = onCall(async (request) => {
  requireAuth(request);
  requireActive(request);

  requireRole(request, ["platform-admin", "admin"]);

  const { uid, active } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid required.");
  }

  if (typeof active !== "boolean") {
    throw new HttpsError("invalid-argument", "active must be boolean.");
  }

  if (uid === request.auth.uid) {
    throw new HttpsError("permission-denied", "Admin cannot deactivate self.");
  }

  const { claims } = await getUserClaims(uid);

  const role = claims.role || "pending";

  if (role === "admin" && active === false) {
    const adminCount = await countActiveAdmins();

    if (adminCount <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "Cannot deactivate the last admin.",
      );
    }
  }

  await setClaims(uid, {
    role,
    active,
  });

  await admin
    .firestore()
    .doc(`users/${uid}`)
    .set(
      {
        active,

        inactiveAt: active
          ? null
          : admin.firestore.FieldValue.serverTimestamp(),

        inactiveBy: active ? "" : request.auth.uid,

        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return {
    ok: true,
  };
});

exports.setUserAssignedModules = onCall(async (request) => {
  requireAuth(request);
  requireActive(request);

  requireRole(request, ["platform-admin", "admin"]);

  const { uid, assignedModules } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid required.");
  }

  if (!Array.isArray(assignedModules)) {
    throw new HttpsError(
      "invalid-argument",
      "assignedModules must be an array.",
    );
  }

  await admin.firestore().doc(`users/${uid}`).set(
    {
      assignedModules,

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
  };
});

exports.assignDealerAdmin = onCall(async (request) => {
  requireAuth(request);
  requireActive(request);

  requireRole(request, ["platform-admin"]);

  const { uid, dealerId, assignedModules } = request.data || {};

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid required.");
  }

  if (!dealerId || typeof dealerId !== "string") {
    throw new HttpsError("invalid-argument", "dealerId required.");
  }

  const safeAssignedModules = Array.isArray(assignedModules)
    ? assignedModules
    : [];

  await setClaims(uid, {
    role: "admin",
    active: true,
  });

  await admin.firestore().doc(`users/${uid}`).set(
    {
      dealerId,
      role: "admin",
      active: true,
      assignedModules: safeAssignedModules,

      approvedAt: admin.firestore.FieldValue.serverTimestamp(),

      approvedBy: request.auth.uid,

      inactiveAt: null,
      inactiveBy: "",

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
  };
});

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

      const rawText =
        detections[0] && detections[0].description
          ? detections[0].description
          : "";

      return res.json({
        success: true,
        rawText,
      });
    } catch (error) {
      console.error("scanRO failed:", error);

      return res.status(500).json({
        error: "OCR failed",
      });
    }
  });
});

exports.releaseStaleNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "America/New_York",
  },
  async () => {
    const now = Date.now();

    const staleCutoff = now - 5 * 60 * 1000;

    const snapshot = await admin
      .firestore()
      .collection("notificationRequests")
      .where("status", "==", "active")
      .get();

    const updates = [];

    snapshot.forEach((docSnap) => {
      const notification = docSnap.data();

      if (!notification.openedBy || !notification.openedAtMs) {
        return;
      }

      if (notification.openedAtMs > staleCutoff) {
        return;
      }

      updates.push(
        docSnap.ref.update({
          openedBy: "",
          openedByName: "",
          openedAtMs: null,

          updatedAt: admin.firestore.FieldValue.serverTimestamp(),

          updatedAtMs: now,
        }),
      );
    });

    await Promise.all(updates);

    console.log(`Released ${updates.length} stale notifications.`);
  },
);
