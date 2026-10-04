// ======================================================
// FILE: /public/js/modules/loaners/loaner-damage-photos.js
// PURPOSE:
// Upload accepted damage photos after Save Return.
// ======================================================

import { app } from "/js/services/firebase/firebase-app.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const storage = getStorage(app);

/**
 * Upload accepted pictures. Returns download URLs.
 * @param {string} dealerId
 * @param {string} vin
 * @param {File[]} files
 * @return {Promise<string[]>}
 */
export async function uploadLoanerDamagePhotos(dealerId, vin, files) {
  const urls = [];

  for (const file of files) {
    const path = `loaner-damage/${dealerId}/${vin}/${Date.now()}-${file.name || "photo.jpg"}`;
    const snap = await uploadBytes(ref(storage, path), file);
    urls.push(await getDownloadURL(snap.ref));
  }

  return urls;
}
