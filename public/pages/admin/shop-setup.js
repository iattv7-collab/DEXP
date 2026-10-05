import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { getSession } from "/js/core/session.js";
import { getAdminUserGroups } from "/js/services/firestore/users-service.js";
import { db } from "/js/services/firebase/firestore.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let session = null;
let users = [];
let advisors = [];
let shopSettings = defaultShopSettings();
let savedShopSettings = defaultShopSettings();

document.addEventListener("DOMContentLoaded", async () => {
    protectRoute({ allowedModules: ["admin"] });
    renderAppHeader();
    session = await waitForSession();
    const active = (await getAdminUserGroups()).activeUsers.filter(
        (user) => user.dealerId === session.dealerId,
    );
    advisors = active.filter((user) => user.role === "advisor");
    users = active.filter(isShopPerson);
    await loadShopSettings();
    bindSetup();
    renderSetup();
});

function defaultShopSettings() {
    return {
        useServiceManager: true,
        useShopForeman: false,
        useTeamLeader: false,
        shops: [],
        teams: [],
        people: [],
    };
}

async function loadShopSettings() {
    const snapshot = await getDoc(doc(db, "dealers", session.dealerId));
    const saved = snapshot.exists() ? snapshot.data()?.settings?.shop : null;
    shopSettings = { ...defaultShopSettings(), ...(saved || {}) };
    savedShopSettings = JSON.parse(JSON.stringify(shopSettings));
}

function bindSetup() {
    const managerBox = document.getElementById("useServiceManager");
    const foremanBox = document.getElementById("useShopForeman");
    const teamBox = document.getElementById("useTeamLeader");
    managerBox.checked = shopSettings.useServiceManager !== false;
    foremanBox.checked = shopSettings.useShopForeman === true;
    teamBox.checked = shopSettings.useTeamLeader === true;
    showTeamRow(teamBox.checked);
    [managerBox, foremanBox, teamBox].forEach((box) => {
        box.addEventListener("change", () => {
            shopSettings.useServiceManager = managerBox.checked;
            shopSettings.useShopForeman = foremanBox.checked;
            shopSettings.useTeamLeader = teamBox.checked;
            showTeamRow(teamBox.checked);
            markDirty();
        });
    });
    document.getElementById("addShopBtn").addEventListener("click", () => {
        const name = document.getElementById("shopNameInput").value.trim();
        if (!name) return;
        shopSettings.shops.push({ id: slug(name), name });
        document.getElementById("shopNameInput").value = "";
        renderSetup();
        markDirty();
    });
    document.getElementById("addTeamBtn").addEventListener("click", () => {
        const name = document.getElementById("teamNameInput").value.trim();
        const shopId = document.getElementById("teamShopSelect").value;
        if (!name || !shopId) return;
        shopSettings.teams.push({ id: slug(name), name, shopId });
        document.getElementById("teamNameInput").value = "";
        renderSetup();
        markDirty();
    });
    document.getElementById("saveShopSetupBtn").addEventListener("click", saveShopSetup);
    document.getElementById("saveAdvisorsBtn")?.addEventListener("click", saveAdvisors);
}

function showTeamRow(on) {
    document.getElementById("teamRow").style.display = on ? "" : "none";
    document.getElementById("teamList").style.display = on ? "" : "none";
}

function renderSetup() {
    document.getElementById("shopList").innerHTML = shopSettings.shops.length
        ? shopSettings.shops.map((shop) => `<tr><td>${escapeHtml(shop.name)}</td></tr>`).join("")
        : `<tr><td>No shops yet.</td></tr>`;
    document.getElementById("teamList").innerHTML = shopSettings.teams.length
        ? shopSettings.teams.map((team) => {
            const members = (shopSettings.people || []).filter((person) => person.teamId === team.id);
            const leader = members.find((person) => person.shopLevel === "team_leader");
            const techs = members.filter((person) => person.shopLevel === "tech");
            const rows = techs.map((person) =>
                `<div>${escapeHtml(userName(person.uid))} · ${escapeHtml(companyId(person.uid) || "No company id")}</div>`
            ).join("") || "No techs";
            return `<tr>
          <td>${escapeHtml(team.name)}</td>
          <td>${escapeHtml(userName(leader?.uid) || "No leader")}${leader ? ` · ${escapeHtml(companyId(leader.uid) || "No company id")}` : ""}</td>
          <td>${techs.length}</td>
          <td>
            <details>
              <summary>Techs (${techs.length})</summary>
              ${rows}
            </details>
          </td>
        </tr>`;
        }).join("")
        : `<tr><td colspan="4">No teams yet.</td></tr>`;
    document.getElementById("teamShopSelect").innerHTML = shopSettings.shops
        .map((shop) => `<option value="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</option>`)
        .join("");
    const advisorList = document.getElementById("advisorList");
    if (advisorList) {
        advisorList.innerHTML = advisors.length
            ? advisors.map((user) => {
                const id = user.uid || user.id;
                const shops = [`<option value="">No shop</option>`]
                    .concat(shopSettings.shops.map((shop) => `<option value="${escapeHtml(shop.id)}" ${user.shopId === shop.id ? "selected" : ""}>${escapeHtml(shop.name)}</option>`))
                    .join("");
                return `<tr data-advisor-uid="${escapeHtml(id)}">
                  <td>${escapeHtml(user.displayName || user.email || id)}</td>
                  <td><select data-field="advisorShopId">${shops}</select></td>
                </tr>`;
            }).join("")
            : `<tr><td colspan="2">No advisors.</td></tr>`;
        advisorList.querySelectorAll("select").forEach((select) => {
            select.addEventListener("change", markDirty);
        });
    }
    document.getElementById("peopleList").innerHTML = users
        .map((user) => {
            const id = user.uid || user.id;
            const person = (shopSettings.people || []).find((item) => item.uid === id) || {};
            const level = person.shopLevel || "";
            const shops = [`<option value="">All shops</option>`]
                .concat(shopSettings.shops.map((shop) => `<option value="${escapeHtml(shop.id)}" ${person.shopId === shop.id ? "selected" : ""}>${escapeHtml(shop.name)}</option>`))
                .join("");
            const teams = [`<option value="">No team</option>`]
                .concat(shopSettings.teams.map((team) => `<option value="${escapeHtml(team.id)}" ${person.teamId === team.id ? "selected" : ""}>${escapeHtml(team.name)}</option>`))
                .join("");
            return `<tr data-uid="${escapeHtml(id)}">
        <td>${escapeHtml(user.displayName || user.email || id)}</td>
        <td>${escapeHtml(user.role || "")}</td>
        <td>
          <select data-field="shopLevel">
            <option value="" ${level === "" ? "selected" : ""}>No shop seat</option>
            <option value="tech" ${level === "tech" ? "selected" : ""}>Tech</option>
            <option value="team_leader" ${level === "team_leader" ? "selected" : ""}>Team leader</option>
            <option value="foreman" ${level === "foreman" ? "selected" : ""}>Shop foreman</option>
            <option value="manager" ${level === "manager" ? "selected" : ""}>Service manager</option>
          </select>
        </td>
        <td><select data-field="shopId">${shops}</select></td>
        <td><select data-field="teamId">${teams}</select></td>
      </tr>`;
        })
        .join("");
    document.querySelectorAll("#peopleList select").forEach((select) => {
        select.addEventListener("change", () => {
            readPeople();
            markDirty();
        });
    });
}

function readPeople() {
    shopSettings.people = [...document.querySelectorAll("#peopleList [data-uid]")].map((row) => ({
        uid: row.dataset.uid,
        shopLevel: row.querySelector("[data-field='shopLevel']").value,
        shopId: row.querySelector("[data-field='shopId']").value,
        teamId: row.querySelector("[data-field='teamId']").value,
    }));
}

function markDirty() {
    document.getElementById("saveShopSetupBtn").disabled =
        JSON.stringify(shopSettings) === JSON.stringify(savedShopSettings);
}

async function saveShopSetup() {
    readPeople();
    await setDoc(doc(db, "dealers", session.dealerId), {
        settings: { shop: shopSettings },
        updatedAt: serverTimestamp(),
    }, { merge: true });
    for (const person of shopSettings.people) {
        await updateDoc(doc(db, "users", person.uid), {
            shopLevel: person.shopLevel || "",
            shopId: person.shopId || "",
            teamId: person.teamId || "",
            updatedAt: serverTimestamp(),
        });
    }
    for (const row of document.querySelectorAll("#advisorList [data-advisor-uid]")) {
        const shopId = row.querySelector("[data-field='advisorShopId']").value;
        await updateDoc(doc(db, "users", row.dataset.advisorUid), {
            shopId,
            updatedAt: serverTimestamp(),
        });
        const advisor = advisors.find((item) => (item.uid || item.id) === row.dataset.advisorUid);
        if (advisor) advisor.shopId = shopId;
    }
    savedShopSettings = JSON.parse(JSON.stringify(shopSettings));
    markDirty();
    document.getElementById("msg").textContent = "Shop setup saved.";
}

async function saveAdvisors() {
    const button = document.getElementById("saveAdvisorsBtn");
    if (button) button.disabled = true;
    for (const row of document.querySelectorAll("#advisorList [data-advisor-uid]")) {
        const shopId = row.querySelector("[data-field='advisorShopId']").value;
        await updateDoc(doc(db, "users", row.dataset.advisorUid), {
            shopId,
            updatedAt: serverTimestamp(),
        });
        const advisor = advisors.find((item) => (item.uid || item.id) === row.dataset.advisorUid);
        if (advisor) advisor.shopId = shopId;
    }
    if (button) button.disabled = false;
    document.getElementById("msg").textContent = "Advisors saved.";
}

function slug(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || String(Date.now());
}

function userName(uid) {
    const user = users.find((item) => (item.uid || item.id) === uid);
    return user?.displayName || user?.email || "";
}

function companyId(uid) {
    const user = users.find((item) => (item.uid || item.id) === uid);
    return user?.companyId || "";
}

function isShopPerson(user) {
    const role = String(user.role || "");
    const seat = String(user.shopLevel || "");
    return ["tech", "foreman", "manager", "admin"].includes(role)
        || ["tech", "team_leader", "foreman", "manager"].includes(seat);
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[char]);
}

function waitForSession() {
    return new Promise((resolve) => {
        const existing = getSession();
        if (existing?.dealerId) {
            resolve(existing);
            return;
        }
        window.addEventListener("dexp-session-ready", () => resolve(getSession()), { once: true });
    });
}