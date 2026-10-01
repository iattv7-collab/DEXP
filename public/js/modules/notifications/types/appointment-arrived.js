// public/js/modules/notifications/types/appointment-arrived.js
// Arrived is a heads-up only. Not an RO workflow. No Open.

export const APPOINTMENT_ARRIVED_EVENT = "appointment_arrived";

export function isAppointmentArrivedNotification(notification = {}) {
    return (
        String(notification.eventType || "").trim() === APPOINTMENT_ARRIVED_EVENT
    );
}

export function canOpenAppointmentArrived() {
    return false;
}

export function appointmentIdFromNotification(notification = {}) {
    const notificationId = String(notification.id || "").trim();
    return String(
        notification.relatedAppointmentId ||
        notification.sourceId ||
        notificationId.replace(/^appt-arrived-/, ""),
    ).trim();
}
