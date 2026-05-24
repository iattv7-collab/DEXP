// public/pages/admin/admin-pending-users.js
// Pending user helpers for the DEXP admin page.
// Kept separate for future pending-user workflow improvements.

export function hasPendingUsers(users = []) {
  return Array.isArray(users) && users.length > 0;
}