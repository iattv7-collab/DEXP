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
let peopleList = [];
let peopleLoaded = false;

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

  const qIn = query(
    collection(db, "messages"),
    where("dealerId", "==", session.dealerId),
    where("toUid", "==", session.uid)
  );

  const qOut = query(
    collection(db, "messages"),
    where("dealerId", "==", session.dealerId),
    where("fromUid", "==", session.uid)
  );

  let incoming = [];
  let outgoing = [];

  function mergeAndRender() {
    messages = [...incoming, ...outgoing];
    messages.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    render();
    if (onCountChange) {
      const unviewed = incoming.filter((m) => !m.viewed).length;
      onCountChange(unviewed);
    }
  }

  onSnapshot(qIn, (snap) => {
    incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mergeAndRender();
  });

  onSnapshot(qOut, (snap) => {
    outgoing = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mergeAndRender();
  });
}

export function setMessageCountListener(fn) {
  onCountChange = fn;
}

export function openMessageFloat() {
  minimized = false;
  currentThreadUid = null;
  if (box) {
    box.style.display = "block";
    if (!peopleLoaded) {
      loadPeople();
    } else {
      render();
    }
  }
}

async function loadPeople() {
  try {
    const { getAllUsers } = await import("/js/services/firestore/users-service.js");
    const users = await getAllUsers();
    const session = getSession();
    peopleList = users
      .filter((u) => u.active !== false && u.uid !== session.uid)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    peopleLoaded = true;
  } catch (err) {
    console.error(err);
  }
  render();
}

function render() {
  if (!box) return;
  const count = messages.length;

  if (minimized) {
    const unviewed = messages.filter((m) => m.toUid === getSession()?.uid && !m.viewed).length;
    if (unviewed === 0) {
      box.style.display = "none";
      return;
    }
    box.innerHTML = `
      <div id="msgFloatMin" style="padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
        <span>Messages</span>
        <span style="background:#c00;color:#fff;border-radius:12px;padding:2px 8px;font-size:12px;">${unviewed}</span>
      </div>
    `;
    document.getElementById("msgFloatMin").onclick = () => {
      minimized = false;
      render();
    };
    return;
  }

  const session = getSession();
  const byPerson = {};
  messages.forEach((m) => {
    const otherUid = m.fromUid === session.uid ? m.toUid : m.fromUid;
    const otherName = m.fromUid === session.uid ? m.toName : m.fromName;
    if (!otherUid) return;
    if (!byPerson[otherUid]) {
      byPerson[otherUid] = { uid: otherUid, name: otherName || "Someone", msgs: [] };
    }
    byPerson[otherUid].msgs.push(m);
  });

  if (!currentThreadUid) {
    const searchVal = (document.getElementById("msgFloatSearch")?.value || "").toLowerCase();
    const filtered = peopleList
      .filter((u) => {
        const name = (u.displayName || u.email || "").toLowerCase();
        return name.includes(searchVal);
      })
      .sort((a, b) => {
        const aUnread = (byPerson[a.uid]?.msgs || []).filter((m) => !m.viewed).length;
        const bUnread = (byPerson[b.uid]?.msgs || []).filter((m) => !m.viewed).length;
        return bUnread - aUnread;
      });

    const list = filtered
      .map((u) => {
        const unread = (byPerson[u.uid]?.msgs || []).filter((m) => !m.viewed).length;
        return `
        <div data-open="${u.uid}" style="padding:10px 12px;border-top:1px solid #eee;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:600;">${escapeHtml(u.displayName || u.email || "")}${u.companyId ? ` (${escapeHtml(u.companyId)})` : ""}</div>
            ${unread ? `<div style="font-size:12px;color:#666;">${unread} new</div>` : ""}
          </div>
          ${unread ? `<span style="background:#c00;color:#fff;border-radius:10px;padding:1px 6px;font-size:11px;">${unread}</span>` : ""}
        </div>`;
      })
      .join("");

    box.innerHTML = `
      <div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;">
        <strong>Messages</strong>
        <button id="msgFloatMinBtn" type="button" style="border:1px solid #1E40AF;background:#1E40AF;color:#fff;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;">−</button>
      </div>
      <div style="padding:8px 12px;border-bottom:1px solid #eee;">
        <input id="msgFloatSearch" type="text" placeholder="Search people…" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #ccc;border-radius:6px;" />
      </div>
      <div style="max-height:320px;overflow:auto;">${list || '<div style="padding:12px;color:#666;">No people</div>'}</div>
    `;

    document.getElementById("msgFloatMinBtn").onclick = () => {
      minimized = true;
      render();
    };
    const searchInput = document.getElementById("msgFloatSearch");
    searchInput.value = searchVal;
    searchInput.focus();
    searchInput.setSelectionRange(searchVal.length, searchVal.length);
    searchInput.oninput = () => render();
    box.querySelectorAll("[data-open]").forEach((row) => {
      row.onclick = async () => {
        currentThreadUid = row.dataset.open;
        const unread = byPerson[currentThreadUid]?.msgs || [];
        for (const m of unread) {
          try {
            await updateDoc(doc(db, "messages", m.id), { viewed: true });
          } catch (err) {
            console.error(err);
          }
        }
        render();
      };
    });
    return;
  }

  const person = peopleList.find((u) => u.uid === currentThreadUid) || byPerson[currentThreadUid];
  if (!person) {
    currentThreadUid = null;
    render();
    return;
  }

  const threadMsgs = byPerson[currentThreadUid]?.msgs || [];
  const thread = threadMsgs
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

  const displayName = person.displayName || person.name || person.email || "Someone";

  box.innerHTML = `
    <div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;gap:8px;">
      <button id="msgFloatBack" type="button" style="border:1px solid #1E40AF;background:#1E40AF;color:#fff;cursor:pointer;font-size:13px;padding:4px 8px;border-radius:4px;">← Back</button>
      <strong style="flex:1;text-align:center;">${escapeHtml(displayName)}</strong>
      <button id="msgFloatMinBtn" type="button" style="border:1px solid #1E40AF;background:#1E40AF;color:#fff;cursor:pointer;font-size:16px;padding:2px 8px;border-radius:4px;">−</button>
    </div>
    <div style="max-height:280px;overflow:auto;">${thread || '<div style="padding:12px;color:#666;">No messages yet</div>'}</div>
    <div style="padding:10px 12px;border-top:1px solid #eee;">
      <textarea id="msgFloatReply" placeholder="Message…" style="width:100%;box-sizing:border-box;min-height:50px;padding:6px;border:1px solid #ccc;border-radius:6px;"></textarea>
      <div style="margin-top:6px;text-align:right;">
        <button id="msgFloatSend" type="button" style="background:#1E40AF;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;">Send</button>
      </div>
    </div>
  `;

  const threadEl = box.querySelector("div[style*='max-height']");
  if (threadEl) threadEl.scrollTop = threadEl.scrollHeight;

  document.getElementById("msgFloatBack").onclick = () => {
    currentThreadUid = null;
    render();
  };
  document.getElementById("msgFloatMinBtn").onclick = () => {
    minimized = true;
    render();
  };
  document.getElementById("msgFloatSend").onclick = async () => {
    const text = document.getElementById("msgFloatReply").value.trim();
    if (!text) return;
    const session = getSession();
    const messageRef = doc(collection(db, "messages"));
    const toName = displayName;
    try {
      await setDoc(messageRef, {
        id: messageRef.id,
        dealerId: session.dealerId,
        fromUid: session.uid,
        fromName: session.displayName || session.email || "",
        toUid: currentThreadUid,
        toName,
        text,
        tag: "",
        roId: "",
        roNumber: "",
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        resolved: false,
      });
      await createNotificationRequest({
        targetType: NOTIFICATION_TARGET_TYPE.USER,
        targetUserId: currentThreadUid,
        module: "message",
        eventType: "internal_message",
        title: `Message from ${session.displayName || session.email || "someone"}`,
        message: text,
        data: { messageId: messageRef.id },
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