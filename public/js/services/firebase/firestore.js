// public/js/services/firebase/firestore.js

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { app } from "./firebase-app.js";

export const db = getFirestore(app);