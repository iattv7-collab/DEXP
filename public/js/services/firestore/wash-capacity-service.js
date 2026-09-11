// ======================================================
// FILE: /public/js/services/firestore/wash-capacity-service.js
// MODULE: Wash
// PURPOSE:
// One calculator for today's wash seats.
// Need By, Projected, and late warnings must all use this.
// ======================================================

import { getWashSettings } from "/js/services/firestore/wash-settings-service.js";

const NEED_BY_RISK_WINDOW_MS = 45 * 60 * 1000;
const DEFAULT_DURATION_MIN = 15;

export { NEED_BY_RISK_WINDOW_MS };

export function clean(value) {
  return String(value || "").trim();
}

export function isWaiterTicket(ticket) {
  return ticket?.customerWaiting === true || ticket?.isWaiter === true;
}

export function isFutureAtRiskNeedBy(ticket, nowMs = Date.now()) {
  const needBy = needByMs(ticket);

  if (!needBy) return false;

  return needBy > nowMs && needBy <= nowMs + NEED_BY_RISK_WINDOW_MS;
}

export function needByMs(ticket) {
  const value = Number(ticket?.needByAtMs || 0);

  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function minutesPerCar(settings) {
  const duration = Number(settings?.washDurationMin);
  const buffer = Number(settings?.bufferMin) || 0;

  if (Number.isFinite(duration) && duration > 0) {
    return duration + (buffer > 0 ? buffer : 0);
  }

  return DEFAULT_DURATION_MIN + (buffer > 0 ? buffer : 0);
}

export function durationMs(settings) {
  return minutesPerCar(settings) * 60 * 1000;
}

function parseHourMinute(value, fallback) {
  const text = clean(value) || fallback;
  const parts = text.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return fallback;
  }

  return {
    hours,
    minutes,
  };
}

function atTimeOnDay(dayMs, hours, minutes) {
  const date = new Date(dayMs);

  date.setHours(hours, minutes, 0, 0);

  return date.getTime();
}

export function getDayPlan(settings, nowMs = Date.now()) {
  const day = new Date(nowMs).getDay();
  const sunday = day === 0;
  const saturday = day === 6;

  let bays = Number(settings?.mfBays);
  let open = parseHourMinute(settings?.mfOpen, { hours: 7, minutes: 30 });
  let close = parseHourMinute(settings?.mfClose, { hours: 19, minutes: 0 });

  if (saturday) {
    bays = Number(settings?.satBays);
    open = parseHourMinute(settings?.satOpen, { hours: 8, minutes: 0 });
    close = parseHourMinute(settings?.satClose, { hours: 15, minutes: 0 });
  }

  if (sunday) {
    bays = Number(settings?.sunBays);
    open = parseHourMinute(settings?.sunOpen, { hours: 0, minutes: 0 });
    close = parseHourMinute(settings?.sunClose, { hours: 0, minutes: 0 });
  }

  const openMs = atTimeOnDay(nowMs, open.hours, open.minutes);
  const closeMs = atTimeOnDay(nowMs, close.hours, close.minutes);

  const isToday = sameCalendarDay(nowMs, Date.now());
  const hasHours = (Number.isFinite(bays) && bays > 0 ? bays : 0) > 0 && closeMs > openMs;

  return {
    bays: Number.isFinite(bays) && bays > 0 ? bays : 0,
    openMs,
    closeMs,
    isOpenDay: hasHours && (!isToday || Boolean(settings?.isOpen)),
    minutes: minutesPerCar(settings),
    durationMs: durationMs(settings),
  };
}

export function sameCalendarDay(aMs, bMs) {
  const a = new Date(aMs);
  const b = new Date(bMs);

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function sortWashTickets(tickets, nowMs = Date.now()) {
  return [...(tickets || [])].sort((a, b) => {
    const aStatus = clean(a.washStatus).toLowerCase();
    const bStatus = clean(b.washStatus).toLowerCase();

    if (aStatus !== bStatus) {
      if (aStatus === "washing") return -1;
      if (bStatus === "washing") return 1;
    }

    const aRisk = isFutureAtRiskNeedBy(a, nowMs);
    const bRisk = isFutureAtRiskNeedBy(b, nowMs);

    if (aRisk !== bRisk) {
      return aRisk ? -1 : 1;
    }

    if (aRisk && bRisk && a.needByAtMs !== b.needByAtMs) {
      return a.needByAtMs - b.needByAtMs;
    }

    const aWaiter = isWaiterTicket(a);
    const bWaiter = isWaiterTicket(b);

    if (aWaiter !== bWaiter) {
      return aWaiter ? -1 : 1;
    }

    if (aWaiter && bWaiter) {
      return (
        Number(a.washWaiterAtMs || a.waiterMarkedAtMs || a.washQueuedAtMs || 0) -
        Number(b.washWaiterAtMs || b.waiterMarkedAtMs || b.washQueuedAtMs || 0)
      );
    }

    const aRewash = aStatus === "rewash_requested";
    const bRewash = bStatus === "rewash_requested";

    if (aRewash !== bRewash) {
      return aRewash ? -1 : 1;
    }

    if (aRewash && bRewash) {
      return (
        Number(a.rewashRequestedAtMs || a.washQueuedAtMs || 0) -
        Number(b.rewashRequestedAtMs || b.washQueuedAtMs || 0)
      );
    }

    return Number(a.washQueuedAtMs || 0) - Number(b.washQueuedAtMs || 0);
  });
}

function slotEndForNeedBy(needBy, plan) {
  if (!needBy || !plan.durationMs || !plan.openMs) {
    return 0;
  }

  const latestStart = needBy - plan.durationMs;

  if (latestStart < plan.openMs) {
    return plan.openMs + plan.durationMs <= needBy
      ? plan.openMs + plan.durationMs
      : 0;
  }

  const steps = Math.floor((latestStart - plan.openMs) / plan.durationMs);
  const start = plan.openMs + steps * plan.durationMs;

  return start + plan.durationMs;
}

function addDays(dayMs, days) {
  const date = new Date(dayMs);

  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);

  return date.getTime();
}

function projectionWindow(settings, nowMs) {
  for (let offset = 0; offset <= 7; offset += 1) {
    const dayMs = offset === 0 ? nowMs : addDays(nowMs, offset);
    const plan = getDayPlan(settings, dayMs);

    if (!plan.bays || plan.closeMs <= plan.openMs) {
      continue;
    }

    if (offset === 0 && nowMs > plan.closeMs) {
      continue;
    }

    const startMs = offset === 0 ? Math.max(nowMs, plan.openMs) : plan.openMs;

    if (startMs >= plan.closeMs) {
      continue;
    }

    return { plan, startMs };
  }

  return {
    plan: getDayPlan(settings, nowMs),
    startMs: nowMs,
  };
}

export function projectWashQueue(tickets, settings, nowMs = Date.now()) {
  const sorted = sortWashTickets(tickets, nowMs);
  const window = projectionWindow(settings, nowMs);
  const plan = window.plan;
  const bayFreeAt = Array.from({ length: Math.max(plan.bays, 1) }, () => window.startMs);

  if (!plan.bays) {
    return sorted.map((ticket) => ({
      ...ticket,
      projectedStartAtMs: null,
      projectedFinishAtMs: null,
      needByMissed: needByMs(ticket) > 0,
    }));
  }

  return sorted.map((ticket) => {
    const status = clean(ticket.washStatus).toLowerCase();
    const started = Number(ticket.washingStartedAtMs || 0);
    const plannedFinish = started > 0 ? started + plan.durationMs : 0;

    const bayIndex = bayFreeAt.indexOf(Math.min(...bayFreeAt));

    let startMs;
    let finishMs;

    if (status === "washing" && started > 0 && plannedFinish > nowMs) {
      startMs = started;
      finishMs = plannedFinish;
    } else if (status === "washing") {
      startMs = nowMs;
      finishMs = nowMs;
    } else {
      startMs = Math.min(...bayFreeAt);
      finishMs = startMs + plan.durationMs;
    }

    bayFreeAt[bayIndex] = Math.max(bayFreeAt[bayIndex], finishMs);

    const needBy = needByMs(ticket);

    return {
      ...ticket,
      projectedStartAtMs: startMs,
      projectedFinishAtMs: finishMs,
      needByMissed: needBy > 0 && finishMs > needBy,
    };
  });
}

export function canAcceptNeedBy({
  tickets = [],
  settings,
  proposedFinishAtMs,
  ticketId = "",
  nowMs = Date.now(),
}) {
  const proposed = Number(proposedFinishAtMs || 0);
  const plan = getDayPlan(settings, proposed || nowMs);

  if (!proposed || proposed <= nowMs) {
    return {
      ok: false,
      reason: "Need By must be in the future.",
    };
  }

  if (!plan.isOpenDay) {
    return {
      ok: false,
      reason: "Wash is closed or has no bays that day.",
    };
  }

  if (proposed > plan.closeMs) {
    return {
      ok: false,
      reason: "Need By is after wash close that day.",
    };
  }

  if (proposed < plan.openMs) {
    return {
      ok: false,
      reason: "Need By is before wash open that day.",
    };
  }

  const slotEnd = slotEndForNeedBy(proposed, plan);

  if (!slotEnd || slotEnd > proposed) {
    return {
      ok: false,
      reason: "No wash slot can finish by that time.",
    };
  }

  if (slotEnd - plan.durationMs < nowMs) {
    return {
      ok: false,
      reason: "That slot has already started or passed.",
    };
  }

  let taken = 0;

  tickets.forEach((ticket) => {
    if (ticketId && ticket.id === ticketId) {
      return;
    }

    const otherNeedBy = needByMs(ticket);

    if (!otherNeedBy || !sameCalendarDay(otherNeedBy, proposed)) {
      return;
    }

    const otherPlan = getDayPlan(settings, otherNeedBy);
    const otherSlot = slotEndForNeedBy(otherNeedBy, otherPlan);

    if (otherSlot === slotEnd) {
      taken += 1;
    }
  });

  if (taken >= plan.bays) {
    return {
      ok: false,
      reason: "That wash slot is already taken.",
      slotEndMs: slotEnd,
    };
  }

  return {
    ok: true,
    slotEndMs: slotEnd,
    seatsLeft: plan.bays - taken - 1,
    plan,
  };
}

export function listOpenNeedBySlots({
  tickets = [],
  settings,
  ticketId = "",
  nowMs = Date.now(),
  limit = 8,
}) {
  const plan = getDayPlan(settings, nowMs);

  if (!plan.isOpenDay || !plan.durationMs) {
    return [];
  }

  const slots = [];
  let finish = plan.openMs + plan.durationMs;

  while (finish <= plan.closeMs && slots.length < limit) {
    const check = canAcceptNeedBy({
      tickets,
      settings,
      proposedFinishAtMs: finish,
      ticketId,
      nowMs,
    });

    if (check.ok) {
      slots.push({
        finishAtMs: finish,
        slotEndMs: check.slotEndMs,
      });
    }

    finish += plan.durationMs;
  }

  return slots;
}

export async function loadWashCapacity() {
  const settings = await getWashSettings();

  return {
    settings,
    plan: getDayPlan(settings),
  };
}