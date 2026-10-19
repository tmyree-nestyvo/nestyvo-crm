// Open times are loaded per month now, not as one window from today
// (Charlene, Oct 16 2026 recording: the admin calendar stopped offering
// times after mid-November and the provider's after mid-January). These are
// the dates a month view asks the API for.

/** How far ahead open times can be shown and booked — matches the API's MAX_DAYS_AHEAD. */
export const MAX_DAYS_AHEAD = 548; // ~18 months

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The month on screen plus a week either side (grid rows that spill into the
 * neighbouring months), stretched to include `selectedDate` if it's outside.
 */
export function monthSlotRange(year: number, month0: number, selectedDate?: string | null) {
  let from = iso(new Date(Date.UTC(year, month0, 1 - 7)));
  let to = iso(new Date(Date.UTC(year, month0 + 1, 7)));
  if (selectedDate && selectedDate < from) from = selectedDate;
  if (selectedDate && selectedDate > to) to = selectedDate;
  return { from, to };
}

/** The last bookable date (YYYY-MM-DD) in Pacific time. */
export function maxBookableDate() {
  const d = new Date();
  d.setDate(d.getDate() + MAX_DAYS_AHEAD - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}
