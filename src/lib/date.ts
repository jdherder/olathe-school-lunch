/**
 * Small timezone-aware date helpers. A "day" here is a plain Y/M/D triple with
 * no clock or offset, which is exactly what a menu date is — we never want a
 * UTC instant drifting the menu across a day boundary.
 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** "Today" as a Y/M/D triple in the given IANA time zone. */
export function todayIn(timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { year: +get("year"), month: +get("month"), day: +get("day") };
}

/** Parse `YYYY-MM-DD`, rejecting impossible dates like 2026-02-31. */
export function parseISODate(s: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const parts = { year: +m[1], month: +m[2], day: +m[3] };
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    d.getUTCFullYear() !== parts.year ||
    d.getUTCMonth() !== parts.month - 1 ||
    d.getUTCDate() !== parts.day
  ) {
    return null;
  }
  return parts;
}

/** `MM/DD/YYYY`, the format School Cafe's API expects. */
export function formatMMDDYYYY(d: DateParts): string {
  return `${pad(d.month)}/${pad(d.day)}/${d.year}`;
}

/** `YYYY-MM-DD`, used in our own URLs. */
export function toISO(d: DateParts): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Add whole days, normalizing month/year rollover via UTC math. */
export function addDays(d: DateParts, n: number): DateParts {
  const base = new Date(Date.UTC(d.year, d.month - 1, d.day));
  base.setUTCDate(base.getUTCDate() + n);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

/** e.g. "Tuesday, August 18, 2026". */
export function longDate(d: DateParts): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

/** Day of week, 0 = Sunday … 6 = Saturday. */
export function weekday(d: DateParts): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

/** True for Saturday and Sunday — days with no school lunch. */
export function isWeekend(d: DateParts): boolean {
  const wd = weekday(d);
  return wd === 0 || wd === 6;
}

/** The nearest weekday strictly before `d`, skipping Sat/Sun. */
export function previousWeekday(d: DateParts): DateParts {
  let r = addDays(d, -1);
  while (isWeekend(r)) r = addDays(r, -1);
  return r;
}

/** The nearest weekday strictly after `d`, skipping Sat/Sun. */
export function nextWeekday(d: DateParts): DateParts {
  let r = addDays(d, 1);
  while (isWeekend(r)) r = addDays(r, 1);
  return r;
}

/** Monday of the week containing `d`. */
export function startOfWeekMonday(d: DateParts): DateParts {
  const wd = weekday(d);
  const diff = wd === 0 ? -6 : 1 - wd;
  return addDays(d, diff);
}

/** The five weekdays (Mon–Fri) of the week containing `d`. */
export function weekdaysOf(d: DateParts): DateParts[] {
  const monday = startOfWeekMonday(d);
  return [0, 1, 2, 3, 4].map((n) => addDays(monday, n));
}

/** Short weekday label, e.g. "Mon". */
export function shortWeekday(d: DateParts): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(d.year, d.month - 1, d.day)));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
