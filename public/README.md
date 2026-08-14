# DEXP Public App

Static frontend for **DEXP** (Dealer Execution Platform).

This folder is deployed with Firebase Hosting and contains:

- HTML pages (`/pages`)
- JavaScript modules and services (`/js`)
- CSS and shared UI assets
- App icons, logos, and notification sounds

## Stack

- Vanilla JS (ES modules)
- Firebase Auth, Firestore, Cloud Functions, Hosting
- Multi-dealer architecture via `dealerId`

## Notes

- Do not initialize Firebase inside feature modules — use shared services under `/js/services`
- Access control is enforced by session, roles, modules, and Firestore security rules
- Entry is dealer-scoped (login via dealership link with `dealerId`)