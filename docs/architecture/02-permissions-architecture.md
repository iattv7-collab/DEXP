# DEXP Permissions Architecture

## Core Rule

Permissions must never be hardcoded into UI pages.

All permissions must come from:
- user role
- dealer configuration
- enabled modules

---

# Role Structure

## Global Roles

- admin
- manager
- advisor
- foreman
- tech
- wash
- valet
- qc
- booker
- staff
- pending

---

# Permission Flow

users
→ role
→ permissions layer
→ module access
→ UI rendering

---

# Module Isolation

Each module controls:
- its own actions
- its own notifications
- its own UI

But all modules use:
- shared auth
- shared users
- shared notifications
- shared dealer settings

---

# Security Rule

Frontend permissions are convenience only.

Real protection must happen in:
- Firestore rules
- Cloud Functions
- server validation