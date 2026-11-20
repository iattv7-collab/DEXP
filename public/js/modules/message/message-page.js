// public/js/modules/message/message-page.js

import { getSession } from "/js/core/session.js";
import { getAllUsers } from "/js/services/firestore/users-service.js";
import { findActiveROByTag } from "/js/services/firestore/ros-service.js";
import { createNotificationRequest, NOTIFICATION_TARGET_TYPE } from "/js/services/firestore/notification-requests-service.js";

import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/services/firebase/firestore.js";

const session = getSession();
if (!session) {
  window.close();
}

const toSelect = document.getElementById("toSelect");
const tagInput = document.getElementById("tagInput");
const messageText = document.getElementById("messageText");
const sendBtn = document.getElementById("sendBtn");
const cancelBtn = document.getElementById("cancelBtn");
const statusEl = document.getElementById("status");

cancelBtn.addEventListener("click", () => window.close());

function updateSendState() {
  const hasTo = Boolean(toSelect.value);
  const hasText = messageText.value.trim().length > 0;
  sendBtn.disabled = !(hasTo && hasText);
}

toSelect.addEventListener("change", updateSendState);
messageText.addEventListener("input", updateSendState);

async function loadPeople() {
  try {
    const users = await getAllUsers();
    const active = users.filter(u => u.active !== false && u.uid !== session.uid);
    active.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));

    active.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.uid;
      opt.textContent = `${u.displayName || u.email || "User"} (${u.role || ""})`.trim();
      opt.dataset.name = u.displayName || u.email || "";
      toSelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not load people.";
  }
}

sendBtn.addEventListener("click", async () => {
  const toUid = toSelect.value;
  const toName = toSelect.selectedOptions[0]?.dataset.name || "";
  const text = messageText.value.trim();
  const tag = tagInput.value.trim();

  if (!toUid || !text) return;

  sendBtn.disabled = true;
  statusEl.textContent = "Sending…";

  try {
    let roId = "";
    let roNumber = "";

    if (tag) {
      const ro = await findActiveROByTag(tag);
      if (ro && String(ro.status || "").toLowerCase() !== "archived") {
        roId = ro.id || "";
        roNumber = ro.roNumber || "";
      }
    }

    const messageRef = doc(collection(db, "messages"));
    const nowMs = Date.now();

    await setDoc(messageRef, {
      id: messageRef.id,
      dealerId: session.dealerId,
      fromUid: session.uid,
      fromName: session.displayName || session.email || "",
      toUid,
      toName,
      text,
      tag: tag || "",
      roId,
      roNumber,
      createdAtMs: nowMs,
      createdAt: serverTimestamp(),
      resolved: false,
    });

    await createNotificationRequest({
      targetType: NOTIFICATION_TARGET_TYPE.USER,
      targetUserId: toUid,
      title: `Message from ${session.displayName || session.email || "someone"}`,
      body: text,
      type: "internal_message",
      data: {
        messageId: messageRef.id,
        tag,
        roId,
      },
    });

    statusEl.textContent = "Sent.";
    setTimeout(() => window.close(), 700);
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not send.";
    sendBtn.disabled = false;
  }
});

loadPeople();