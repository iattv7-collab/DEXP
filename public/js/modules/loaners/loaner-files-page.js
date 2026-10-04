// public/js/modules/loaners/loaner-files-page.js

import { protectRoute } from "/js/core/router.js";
import { renderAppHeader } from "/js/shared/app-header.js";
import { getSession } from "/js/core/session.js";
import { startLoanerHistory } from "/js/modules/loaners/loaner-history.js?v=3";
import { showLoanerFilesTab } from "/js/modules/loaners/loaner-subtabs.js?v=2";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  protectRoute({
    allowedModules: ["loaner-files"],
  });

  renderAppHeader();
  showLoanerFilesTab();

  const session = getSession();
  startLoanerHistory(
    session?.dealerId || "",
    $("loanerFileSearch"),
    $("loanerFileResults"),
  );
});