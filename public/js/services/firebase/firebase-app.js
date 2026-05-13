// public/js/services/firebase/firebase-app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { firebaseConfig } from "../../config/firebase-config.js";

export const app = initializeApp(firebaseConfig);