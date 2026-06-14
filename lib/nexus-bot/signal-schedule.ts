/**
 * REVISED SIGNAL SCHEDULE — Nairobi / Africa Time (EAT / UTC+3)
 * 12-Hour Clock Strict Automation Engine
 *
 * ☀️ Morning Session:
 *   Signal sent:    10:00 AM EAT
 *   Trading opens:   1:00 PM EAT (3hr early booking)
 *   Trading closes:  5:30 PM EAT (4.5hr session)
 *
 * 🌙 Evening Session:
 *   Signal sent:     6:00 PM EAT
 *   Trading opens:  10:00 PM EAT (4hr early booking)
 *   Trading closes: 10:00 AM EAT next day (12hr session, crosses midnight)
 *
 * No overlap — sessions strictly sequential.
 * Admin can ONLY override profitMargin (earnings %).
 */

export type SignalSlot = "morning" | "evening";

export type SessionWindow = {
  slot: SignalSlot;
  /** When the signal code is published (generated) — Telegram trigger time */
  signalRelease: Date;
  /** When trading opens (session start) */
  sessionStart: Date;
  /** When trading closes (session end / settlement) */
  sessionEnd: Date;
  /** Admin-configurable profit margin (%), system default if unset */
  profitMargin: number;
  /** Whether the session ends on the next calendar day */
  crossesMidnight: boolean;
};

/**
 * Create a UTC Date from explicit EAT (UTC+3) hour/minute values.
 * Uses pure math — no mutable .setHours/.setDate chaining.
 * Works correctly regardless of server timezone.
 */
function createEATDate(baseDate: Date, eatHour: number, eatMinute: number, dayOffset = 0): Date {
  // EAT = UTC+3 → UTC hour = EAT hour - 3
  const utcDate = new Date(baseDate);
  utcDate.setUTCDate(utcDate.getUTCDate() + dayOffset);
  utcDate.setUTCHours(eatHour - 3, eatMinute, 0, 0);
  return utcDate;
}

/**
 * Get current time in EAT (millis since epoch).
 */
function nowEATMs(): number {
  const now = new Date();
  return now.getTime() + now.getTimezoneOffset() * 60_000 + 3 * 3600_000;
}

/**
 * Build the session window for the given slot.
 * All session boundaries are computed as **immutable UTC dates** derived from
 * explicit EAT hour/minute constants — no chained setHours/setDate mutations.
 *
 * Past-slot detection: if the current EAT time is already past the session end
 * for today, the entire window shifts forward by 1 day.
 */
export function buildSessionWindow(
  slot: SignalSlot,
  referenceDate?: Date,
  adminProfitMargin?: number,
): SessionWindow {
  const base = referenceDate ?? new Date();
  const eatNowMs = nowEATMs();

  const DEFAULT_PROFIT_MARGIN = 10; // 10% default

  if (slot === "morning") {
    // ☀️ MORNING: Signal 10AM | Trade 1PM → 5:30PM (same day)
    let signalRelease = createEATDate(base, 10, 0, 0);
    let sessionStart = createEATDate(base, 13, 0, 0);
    let sessionEnd = createEATDate(base, 17, 30, 0);

    // If past 5:30 PM EAT today → shift to tomorrow
    if (eatNowMs >= sessionEnd.getTime() + 3 * 3600_000) {
      signalRelease = createEATDate(base, 10, 0, 1);
      sessionStart = createEATDate(base, 13, 0, 1);
      sessionEnd = createEATDate(base, 17, 30, 1);
    }

    return {
      slot: "morning",
      signalRelease,
      sessionStart,
      sessionEnd,
      profitMargin: adminProfitMargin ?? DEFAULT_PROFIT_MARGIN,
      crossesMidnight: false,
    };
  }

  // 🌙 EVENING: Signal 6PM | Trade 10PM → 10AM next day
  let signalRelease = createEATDate(base, 18, 0, 0);
  let sessionStart = createEATDate(base, 22, 0, 0);
  let sessionEnd = createEATDate(base, 10, 0, 1); // Next day 10AM

  // If past 10 AM EAT (session end for tonight's evening) → shift to tomorrow
  // Also if past 6PM and before 10PM, we're in the waiting window for today's evening
  // But if past 10AM and before 6PM, evening hasn't released yet — use today's
  const yesterdaySignal = createEATDate(base, 18, 0, 0);
  const yesterdayEnd = createEATDate(base, 10, 0, 0); // 10 AM today = yesterday evening's end

  // If we're past today's 10AM (evening session end), but before 6PM (evening signal),
  // today's evening signal hasn't been released yet — keep current day
  // If past 6PM AND past 10AM, shift to tomorrow
  const today6PM = createEATDate(base, 18, 0, 0).getTime() + 3 * 3600_000;
  const today10AM = createEATDate(base, 10, 0, 0).getTime() + 3 * 3600_000;

  if (eatNowMs >= today10AM && eatNowMs >= today6PM) {
    // Past both 10AM and 6PM → shift to tomorrow
    signalRelease = createEATDate(base, 18, 0, 1);
    sessionStart = createEATDate(base, 22, 0, 1);
    sessionEnd = createEATDate(base, 10, 0, 2);
  }

  return {
    slot: "evening",
    signalRelease,
    sessionStart,
    sessionEnd,
    profitMargin: adminProfitMargin ?? DEFAULT_PROFIT_MARGIN,
    crossesMidnight: true,
  };
}

/**
 * Detect which slot the current time falls into.
 * Returns "morning" during 10AM-5:30PM window.
 * Returns "evening" during 6PM-10AM next day window.
 *
 * This is used by the cron endpoint to determine which slot to publish.
 */
export function detectSlot(referenceDate?: Date): SignalSlot {
  const now = referenceDate ?? new Date();
  const eatMs = now.getTime() + now.getTimezoneOffset() * 60_000 + 3 * 3600_000;
  const eatDate = new Date(eatMs);
  const hour = eatDate.getUTCHours();
  const minute = eatDate.getUTCMinutes();

  // Morning slot: 10:00 AM to 5:29 PM
  if (hour >= 10 && hour < 17) return "morning";
  if (hour === 17 && minute < 30) return "morning";
  // Evening slot: 5:30 PM to 9:59 AM next day
  return "evening";
}

/**
 * Check whether a given slot's trading window is currently active.
 * Used to prevent overlapping signals.
 * Trade is active from sessionStart up until sessionEnd.
 */
export function isSlotActive(slot: SignalSlot, referenceDate?: Date): boolean {
  const now = referenceDate ?? new Date();
  const window = buildSessionWindow(slot, now);
  return now.getTime() >= window.sessionStart.getTime() && now.getTime() < window.sessionEnd.getTime();
}

/**
 * Check if a new signal can be generated for the given slot.
 * Returns true if current time is between signal release and trade session start.
 * The publishing window is WIDE open from release time up until the exact moment
 * trading starts — even if the release minute has passed, as long as the trade
 * hasn't begun, the signal can still be published.
 */
export function canPublishSignal(slot: SignalSlot, referenceDate?: Date): boolean {
  const now = referenceDate ?? new Date();
  const window = buildSessionWindow(slot, now);

  // CORE RULE: Allow publishing from release time up until trading opens!
  return now.getTime() >= window.signalRelease.getTime() && now.getTime() < window.sessionStart.getTime();
}

/**
 * Convert a Date to EAT (UTC+3) for consistent time calculations.
 */
export function toEAT(date: Date): Date {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 3 * 3600_000);
}

/**
 * Convert EAT-adjusted date back to UTC for DB storage.
 */
export function fromEAT(eatDate: Date): Date {
  return new Date(eatDate.getTime() - 3 * 3600_000);
}

/**
 * Format an EAT date for human-readable display (12-hour clock).
 */
export function formatEAT(date: Date, showDate = false): string {
  const eat = toEAT(date);
  const timeStr = eat.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
  if (!showDate) return timeStr;
  const dateStr = eat.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${dateStr} · ${timeStr} EAT`;
}

/**
 * Format ISO date string for display.
 */
export function formatISODate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
