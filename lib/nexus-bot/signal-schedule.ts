/**
 * SIGNAL SCHEDULE — Africa Time (EAT / UTC+3)
 *
 * Morning Cycle:
 *   Signal Generated: 09:00 EAT
 *   Trading Opens:    11:00 EAT
 *   Trading Closes:   16:00 EAT
 *
 * Evening Cycle:
 *   Signal Generated: 17:00 EAT
 *   Trading Opens:    20:00 EAT
 *   Trading Closes:   07:00 EAT (next day)
 *
 * The system dynamically detects the current slot based on server time.
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
 * Build today's session window for the given slot based on Africa/EAT timezone.
 *
 * Times in EAT (UTC+3):
 *   Morning: signal 09:00, trade 11:00–16:00
 *   Evening: signal 17:00, trade 20:00–07:00+1
 */
export function buildSessionWindow(
  slot: SignalSlot,
  referenceDate?: Date,
): SessionWindow {
  const now = referenceDate ?? new Date();

  // Convert to EAT (UTC+3) for all calculations
  const eatNow = toEAT(now);

  const signalRelease = new Date(eatNow);
  const sessionStart = new Date(eatNow);
  const sessionEnd = new Date(eatNow);

  if (slot === "morning") {
    // Signal: 09:00 EAT
    signalRelease.setHours(9, 0, 0, 0);
    // Trade: 11:00 EAT → 16:00 EAT
    sessionStart.setHours(11, 0, 0, 0);
    sessionEnd.setHours(16, 0, 0, 0);

    // If we're past signal release time, move to tomorrow
    if (eatNow.getTime() >= signalRelease.getTime() + 2 * 60 * 60 * 1000) {
      signalRelease.setDate(signalRelease.getDate() + 1);
      sessionStart.setDate(sessionStart.getDate() + 1);
      sessionEnd.setDate(sessionEnd.getDate() + 1);
    }
  } else {
    // Evening: Signal 17:00 EAT
    signalRelease.setHours(17, 0, 0, 0);
    // Trade: 20:00 EAT → 07:00 EAT next day
    sessionStart.setHours(20, 0, 0, 0);
    sessionEnd.setHours(7, 0, 0, 0);
    sessionEnd.setDate(sessionEnd.getDate() + 1); // crosses midnight

    // If we're past signal release time, move to tomorrow
    if (eatNow.getTime() >= signalRelease.getTime() + 2 * 60 * 60 * 1000) {
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
  // Get current UTC time
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  // EAT = UTC+3
  return new Date(utcMs + 3 * 60 * 60 * 1000);
}

/**
 * Convert EAT date back to local Date for ISO serialization.
 */
export function fromEAT(eatDate: Date): Date {
  const eatMs = eatDate.getTime();
  // Subtract 3 hours to get back to UTC
  return new Date(eatMs - 3 * 60 * 60 * 1000);
}

/**
 * Detect which slot we're in based on current EAT time.
 */
export function detectSlot(referenceDate?: Date): SignalSlot {
  const now = referenceDate ?? new Date();
  const eat = toEAT(now);
  const hour = eat.getHours();

  // Morning: signal released 9:00 AM, session runs 11:00-16:00
  // Evening: signal released 17:00 (5PM), session runs 20:00-07:00+1
  // Use signal release time to determine slot
  if (hour >= 5 && hour < 13) return "morning";
  return "evening";
}

/**
 * Format EAT time for display in messages.
 */
export function formatEAT(date: Date, showDate = false): string {
  // Convert to EAT for display
  const eat = toEAT(date);
  const timeStr = eat.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC", // We've already adjusted to EAT, so use UTC to avoid double adjustment
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
