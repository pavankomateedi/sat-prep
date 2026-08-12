/**
 * T-12 / T-20 — The parent viewer.
 *
 * PRD §3 point 8 notes that parent visibility is an afterthought in every
 * reviewed competitor, and calls it a clear differentiation opportunity — the
 * parent here is the person paying for and championing the product.
 *
 * But the parent user stories in §2.1 are equally clear about the limit:
 *
 *   "As the parent, I do **not** want a feed of every single question the
 *    student got wrong — that level of detail belongs to the student, not a
 *    surveillance dashboard."
 *
 * So this module builds aggregates and nothing else. Everything it emits passes
 * `screenParentPayload` before it can be stored or synced, and the Postgres RLS
 * policies deny the parent role access to `attempts` outright. Three
 * independent layers, because the trust this feature depends on is not
 * something to protect with a UI conditional.
 */

import type { DomainId } from '../domain/taxonomy';
import { ALL_DOMAINS, getDomain } from '../domain/taxonomy';
import type { FullLengthTestResult, WeeklySummary } from '../domain/types';
import {
  addDays,
  currentMissedStreak,
  startOfWeek,
  toLocalDate,
  weekDates,
  type LocalDate,
} from '../lib/dates';
import { screenParentPayload } from '../privacy/policy';

export const ADHERENCE = {
  /** Consecutive missed days that warrant a "check in" nudge to the parent. */
  alertAfterMissedDays: 3,
  /** Days practised in a week at or above which the week reads as on track. */
  healthyWeekDays: 5,
} as const;

export interface SummaryInput {
  studentId: string;
  /** Any date inside the week to summarise. */
  weekOf: LocalDate;
  /** Local dates on which a session was completed. */
  practisedDates: ReadonlySet<LocalDate>;
  /** Minutes actually spent, keyed by local date. */
  minutesByDate: ReadonlyMap<LocalDate, number>;
  /** Displayed mastery per domain at the end of this week, 0-1. */
  masteryByDomain: ReadonlyMap<DomainId, number>;
  /** The same, at the end of the previous week. */
  previousMasteryByDomain: ReadonlyMap<DomainId, number>;
  latestResult: FullLengthTestResult | null;
  programStartDate: LocalDate;
  now?: Date;
}

/**
 * Build the parent's weekly view.
 *
 * Reports adherence and domain movement — the two things the parent stories ask
 * for — and deliberately nothing at item level.
 */
export function buildWeeklySummary(input: SummaryInput): WeeklySummary {
  const now = input.now ?? new Date();
  const weekStart = startOfWeek(input.weekOf);
  const dates = weekDates(weekStart);

  const practisedThisWeek = dates.filter((d) => input.practisedDates.has(d));
  const totalMinutes = dates.reduce((sum, d) => sum + (input.minutesByDate.get(d) ?? 0), 0);

  // Measured from the day after the week ends, so a summary for a past week
  // reports that week's streak rather than today's.
  const streakAnchor = addDays(weekStart, 7);
  const missedStreak = currentMissedStreak(
    input.practisedDates,
    streakAnchor,
    input.programStartDate
  );

  const domainTrends = ALL_DOMAINS.map((domain) => {
    const current = input.masteryByDomain.get(domain.id) ?? 0;
    const previous = input.previousMasteryByDomain.get(domain.id) ?? 0;
    return {
      domain: domain.id,
      masteryPercent: Math.round(current * 100),
      deltaFromPreviousWeek: Math.round((current - previous) * 100),
    };
  });

  const summary: WeeklySummary = {
    studentId: input.studentId,
    weekStart,
    daysPracticed: practisedThisWeek.length,
    daysInWeek: dates.length,
    totalMinutes,
    currentMissedStreak: missedStreak,
    domainTrends,
    latestScore: input.latestResult
      ? {
          totalScaled: input.latestResult.totalScaled,
          confidenceHalfWidth: input.latestResult.confidenceHalfWidth,
          takenOn: input.latestResult.takenOn,
        }
      : null,
    adherenceAlert:
      missedStreak >= ADHERENCE.alertAfterMissedDays
        ? `${missedStreak} days in a row without a session — worth a check-in.`
        : null,
    generatedAt: now.toISOString(),
  };

  // The guarantee, enforced rather than promised: nothing item-level, no PII.
  const violations = screenParentPayload(summary as unknown as Record<string, unknown>);
  if (violations.length > 0) {
    throw new Error(
      `Parent summary would expose data outside the agreed scope:\n` +
        violations.map((v) => `  - ${v.path}: ${v.detail}`).join('\n')
    );
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export interface RenderedSummary {
  headline: string;
  adherenceLine: string;
  /** Score as a range, never a bare point estimate (PRD §2.6). */
  scoreLine: string | null;
  improving: { domain: DomainId; name: string; delta: number }[];
  needsWork: { domain: DomainId; name: string; delta: number }[];
  alert: string | null;
}

/**
 * Turn a summary into the sentences the parent actually reads.
 *
 * Two deliberate choices carried over from PRD §2.6: the score is always a
 * range, and a weak week is described plainly without either alarm or spin.
 */
export function renderSummary(summary: WeeklySummary): RenderedSummary {
  const { daysPracticed, daysInWeek, totalMinutes } = summary;

  const headline =
    daysPracticed >= ADHERENCE.healthyWeekDays
      ? `Practised ${daysPracticed} of ${daysInWeek} days.`
      : `Practised ${daysPracticed} of ${daysInWeek} days this week.`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeSpent =
    hours > 0 ? `${hours}h ${minutes}m of practice` : `${minutes} minutes of practice`;

  const scoreLine = summary.latestScore
    ? `Most recent practice test: ${
        summary.latestScore.totalScaled - summary.latestScore.confidenceHalfWidth
      }-${
        summary.latestScore.totalScaled + summary.latestScore.confidenceHalfWidth
      } (taken ${summary.latestScore.takenOn}).`
    : null;

  const withNames = summary.domainTrends.map((t) => ({
    domain: t.domain,
    name: getDomain(t.domain).name,
    delta: t.deltaFromPreviousWeek,
  }));

  const improving = withNames
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  const needsWork = withNames
    .filter((d) => d.delta <= 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  return {
    headline,
    adherenceLine: `${timeSpent} logged.`,
    scoreLine,
    improving,
    needsWork,
    alert: summary.adherenceAlert,
  };
}

// ---------------------------------------------------------------------------
// T-20 — Scheduling
// ---------------------------------------------------------------------------

export const DIGEST = {
  /** Generated for the week just ended, on Monday. */
  generateOnWeekday: 1,
} as const;

/**
 * Whether a digest is owed for the most recently completed week.
 *
 * Idempotent by design: it asks whether a digest exists for that specific week,
 * not when one last ran. A background task that fires twice, or a device that
 * was offline all weekend and catches up on Tuesday, still produces exactly one
 * digest per week.
 */
export function pendingDigestWeek(
  today: LocalDate,
  generatedWeeks: ReadonlySet<LocalDate>,
  programStartDate: LocalDate
): LocalDate | null {
  const lastCompletedWeekStart = addDays(startOfWeek(today), -7);
  if (lastCompletedWeekStart < startOfWeek(programStartDate)) return null;
  if (generatedWeeks.has(lastCompletedWeekStart)) return null;
  return lastCompletedWeekStart;
}

/** All weeks since the program began that still have no digest. */
export function missingDigestWeeks(
  today: LocalDate,
  generatedWeeks: ReadonlySet<LocalDate>,
  programStartDate: LocalDate,
  limit = 8
): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = addDays(startOfWeek(today), -7);
  const earliest = startOfWeek(programStartDate);

  while (cursor >= earliest && out.length < limit) {
    if (!generatedWeeks.has(cursor)) out.push(cursor);
    cursor = addDays(cursor, -7);
  }

  return out;
}

export { toLocalDate };
