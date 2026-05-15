// public/js/shared/data-table.js

export function renderDataTable({
  columns = [],
  rows = [],
  container,
  rowRenderer
}) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML = `
      <tr>
        <td colspan="${columns.length}">
          No records found.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = rows
    .map((row) => rowRenderer(row, columns))
    .join("");
}

export function buildTableHeaders(columns = []) {
  return columns.map((column) => `
    <th style="min-width:${column.width || "120px"}">
      ${column.label}
    </th>
  `).join("");
}

export function formatTableDate(value) {
  if (!value) {
    return "";
  }

  let date = null;

  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    date = new Date(value);
  } else if (typeof value === "string") {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  });
}