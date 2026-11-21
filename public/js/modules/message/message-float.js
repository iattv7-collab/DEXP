// public/js/modules/message/message-float.js

import { getSession } from "/js/core/session.js";
import { createNotificationRequest, NOTIFICATION_TARGET_TYPE } from "/js/services/firestore/notification-requests-service.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "/js/services/firebase/firestore.js";

let unsubscribe = null;
let box = null;
let minimized = false;
let messages = [];
let currentThreadUid = null;
let onCountChange = null;

export function initMessageFloat() {
  const session = getSession();
  if (!session?.uid || !session?.dealerId) return;
  if (document.getElementById("messageFloat")) return;

  box = document.createElement("div");
  box.id = "messageFloat";
  box.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 10000;
    width: 340px;
    max-width: 92vw;
    background: #fff;
    border: 1px solid #cfd6df;
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(0,0,0,.18);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
  `;
  document.body.appendChild(box);

  const q = query(
    collection(db, "messages"),
    where("dealerId", "==", session.dealerId),
    where("toUid", "==", session.uid),
    where("resolved", "==", false)
  );

  unsubscribe = onSnapshot(q, (snap) => {
    messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    messages.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    render();
    if (onCountChange) onCountChange(messages.length);
  });
}

export function setMessageCountListener(fn) {
  onCountChange = fn;
}

export function openMessageFloat() {
  minimized = false;
  currentThreadUid = null;
  if (box) {
    box.style.display = messages.length ? "block" : "none";
    render();
  }
}



function render() {
  if (!box) return;
  const count = messages.length;

  if (count === 0) {
    box.style.display = "none";
    currentThreadUid = null;
    return;
  }
  box.style.display = "block";

  if (minimized) {
    box.innerHTML = `
      <div id="msgFloatMin" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
        <span>Messages</span>
        <span style="background:#1E40AF;color:#fff;border-radius:12px;padding:2px 8px;font-size:12px;">${count}</span>
      </div>
    `;
    document.getElementById("msgFloatMin").onclick = () => {
      minimized = false;
      render();
    };
    return;
  }

  const byPerson = {};
  messages.forEach((m) => {
    const otherUid = m.fromUid;
    const otherName = m.fromName || "Someone";
    if (!byPerson[otherUid]) {
      byPerson[otherUid] = { uid: otherUid, name: otherName, msgs: [] };
    }
    byPerson[otherUid].msgs.push(m);
  });
  const people = Object.values(byPerson);

  if (!currentThreadUid) {
    const list = people
      .map(
        (p) => `
        <div data-open="${p.uid}" style="padding:10px 12px;border-top:1px solid #eee;cursor:pointer;">
          <div style="font-weight:600;">${escapeHtml(p.name)}</div>
          <div style="font-size:12px;color:#666;">${p.msgs.length} message${p.msgs.length === 1 ? "" : "s"}</div>
        </div>`
      )
      .join("");

    box.innerHTML = `
      <div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;">
        <strong>Messages (${count})</strong>
        <button id="msgFloatMinBtn" type="button" style="border:1px solid #ccc;background:#fff;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;color:#333;">_</button>
      </div>
      <div style="max-height:320px;overflow:auto;">${list}</div>
    `;

    document.getElementById("msgFloatMinBtn").onclick = () => {
      minimized = true;
      render();
    };
    box.querySelectorAll("[data-open]").forEach((row) => {
      row.onclick = () => {
        currentThreadUid = row.dataset.open;
        render();
      };
    });
    return;
  }

  const person = people.find((p) => p.uid === currentThreadUid);
  if (!person) {
    currentThreadUid = null;
    render();
    return;
  }

  const thread = person.msgs
    .slice()
    .reverse()
    .map(
      (m) => `
      <div style="border-top:1px solid #eee;padding:8px 12px;">
        <div style="font-size:12px;color:#666;margin-bottom:2px;">${escapeHtml(m.fromName || "")}${m.tag ? ` · tag ${m.tag}` : ""}</div>
        <div>${escapeHtml(m.text || "")}</div>
      </div>`
    )
    .join("");

  box.innerHTML = `
    <div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;gap:8px;">
      <button id="msgFloatBack" type="button" style="border:1px solid #999;background:#f5f5f5;cursor:pointer;font-size:14px;padding:4px 8px;border-radius:4px;">←</button>
      <strong style="flex:1;text-align:center;">${escapeHtml(person.name)}</strong>
      <button id="msgFloatMinBtn" type="button" style="border:1px solid #ccc;background:#fff;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;color:#333;">_</button>
    </div>
    <div style="max-height:280px;overflow:auto;">${thread}</div>
    <div style="padding:10px 12px;border-top:1px solid #eee;">
      <textarea id="msgFloatReply" placeholder="Reply…" style="width:100%;box-sizing:border-box;min-height:50px;padding:6px;border:1px solid #ccc;border-radius:6px;"></textarea>
      <div style="margin-top:6px;display:flex;justify-content:space-between;">
        <button id="msgFloatResolveAll" type="button" style="font-size:12px;padding:4px 8px;">Resolve all</button>
        <button id="msgFloatSend" type="button" style="background:#1E40AF;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  document.getElementById("msgFloatBack").onclick = () => {
    currentThreadUid = null;
    render();
  };
  document.getElementById("msgFloatMinBtn").onclick = () => {
    minimized = true;
    render();
  };
  document.getElementById("msgFloatResolveAll").onclick = async () => {
    for (const m of person.msgs) {
      try {
        await updateDoc(doc(db, "messages", m.id), { resolved: true });
      } catch (err) {
        console.error(err);
      }
    }
    currentThreadUid = null;
  };
  document.getElementById("msgFloatSend").onclick = async () => {
    const text = document.getElementById("msgFloatReply").value.trim();
    if (!text) return;
    const session = getSession();
    const messageRef = doc(collection(db, "messages"));
    const sample = person.msgs[0];
    try {
      await setDoc(messageRef, {
        id: messageRef.id,
        dealerId: session.dealerId,
        fromUid: session.uid,
        fromName: session.displayName || session.email || "",
        toUid: person.uid,
        toName: person.name,
        text,
        tag: sample.tag || "",
        roId: sample.roId || "",
        roNumber: sample.roNumber || "",
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        resolved: false,
      });
      await createNotificationRequest({
        targetType: NOTIFICATION_TARGET_TYPE.USER,
        targetUserId: person.uid,
        module: "message",
        eventType: "internal_message",
        title: `Message from ${session.displayName || session.email || "someone"}`,
        message: text,
        data: { messageId: messageRef.id, tag: sample.tag || "", roId: sample.roId || "" },
      });
      document.getElementById("msgFloatReply").value = "";
    } catch (err) {
      console.error(err);
    }
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}