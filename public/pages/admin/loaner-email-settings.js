// C:\Users\marlo\Projects\DEXP\public\pages\admin\loaner-email-settings.js

import { renderAppHeader } from "/js/shared/app-header.js";
import { protectRoute } from "/js/core/router.js";
import { getSession } from "/js/core/session.js";
import { db } from "/js/services/firebase/firestore.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

protectRoute();

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  renderAppHeader({ title: "Loaner Return Email" });

  const session = getSession();
  if (!session?.dealerId) return;

  const settingsRef = doc(db, "dealers", session.dealerId);

  const snap = await getDoc(settingsRef);
  const data = snap.data() || {};

  $("emailEnabled").checked = Boolean(data.loanerReturnEmailEnabled);
  $("emailLoanerAdmin").value = data.loanerReturnEmailLoanerAdmin || "";
  $("emailWarrantyAdmin").value = data.loanerReturnEmailWarrantyAdmin || "";
  $("emailShopManager").value = data.loanerReturnEmailShopManager || "";

  $("saveBtn").addEventListener("click", async () => {
    const enabled = $("emailEnabled").checked;
    const loanerAdmin = $("emailLoanerAdmin").value.trim();
    const warrantyAdmin = $("emailWarrantyAdmin").value.trim();
    const shopManager = $("emailShopManager").value.trim();

    await setDoc(
      settingsRef,
      {
        loanerReturnEmailEnabled: enabled,
        loanerReturnEmailLoanerAdmin: loanerAdmin,
        loanerReturnEmailWarrantyAdmin: warrantyAdmin,
        loanerReturnEmailShopManager: shopManager,
      },
      { merge: true },
    );

    $("msg").textContent = "Saved.";
  });
});