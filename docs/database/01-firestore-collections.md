# DEXP Firestore Collections

## Core Collections

### ros

Main RO master source.

Stores:
- RO
- tag
- VIN
- customer
- advisor
- status
- location
- wash state
- loaner state
- timestamps
- workflow states

---

### notificationRequests

Master notification request source.

Created by:
- RO Tracker
- Move & Locate
- Wash
- Requests
- Loaners
- Shop

---

### users

System users.

Stores:
- profile
- role
- dealer access
- notification preferences
- device tokens

---

### dealers

Dealer configuration.

Stores:
- dealership name
- active modules
- branding
- hours
- settings
- notification settings

---

## Module Collections

### valetRequests

Vehicle movement requests.

Examples:
- customer pickup
- bring to shop
- move to wash
- move to detail

---

### washTickets

Wash queue/workflow state.

---

### loaners

Loaner fleet master list.

---

### loanerReturns

Loaner return workflow.

---

### locations

Dealer parking locations and areas.

---

### auditLogs

System history and critical actions.

---

## Important Rule

Collections must stay separated by responsibility.

Avoid:
- giant mixed collections
- giant documents
- unrelated module logic inside one collection

## Dealer Rule

Every major collection must include:

```js
dealerId