# DEXP Master Collections

## Core Rule

Every module may have its own logic, but all modules must connect to shared master collections.

---

# Master Collections

## 1. ros

Main RO source of truth.

Contains:
- RO data
- customer data
- vehicle data
- advisor data
- wash state
- movement state
- follow-up state
- loaner references

---

## 2. notificationRequests

Master notification request pipeline.

Every module writes notification requests here.

Examples:
- wash ready
- customer pickup
- move request
- follow-up due
- loaner return
- QC completed

---

## 3. users

System users.

Contains:
- role
- dealerId
- permissions
- notification settings
- device registrations

---

## 4. dealers

Dealer configuration.

Contains:
- dealer name
- departments
- locations
- settings
- feature flags
- enabled modules

---

## 5. locations

Master location catalog.

Examples:
- Main Lot
- Annex
- Shop
- Wash Queue
- Front Drive

---

## 6. auditLogs

System-wide audit history.

Tracks:
- who changed what
- when
- from which module

---

## 7. moduleRegistry

Controls installed/active modules.

Examples:
- ro-tracker
- wash
- requests
- move-locate
- loaners
- qc
- shop