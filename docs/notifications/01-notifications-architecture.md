# DEXP Notification Architecture

## Main Rule

Notifications must come from individual modules, but all notification requests must be written into one master source.

## Master Notification Source

Firestore collection:

```text
notificationRequests