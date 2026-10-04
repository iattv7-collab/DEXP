// public/js/modules/loaners/loaner-subtabs.js

import { canAccessModule } from "/js/core/session.js";

export function showLoanerFilesTab() {
  const tab = document.getElementById("loanerFilesTab");

  if (!tab) return;

  if (canAccessModule("loaner-files")) {
    tab.style.display = "";
  }
}