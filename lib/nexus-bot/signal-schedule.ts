/**
 * SIGNAL SCHEDULE — Africa Time (EAT / UTC+3)
 *
 * Fixed daily schedule:
 *
 * Morning Session:
 *   Signal visible:  5:00 AM EAT (users can see/join)
 *   Trading opens:   7:00 AM EAT
 *   Trading closes: 11:00 AM EAT (settlement runs)
 *   Duration: 4 hours
 *
 * Evening Session:
 *   Signal visible:  6:00 PM EAT (users can see/join)
 *   Trading opens:   9:00 PM EAT
 *   Trading closes:  7:00 AM EAT next day (settlement runs)
 *   Duration: 10 hours
 *
 * No overlap — morning fully settled before evening signal appears.
 */

export type SignalSlot = "morning" | "evening";

export type SessionWindow = {
  slot: SignalSlot;
  /** When the signal code is published (generated) */
  signalRelease: Date;
  /** When trading opens (session start) */
  sessionStart: Date;
  /** When trading closes (session end) */
  sessionEnd: Date;
  /** Whether the session ends on the next day */
  crossesMidnight: boolean;
};

/**
 * Build the session window for the given slot.
 * All times EAT (UTC+3).
 *
 * Morning: signal 5AM, trade 7AM→11AM (same day)
 * Evening: signal 6PM, trade 9PM→7AM+1 (next day)
 */
export function buildSessionWindow(
  slot: SignalSlot,
  referenceDate?: Date,
): SessionWindow {
  const now = referenceDate ?? new Date();
  const eatNow = toEAT(now);

  const signalRelease = new Date(eatNow);
  const sessionStart = new Date(eatNow);
  const sessionEnd = new Date(eatNow);

  if (slot === "morning") {
    // Signal: 5:00 AM EAT
    signalRelease.setHours(5, 0, 0, 0);
    // Trade: 7:00 AM → 11:00 AM
    sessionStart.setHours(7, 0, 0, 0);
    sessionEnd.setHours(11, 0, 0, 0);

    // If we're past session end (11AM), move to tomorrow
    if (eatNow.getTime() >= sessionEnd.getTime()) {
      signalRelease.setDate(signalRelease.getDate() + 1);
      sessionStart.setDate(sessionStart.getDate() + 1);
      sessionEnd.setDate(sessionEnd.getDate() + 1);
    }
  } else {
    // Signal: 6:00 PM EAT
    signalRelease.setHours(18, 0, 0, 0);
    // Trade: 9:00 PM → 7:00 AM next day
    sessionStart.setHours(21, 0, 0, 0);
    sessionEnd.setHours(7, 0, 0, 0);
    sessionEnd.setDate(sessionEnd.getDate() + 1);

    // If we're past session end (7AM next day), move to tomorrow
    if (eatNow.getTime() >= sessionEnd.getTime()) {
      signalRelease.setDate(signalRelease.getDate() + 1);
      sessionStart.setDate(sessionStart.getDate() + 1);
      sessionEnd.setDate(sessionEnd.getDate() + 1);
    }
  }

  const crossesMidnight = sessionEnd.getDate() !== sessionStart.getDate();

  return {
    slot,
    signalRelease,
    sessionStart,
    sessionEnd,
    crossesMidnight,
  };
}

/**
 * Convert a Date to EAT (UTC+3) for consistent time calculations.
 * Returns a new Date object adjusted to EAT.
 */
export function toEAT(date: Date): Date {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 3 * 60 * 60 * 1000);
}

/**
 * Convert EAT date back to local Date for ISO serialization.
 */
export function fromEAT(eatDate: Date): Date {
  const eatMs = eatDate.getTime();
  return new Date(eatMs - 3 * 60 * 60 * 1000);
}

/**
 * Detect which slot we're in based on current EAT time.
 *
 * Slot windows (determined by signal visibility periods):
 *   Morning signal: 5:00 AM – 11:00 AM (signal appears 5AM, session 7AM–11AM)
 *   Evening signal: 6:00 PM – 7:00 AM next day (signal appears 6PM, session 9PM–7AM)
 */
export function detectSlot(referenceDate?: Date): SignalSlot {
  const now = referenceDate ?? new Date();
  const eat = toEAT(now);
  const hour = eat.getHours();

  // Morning slot: if current hour is between 5AM and 11AM (inclusive of signal window)
  if (hour >= 5 && hour < 11) return "morning";
  // Evening slot: everything else (covers 11AM–5AM next day, including overnight)
  return "evening";
}

/**
 * Format EAT time for display in messages.
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
