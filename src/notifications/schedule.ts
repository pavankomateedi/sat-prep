/**
 * Reminder *planning* — pure logic, no React Native imports.
 *
 * Deliberately separate from reminders.ts, which does the actual scheduling
 * through expo-notifications. Keeping the decisions here means "which reminders
 * are owed, and when" is testable in plain Node, while the RN module stays a
 * thin wrapper that only calls the platform API.
 *
 * ## A deliberate departure from the PRD
 *
 * §2.8 lists "no push notifications/reminders" as an MVP non-goal and never
 * adds them. Overridden on request: across a two-year daily habit, one quiet
 * cue is the highest-leverage adherence tool available, and adherence is the
 * entire product thesis.
 *
 * The §2.6 constraints still bind, so the design stays narrow:
 *  - One notification a day, at a time the student picks.
 *  - Cleared the moment a session is completed — practising in the morning must
 *    never earn an evening nag.
 *  - No streak language and no guilt. §2.6 warns that streak-based extrinsic
 *    pressure erodes intrinsic motivation over long horizons, and two years is
 *    a long horizon.
 */

import type { Administration } from '../domain/program';
import { addDays, daysBetween, type LocalDate } from '../lib/dates';

export const DAILY_REMINDER_ID = 'daily-session';
export const TEST_REMINDER_PREFIX = 'admin-';

/** Rotating copy, so the reminder does not become wallpaper by month three. */
export const DAILY_MESSAGES = [
  "Today's session is ready.",
  'Thirty minutes, already planned.',
  'Your session is waiting when you are.',
  'Ready when you are — about half an hour.',
  "Today's questions are picked and waiting.",
] as const;

export interface ReminderSettings {
  enabled: boolean;
  /** Local hour, 0-23. */
  hour: number;
  minute: number;
}

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 17,
  minute: 30,
};

export function isValidReminderTime(hour: number, minute: number): boolean {
  return (
    Number.isInteger(hour) &&
    hour >= 0 &&
    hour <= 23 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute <= 59
  );
}

/** Parse "17:30". Returns null when the input is not a valid 24-hour time. */
export function parseReminderTime(text: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return isValidReminderTime(hour, minute) ? { hour, minute } : null;
}

export function formatReminderTime(settings: ReminderSettings): string {
  return `${String(settings.hour).padStart(2, '0')}:${String(settings.minute).padStart(2, '0')}`;
}

/** Deterministic pick, so a given day's copy is stable across reschedules. */
export function messageForDay(date: LocalDate): string {
  let hash = 0;
  for (let i = 0; i < date.length; i += 1) hash = (hash * 31 + date.charCodeAt(i)) >>> 0;
  return DAILY_MESSAGES[hash % DAILY_MESSAGES.length]!;
}

// ---------------------------------------------------------------------------
// Test-day and registration logistics
// ---------------------------------------------------------------------------

/**
 * PRD §4.1: "no registration or test-day logistics support (PSAT/SAT
 * registration reminders, score-reporting-to-colleges guidance) — out of scope
 * currently, though it is a real part of the family's actual job to be done."
 *
 * Registration deadlines are the piece with an actual cliff: miss one and the
 * sitting is gone or costs a late fee. Those get notifications; the rest is a
 * checklist in the app.
 */
export const REGISTRATION_LEAD_DAYS = [21, 7, 2] as const;

export interface LogisticsReminder {
  id: string;
  administrationId: string;
  title: string;
  body: string;
  /** Local date the notification should fire. */
  date: LocalDate;
}

/** Reminders owed for upcoming administrations, given today's date. */
export function plannedLogisticsReminders(
  administrations: readonly Administration[],
  today: LocalDate
): LogisticsReminder[] {
  const reminders: LogisticsReminder[] = [];

  for (const admin of administrations) {
    if (admin.registrationDeadline) {
      for (const lead of REGISTRATION_LEAD_DAYS) {
        const fireOn = addDays(admin.registrationDeadline, -lead);
        if (daysBetween(today, fireOn) < 0) continue;
        reminders.push({
          id: `${TEST_REMINDER_PREFIX}${admin.id}-reg-${lead}`,
          administrationId: admin.id,
          title: 'Registration deadline',
          body: `${admin.label} registration closes in ${lead} days.`,
          date: fireOn,
        });
      }
    }

    const eve = addDays(admin.date, -1);
    if (daysBetween(today, eve) >= 0) {
      reminders.push({
        id: `${TEST_REMINDER_PREFIX}${admin.id}-eve`,
        administrationId: admin.id,
        title: 'Test tomorrow',
        body: `${admin.label} is tomorrow. Check the admission ticket, ID, and calculator tonight.`,
        date: eve,
      });
    }
  }

  return reminders.sort((a, b) => a.date.localeCompare(b.date));
}

/** Static by design — this is useful precisely because it does not change. */
export const TEST_DAY_CHECKLIST = [
  'Admission ticket, printed or on the phone',
  'Photo ID',
  'Fully charged device, plus the charger',
  'Approved calculator with fresh batteries (Desmos is built in, but bring a backup)',
  'Pencils for scratch work',
  'Snack and water for the break',
  'Know the test centre address and how long the journey takes',
  'Bluebook installed and the exam pre-downloaded the night before',
] as const;

export const SCORE_REPORTING_NOTES = [
  'Scores are typically released about two weeks after the test date.',
  'Four score reports are free if sent within about nine days of the test.',
  'Score Choice lets you decide which sittings to send, though some colleges ask for all of them.',
  'Superscoring — combining the best section scores across sittings — is common but not universal. Check each college.',
] as const;
