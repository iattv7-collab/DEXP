// public/js/modules/ro-tracker/ro-tracker-render.js

export function buildROTrackerRow(ro = {}, columns = []) {
  const tr = document.createElement("tr");

  columns.forEach((column) => {
    const td = document.createElement("td");

    td.textContent = getCellValue(ro, column.key);

    tr.appendChild(td);
  });

  return tr;
}

function getCellValue(ro, key) {
  switch (key) {
    case "roNumber":
      return ro.roNumber || "";

    case "tagNumber":
      return ro.tagNumber || "";

    case "customerName":
      return ro.customerName || "";

    case "customerPhone":
      return ro.customerPhone || "";

    case "roDate":
      return ro.roDate || "";

    case "promiseTime":
      return ro.promiseTime || "";

    case "model":
      return ro.model || "";

    case "concern":
      return ro.concern || "";

    case "currentLocation":
      return ro.currentLocation || "";

    case "readyCalled":
      return ro.readyCalled ? "✓" : "";

    case "notes":
      return ro.notes || "";

    case "techVideo":
      return ro.techVideo ? "✓" : "";

    case "calledTime":
      return ro.calledTime || "";

    case "nextUpdateTime":
      return ro.nextUpdateTime || "";

    case "isWaiter":
      return ro.isWaiter ? "✓" : "";

    case "loanerVin":
      return ro.loanerVin || "";

    case "techDone":
      return ro.techDone ? "✓" : "";

    case "textSent":
      return ro.textSent ? "Text" : "";

    case "actions":
      return "";

    default:
      return "";
  }
}