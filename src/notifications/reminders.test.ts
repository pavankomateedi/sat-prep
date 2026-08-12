import { describe, expect, it } from 'vitest';
// Imports the pure planning module, not the expo-notifications wrapper — the
// engine/UI split is what lets this run in plain Node.
import {
  DEFAULT_REMINDER,
  REGISTRATION_LEAD_DAYS,
  SCORE_REPORTING_NOTES,
  TEST_DAY_CHECKLIST,
  formatReminderTime,
  messageForDay,
  parseReminderTime,
  plannedLogisticsReminders,
} from './schedule';
import {
  DEFAULT_ADMINISTRATIONS,
  DEFAULT_TARGET_TEST_DATE,
  upcomingAdministrations,
} from '../domain/program';
import { daysBetween } from '../lib/dates';

describe('programme calendar', () => {
  it('targets spring 2028, resolving the PRD ambiguity', () => {
    expect(DEFAULT_TARGET_TEST_DATE.startsWith('2028-05')).toBe(true);
  });

  it('flags every unpublished date as an estimate rather than a fact', () => {
    // College Board publishes dates ~18 months out, so 2028 cannot be
    // confirmed. Presenting a guess as a fact is what this app must not do.
    for (const admin of DEFAULT_ADMINISTRATIONS) {
      expect(admin.estimated, `${admin.id} should be flagged as estimated`).toBe(true);
    }
  });

  it('lists administrations in date order, excluding past ones', () => {
    const upcoming = upcomingAdministrations('2027-01-01');
    expect(upcoming.length).toBeGreaterThan(0);
    for (const admin of upcoming) expect(admin.date >= '2027-01-01').toBe(true);
    const dates = upcoming.map((a) => a.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('puts registration deadlines before their test dates', () => {
    for (const admin of DEFAULT_ADMINISTRATIONS) {
      if (!admin.registrationDeadline) continue;
      expect(daysBetween(admin.registrationDeadline, admin.date)).toBeGreaterThan(0);
    }
  });
});

describe('logistics reminders (PRD §4.1 gap)', () => {
  it('schedules a reminder at each registration lead time', () => {
    const reminders = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, '2026-08-01');
    const forMayTest = reminders.filter((r) => r.administrationId === 'sat-2028-05');
    const registration = forMayTest.filter((r) => r.title === 'Registration deadline');
    expect(registration).toHaveLength(REGISTRATION_LEAD_DAYS.length);
  });

  it('adds a night-before reminder for every administration', () => {
    const reminders = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, '2026-08-01');
    const eves = reminders.filter((r) => r.title === 'Test tomorrow');
    expect(eves).toHaveLength(DEFAULT_ADMINISTRATIONS.length);
    for (const eve of eves) {
      const admin = DEFAULT_ADMINISTRATIONS.find((a) => a.id === eve.administrationId)!;
      expect(daysBetween(eve.date, admin.date)).toBe(1);
    }
  });

  it('does not schedule reminders in the past', () => {
    const today = '2028-04-20';
    const reminders = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, today);
    for (const reminder of reminders) {
      expect(daysBetween(today, reminder.date)).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces stable ids so rescheduling cannot duplicate a reminder', () => {
    const first = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, '2026-08-01');
    const second = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, '2026-08-01');
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(new Set(first.map((r) => r.id)).size).toBe(first.length);
  });

  it('returns reminders in chronological order', () => {
    const reminders = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, '2026-08-01');
    const dates = reminders.map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('ships a usable checklist and score-reporting notes', () => {
    expect(TEST_DAY_CHECKLIST.length).toBeGreaterThan(5);
    expect(TEST_DAY_CHECKLIST.join(' ')).toMatch(/ID/);
    expect(SCORE_REPORTING_NOTES.join(' ')).toMatch(/[Ss]uperscor/);
  });
});

describe('daily reminder settings', () => {
  it('is off by default — the student opts in', () => {
    expect(DEFAULT_REMINDER.enabled).toBe(false);
  });

  it('round-trips a time through parse and format', () => {
    const parsed = parseReminderTime('07:05');
    expect(parsed).toEqual({ hour: 7, minute: 5 });
    expect(formatReminderTime({ enabled: true, ...parsed! })).toBe('07:05');
  });

  it('rejects malformed or out-of-range times', () => {
    for (const bad of ['', '7', '25:00', '12:60', 'noon', '12:5', '-1:00']) {
      expect(parseReminderTime(bad), bad).toBeNull();
    }
  });

  it('picks copy deterministically per day, so rescheduling does not churn it', () => {
    expect(messageForDay('2026-09-15')).toBe(messageForDay('2026-09-15'));
    const week = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map(messageForDay);
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it('never uses streak or guilt language (PRD §2.6)', () => {
    const forbidden = /streak|don't lose|keep it up|missed|behind|fail/i;
    for (const date of ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']) {
      expect(messageForDay(date)).not.toMatch(forbidden);
    }
  });
});
