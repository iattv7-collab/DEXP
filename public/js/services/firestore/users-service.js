// public/js/services/firestore/users-service.js

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "../firebase/firestore.js";
import { DEFAULT_ROLE } from "../../config/roles.js";

export async function ensureUserProfile(user) {
    const userRef = doc(db, "users", user.uid);

    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
        return snapshot.data();
    }

    const newProfile = {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        role: DEFAULT_ROLE,
        dealerId: "default-dealer",
        active: true,
        createdAt: serverTimestamp()
    };

    await setDoc(userRef, newProfile);

    return newProfile;
}