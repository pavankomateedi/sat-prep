/**
 * Content-freshness check.
 *
 * PRD §4.1 lists this as a real gap: §1.4 warns that domain weights and
 * Question Bank contents "should be re-checked against satsuite.collegeboard.org
 * close to build time and again before each PSAT/SAT administration" — but no
 * ticket in the backlog turns that caveat into a task, so it stays a good
 * intention forever.
 *
 * This makes it a scheduled obligation the app surfaces on its own. It is a
 * reminder, not an automated scrape: the check is a human reading the current
 * specification, and the app's job is to make sure that never quietly lapses.
 */

import {
  TAXONOMY_RECHECK_INTERVAL_DAYS,
  TAXONOMY_VERIFIED_ON,
} from '../domain/taxonomy';
import { daysBetween, toLocalDate, type LocalDate } from '../lib/dates';

export const COLLEGE_BOARD_SPEC_URL = 'https://satsuite.collegeboard.org/sat/whats-on-the-test';

export interface FreshnessStatus {
  stale: boolean;
  daysSinceVerified: number;
  lastVerified: LocalDate;
  /** Why the check is being raised now. */
  reason: string;
  url: string;
}

/**
 * Whether the taxonomy needs re-verifying.
 *
 * Goes stale on two triggers: the routine interval, and the run-up to a real
 * administration — the moment when an out-of-date weighting would do the most
 * damage.
 */
export function checkFreshness(
  today: LocalDate = toLocalDate(),
  upcomingTestDates: readonly LocalDate[] = [],
  lastVerified: LocalDate = TAXONOMY_VERIFIED_ON
): FreshnessStatus {
  const daysSince = daysBetween(lastVerified, today);

  for (const testDate of [...upcomingTestDates].sort()) {
    const daysUntil = daysBetween(today, testDate);
    if (daysUntil < 0) continue;
    if (daysUntil <= 45 && daysSince > 30) {
      return {
        stale: true,
        daysSinceVerified: daysSince,
        lastVerified,
        reason: `A real test is ${daysUntil} days away and the test specification has not been checked in ${daysSince} days.`,
        url: COLLEGE_BOARD_SPEC_URL,
      };
    }
  }

  if (daysSince >= TAXONOMY_RECHECK_INTERVAL_DAYS) {
    return {
      stale: true,
      daysSinceVerified: daysSince,
      lastVerified,
      reason: `The test specification has not been checked in ${daysSince} days.`,
      url: COLLEGE_BOARD_SPEC_URL,
    };
  }

  return {
    stale: false,
    daysSinceVerified: daysSince,
    lastVerified,
    reason: `Checked ${daysSince} days ago; next check in ${
      TAXONOMY_RECHECK_INTERVAL_DAYS - daysSince
    } days.`,
    url: COLLEGE_BOARD_SPEC_URL,
  };
}

/** What a person should actually look at when the check comes due. */
export const FRESHNESS_CHECKLIST = [
  'Section structure: still two modules per section, 54 R&W and 44 Math questions?',
  'Timing: still 64 minutes for Reading & Writing and 70 for Math?',
  'Domain weights: do the published percentages still match src/domain/taxonomy.ts?',
  'Skill list: any domains renamed, added, or removed?',
  'Scoring: still 400-1600 composite, 200-800 per section in 10-point steps?',
] as const;
