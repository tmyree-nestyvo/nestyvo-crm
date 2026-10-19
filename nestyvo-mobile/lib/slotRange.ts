// Open times are loaded per month now, not as one window from today
// (Charlene, Oct 16 2026 recording: the admin calendar stopped offering
// times after mid-November and the provider's after mid-January). These are
// the dates a month view asks the API for.

/** How far ahead open times can be shown and booked — matches the API's MAX_DAYS_AHEAD. */
export const MAX_DAYS_AHEAD = 548; // ~18 months

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The month on screen plus a week either side (grid rows that spill into the
 * neighbouring months). A selected day outside it is fetched on its own (see
 * isOutside) rather than stretching this range, which the API caps at 100 days.
 */
export function monthSlotRange(year: number, month0: number) {
  return {
    from: iso(new Date(Date.UTC(year, month0, 1 - 7))),
    to: iso(new Date(Date.UTC(year, month0 + 1, 7))),
  };
}

export const isOutside = (range: { from: string; to: string }, date: string) => date < range.from || date > range.to;

type DaySlots = { date: string; slots: any[] };
/** Combine the month's open days with a separately fetched selected day. */
export function mergeSlotDays<T extends { slotsByDate?: DaySlots[]; activeDates?: string[] }>(month?: T | null, day?: T | null): T | undefined {
  if (!month) return day ?? undefined;
  if (!day) return month;
  const seen = new Set((month.slotsByDate ?? []).map((d) => d.date));
  return {
    ...month,
    slotsByDate: [...(month.slotsByDate ?? []), ...(day.slotsByDate ?? []).filter((d) => !seen.has(d.date))],
    activeDates: Array.from(new Set([...(month.activeDates ?? []), ...(day.activeDates ?? [])])),
  };
}

/** The last bookable date (YYYY-MM-DD) in Pacific time. */
export function maxBookableDate() {
  const d = new Date();
  d.setDate(d.getDate() + MAX_DAYS_AHEAD - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}
