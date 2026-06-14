/**
 * SIGNAL SCHEDULE — Africa Time (EAT / UTC+3)
 *
 * Fixed daily schedule:
 *
 * ☀️ Morning Session:
 *   Signal sent:    10:00 AM EAT  (published to Telegram channel)
 *   Trading opens:   1:00 PM EAT  (3 hours for early booking)
 *   Trading closes:  5:30 PM EAT  (4.5 hours session)
 *
 * 🌙 Evening / Night Session:
 *   Signal sent:     6:20 PM EAT  (published same day, 50 min after morning closes)
 *   Trading opens:  12:10 AM EAT  (next day midnight)
 *   Trading closes:  8:40 AM EAT  (next day morning)
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
 * ☀️ Morning: signal 10AM, trade 1PM→5:30PM (same day)
 * 🌙 Evening: signal 6:20PM, trade 12:10AM→8:40AM (next day)
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
    // Signal: 10:00 AM EAT
    signalRelease.setHours(10, 0, 0, 0);
    // Trade: 1:00 PM → 5:30 PM (3hr early booking + 4.5hr trading)
    sessionStart.setHours(13, 0, 0, 0);
    sessionEnd.setHours(17, 30, 0, 0);

    // If we're past session end (5:30PM), move to tomorrow
    if (eatNow.getTime() >= sessionEnd.getTime()) {
      signalRelease.setDate(signalRelease.getDate() + 1);
      sessionStart.setDate(sessionStart.getDate() + 1);
      sessionEnd.setDate(sessionEnd.getDate() + 1);
    }
  } else {
    // Signal: 6:20 PM EAT (same day as morning)
    signalRelease.setHours(18, 20, 0, 0);
    // Trade: 12:10 AM → 8:40 AM next day
    sessionStart.setHours(0, 10, 0, 0);
    sessionStart.setDate(sessionStart.getDate() + 1);
    sessionEnd.setHours(8, 40, 0, 0);
    sessionEnd.setDate(sessionEnd.getDate() + 1);

    // If we're past session end (8:40AM next day), move to tomorrow
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
 *   ☀️ Morning signal: 10:00 AM – 5:30 PM (signal 10AM, trade 1PM–5:30PM)
 *   🌙 Evening signal: 6:20 PM – 8:40 AM next day (signal 6:20PM, trade 12:10AM–8:40AM)
 */
export function detectSlot(referenceDate?: Date): SignalSlot {
  const now = referenceDate ?? new Date();
  const eat = toEAT(now);
  const hour = eat.getHours();
  const minute = eat.getMinutes();

  // Morning slot: 10:00 AM to 5:29 PM
  if (hour >= 10 && hour < 17) return "morning";
  if (hour === 17 && minute < 30) return "morning";
  // Evening slot: everything else (5:30PM–9:59AM next day)
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
