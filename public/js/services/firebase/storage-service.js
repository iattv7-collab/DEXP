// public/js/services/firebase/storage-service.js

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

import { app } from "./firebase-app.js";

export const storage = getStorage(app);

export async function uploadFile(path, file) {
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);

  return getDownloadURL(storageRef);
}