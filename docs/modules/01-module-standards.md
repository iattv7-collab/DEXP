# DEXP Module Standards

## Core Rule

Every module must be self-contained.

A module may:
- read shared master data
- write shared master data
- create notifications
- register routes
- register permissions

A module may NOT:
- directly control another module
- contain duplicated shared logic
- bypass shared services

---

# Standard Module Structure

Example:

public/js/modules/wash/

Required files:

- index.js
- routes.js
- permissions.js
- notifications.js
- ui.js
- actions.js
- firestore.js

---

# Shared Logic

Shared logic belongs in:

public/js/shared/

Examples:
- modals
- navigation
- formatters
- validators
- table rendering
- alerts

---

# Firebase Access

Modules must NOT initialize Firebase directly.

Modules must ONLY use:
- shared firebase services
- shared firestore services
- shared notification pipeline

---

# Notifications

Modules create notification requests.

Modules do NOT directly send notifications.

All notifications must go through:

notificationRequests