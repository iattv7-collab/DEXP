// public/pages/move-locate/move-locate-helpers.js
// Shared helper functions for the Move & Locate module.
// These functions contain no Firestore or workflow logic.

export function normalizeTag(value = "") {
  return String(value).trim().toUpperCase();
}

export function formatAreaLabel(area) {
  return String(area || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAreaLot(area, lot) {
  return [area, lot].filter(Boolean).join(" / ");
}

export function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}