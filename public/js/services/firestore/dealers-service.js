// public/js/services/firestore/dealers-service.js

import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";

export async function getDealer(dealerId) {
  if (!dealerId) {
    return null;
  }

  const dealerRef = doc(db, "dealers", dealerId);
  const snapshot = await getDoc(dealerRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}

export async function getAllDealers() {
  const snapshot = await getDocs(collection(db, "dealers"));

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

export async function createDealerWithPrimaryAdmin({
  dealerId,
  name,
  displayShortName,
  adminName,
  adminEmail,
  adminPhone,
}) {
  if (!dealerId || !name || !adminName || !adminEmail) {
    throw new Error("Dealer and primary admin information are required.");
  }

  const dealerRef = doc(db, "dealers", dealerId);
  const dealerSnapshot = await getDoc(dealerRef);

  if (dealerSnapshot.exists()) {
    throw new Error("Dealer already exists.");
  }

  const normalizedEmail = adminEmail.trim().toLowerCase();
  const inviteRef = doc(db, "dealerAdminInvites", normalizedEmail);
  const inviteSnapshot = await getDoc(inviteRef);

  if (inviteSnapshot.exists()) {
    throw new Error("An admin invite already exists for this email.");
  }

  const generatedCode = await generateDealerSystemCode();

  const newDealer = buildNewDealer({
    dealerId,
    name,
    displayShortName,
    systemCode: generatedCode,
  });

  await setDoc(dealerRef, newDealer);

  await setDoc(inviteRef, {
    email: normalizedEmail,
    displayName: adminName,
    phone: adminPhone || "",
    dealerId,
    role: "admin",
    active: true,
    status: "pending-login",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newDealer;
}

export async function updateDealerProfile(dealerId, dealerData) {
  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const dealerRef = doc(db, "dealers", dealerId);

  await setDoc(
    dealerRef,
    {
      ...dealerData,
      id: dealerId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateDealerSettings(dealerId, settingsPatch) {
  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const dealerRef = doc(db, "dealers", dealerId);

  await setDoc(
    dealerRef,
    {
      settings: settingsPatch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateDealerPermissionOverrides(dealerId, roleOverrides) {
  if (!dealerId) {
    throw new Error("Missing dealerId");
  }

  const dealerRef = doc(db, "dealers", dealerId);

  await setDoc(
    dealerRef,
    {
      settings: {
        permissions: {
          roleOverrides,
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateDealerRolePermissionOverride({
  dealerId,
  role,
  allow,
  deny,
}) {
  if (!dealerId || !role) {
    throw new Error("Missing dealerId or role");
  }

  const dealerRef = doc(db, "dealers", dealerId);

  await setDoc(
    dealerRef,
    {
      settings: {
        permissions: {
          roleOverrides: {
            [role]: {
              allow: Array.isArray(allow) ? allow : [],
              deny: Array.isArray(deny) ? deny : [],
            },
          },
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function generateDealerSystemCode() {
  const counterRef = doc(db, "system", "dealerCounters");

  const nextNumber = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(counterRef);

    const currentNumber = snapshot.exists()
      ? snapshot.data().nextDealerNumber || 0
      : 0;

    const newNumber = currentNumber + 1;

    transaction.set(
      counterRef,
      {
        nextDealerNumber: newNumber,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return newNumber;
  });

  return `DX${String(nextNumber).padStart(4, "0")}`;
}

function buildNewDealer({ dealerId, name, displayShortName, systemCode }) {
  return {
    id: dealerId,
    systemCode,
    name,
    displayShortName: displayShortName || "",
    active: true,
    phone: "",
    website: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    timezone: "America/New_York",
    logoUrl: "",
    departments: [],
    settings: {
      wash: {},
      loaners: {},
      notifications: {},
      scanner: {},
      branding: {},
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}