/**
 * Date helpers for a daily-habit app.
 *
 * Everything the student sees is keyed to their *local* calendar day — "did I
 * practise today" has to mean the day on their wall clock, not UTC. So local
 * dates are handled as `YYYY-MM-DD` strings built from local components, never
 * via `toISOString()` (which shifts across the UTC boundary and would silently
 * mark a 9pm session as belonging to tomorrow).
 *
 * Instants (timestamps on attempts, FSRS due dates) stay full ISO UTC strings.
 */

export type LocalDate = string; // YYYY-MM-DD

const MS_PER_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local calendar date of an instant, as YYYY-MM-DD. */
export function toLocalDate(d: Date = new Date()): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Midnight at the start of a local date, as a Date. */
export function fromLocalDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function isValidLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = fromLocalDate(value);
  return toLocalDate(parsed) === value;
}

/** Whole days from `a` to `b`, positive when `b` is later. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const start = fromLocalDate(a).getTime();
  const end = fromLocalDate(b).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = fromLocalDate(date);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

/**
 * Calendar months from `a` to `b`, fractional. Used for phase transitions,
 * where "about 6 months in" should not hinge on exact day counts.
 */
export function monthsBetween(a: LocalDate, b: LocalDate): number {
  const start = fromLocalDate(a);
  const end = fromLocalDate(b);
  const wholeMonths =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const dayFraction = (end.getDate() - start.getDate()) / 30;
  return wholeMonths + dayFraction;
}

/** Monday of the week containing `date`. Weeks run Monday-Sunday. */
export function startOfWeek(date: LocalDate): LocalDate {
  const d = fromLocalDate(date);
  // getDay(): 0 = Sunday. Shift so Monday = 0.
  const offset = (d.getDay() + 6) % 7;
  return addDays(date, -offset);
}

/** The 7 local dates of the week containing `date`, Monday first. */
export function weekDates(date: LocalDate): LocalDate[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const n = daysBetween(from, to);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/**
 * Consecutive missed days immediately before `today`, given the set of dates on
 * which a session was completed. Counts backwards and stops at the first
 * practised day, so it measures the *current* gap rather than a lifetime total.
 */
export function currentMissedStreak(
  practisedDates: ReadonlySet<LocalDate>,
  today: LocalDate,
  programStart: LocalDate
): number {
  let streak = 0;
  let cursor = addDays(today, -1);
  while (daysBetween(programStart, cursor) >= 0) {
    if (practisedDates.has(cursor)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
    // A guard against a pathological program start far in the past.
    if (streak > 365) break;
  }
  return streak;
}

export function nowIso(): string {
  return new Date().toISOString();
}
