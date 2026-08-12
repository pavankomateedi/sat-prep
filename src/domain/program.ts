/**
 * Programme calendar: the real dates this student's two-year arc is pinned to.
 *
 * The PRD is internally inconsistent about the target — its header says
 * "2026–2028" while the body says "the spring 11th-grade SAT", and with 9th
 * grade starting Fall 2026 those are about nine months apart. Resolved in
 * favour of the stated 2026–2028 window: an SAT in spring of 10th grade, which
 * leaves room for retakes in 11th.
 *
 * Everything here is a default, not a constant. The student record carries the
 * real target date and the phase logic reads that, so changing plans is a
 * settings edit rather than a code change.
 */

import type { LocalDate } from '../lib/dates';

/**
 * Default target: Saturday 6 May 2028.
 *
 * College Board publishes administration dates roughly 18 months ahead, so a
 * 2028 date cannot be confirmed yet. This is a plausible early-May Saturday and
 * should be replaced with the real one once published — the freshness check in
 * src/content/freshness.ts is the reminder to go and look.
 */
export const DEFAULT_TARGET_TEST_DATE: LocalDate = '2028-05-06';

/** Typical programme length used to pre-fill setup, in days. */
export const DEFAULT_PROGRAM_DAYS = 640;

export type AdministrationKind = 'psat_8_9' | 'psat_nmsqt' | 'sat';

export interface Administration {
  id: string;
  kind: AdministrationKind;
  label: string;
  /** Test date. Estimated entries are flagged below. */
  date: LocalDate;
  /** Registration deadline, where one applies. */
  registrationDeadline?: LocalDate;
  /**
   * True when the date is inferred from the usual annual pattern rather than
   * taken from a published College Board calendar. The UI labels these, because
   * presenting a guess as a fact is exactly what this app is supposed not to do.
   */
  estimated: boolean;
  note?: string;
}

/**
 * Interim checkpoints across the arc.
 *
 * PSAT 8/9 and PSAT/NMSQT are school-administered on dates the school picks
 * within a College Board window, so those are always estimates until the school
 * confirms. The SAT dates are the ones with real registration deadlines.
 */
export const DEFAULT_ADMINISTRATIONS: readonly Administration[] = [
  {
    id: 'psat-8-9-2026',
    kind: 'psat_8_9',
    label: 'PSAT 8/9 (9th grade)',
    date: '2026-10-14',
    estimated: true,
    note: 'School-administered. Confirm the exact date with the school.',
  },
  {
    id: 'psat-nmsqt-2027',
    kind: 'psat_nmsqt',
    label: 'PSAT/NMSQT (10th grade)',
    date: '2027-10-13',
    estimated: true,
    note: 'Practice year — National Merit only counts in 11th grade.',
  },
  {
    id: 'sat-2028-03',
    kind: 'sat',
    label: 'SAT — March 2028',
    date: '2028-03-11',
    registrationDeadline: '2028-02-11',
    estimated: true,
    note: 'A possible earlier attempt, leaving May as the retake.',
  },
  {
    id: 'sat-2028-05',
    kind: 'sat',
    label: 'SAT — May 2028 (target)',
    date: DEFAULT_TARGET_TEST_DATE,
    registrationDeadline: '2028-04-06',
    estimated: true,
  },
  {
    id: 'sat-2028-06',
    kind: 'sat',
    label: 'SAT — June 2028',
    date: '2028-06-03',
    registrationDeadline: '2028-05-05',
    estimated: true,
    note: 'Retake window if the May result falls short.',
  },
] as const;

export function upcomingAdministrations(
  today: LocalDate,
  administrations: readonly Administration[] = DEFAULT_ADMINISTRATIONS
): Administration[] {
  return administrations.filter((a) => a.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

export function testDatesOnly(
  administrations: readonly Administration[] = DEFAULT_ADMINISTRATIONS
): LocalDate[] {
  return administrations.map((a) => a.date);
}
