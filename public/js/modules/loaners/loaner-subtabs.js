// public/js/modules/loaners/loaner-subtabs.js

import { getSession, hasAssignedModule } from "/js/core/session.js";

export function showLoanerFilesTab() {
  const session = getSession();
  const role = session?.role || "";
  const isAdmin = role === "admin" || role === "platform-admin";

  const tabs = [
    ["loanerFleetTab", "loaner-fleet"],
    ["loanerManageTab", "loaner-fleet"],
    ["loanerFilesTab", "loaner-files"],
    ["loanerReturnsTab", "loaner-returns"],
    ["loanerWashTab", "loaner-wash"],
  ];

  tabs.forEach(([id, moduleKey]) => {
    const tab = document.getElementById(id);

    if (!tab) return;

    tab.style.display =
      isAdmin || hasAssignedModule(moduleKey) ? "" : "none";
  });
}