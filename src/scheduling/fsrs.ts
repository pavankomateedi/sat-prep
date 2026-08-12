/**
 * T-05 — FSRS-6 scheduling.
 *
 * Why FSRS rather than SM-2: per the SRS Benchmark project (727M+ reviews),
 * even a zero-parameter FSRS beats SM-2 by roughly 3x on calibration accuracy.
 * And unlike an IRT difficulty model, FSRS needs only *this* student's own
 * review history to work — which is the whole constraint here (PRD §2.3).
 *
 * This module wraps `ts-fsrs` rather than reimplementing the algorithm. That
 * matters for T-17: the optimiser replays history through this same wrapper, so
 * it necessarily optimises the exact model the app schedules with, instead of a
 * hand-rolled copy that could drift from it.
 */

import {
  createEmptyCard,
  default_w,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import type { FsrsGrade, FsrsState } from '../domain/types';

/** FSRS-6 published defaults, used until a per-student fit earns its place. */
export const DEFAULT_FSRS_WEIGHTS: readonly number[] = default_w;

export const GRADE_TO_RATING: Record<FsrsGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const RATING_TO_GRADE: Record<number, FsrsGrade> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
};

export interface SchedulerOptions {
  /** Target probability of recall at review time. Set per phase (PRD §2.3). */
  desiredRetention: number;
  /** Per-student weights from T-17, or the published defaults. */
  weights?: readonly number[];
  /**
   * Interval fuzz spreads due dates so reviews don't clump on one day. Off in
   * tests so scheduling is deterministic; on in the app, where a lumpy review
   * calendar would make some days impossible to fit into 30 minutes.
   */
  enableFuzz?: boolean;
  maximumIntervalDays?: number;
}

export function createScheduler(options: SchedulerOptions): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: options.desiredRetention,
      w: options.weights ?? DEFAULT_FSRS_WEIGHTS,
      enable_fuzz: options.enableFuzz ?? true,
      // 5 years. Beyond the program's two-year horizon anything longer is
      // equivalent to "never again", so the cap costs nothing and guards
      // against a runaway interval hiding an item for the rest of the program.
      maximum_interval: options.maximumIntervalDays ?? 1825,
    })
  );
}

// ---------------------------------------------------------------------------
// State <-> Card conversion
// ---------------------------------------------------------------------------

export function emptyState(studentId: string, itemId: string, now = new Date()): FsrsState {
  const card = createEmptyCard(now);
  return cardToState(studentId, itemId, card);
}

export function cardToState(studentId: string, itemId: string, card: Card): FsrsState {
  return {
    studentId,
    itemId,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    scheduledDays: card.scheduled_days,
    elapsedDays: card.elapsed_days,
    learningSteps: card.learning_steps,
  };
}

export function stateToCard(state: FsrsState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    ...(state.lastReview ? { last_review: new Date(state.lastReview) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

export interface ReviewOutcome {
  next: FsrsState;
  /** Model state *before* the review, recorded on the Attempt for T-17. */
  snapshot: {
    stabilityBefore: number | null;
    difficultyBefore: number | null;
    retrievabilityBefore: number | null;
    elapsedDays: number;
  };
}

/** Probability the student still recalls this item right now, 0-1. */
export function retrievability(
  scheduler: FSRS,
  state: FsrsState,
  now = new Date()
): number {
  if (state.reps === 0 || !state.lastReview) return 0;
  return scheduler.get_retrievability(stateToCard(state), now, false);
}

/** Whole days between the last review and now; 0 for a first exposure. */
export function elapsedDaysSinceReview(state: FsrsState, now = new Date()): number {
  if (!state.lastReview) return 0;
  const ms = now.getTime() - new Date(state.lastReview).getTime();
  return Math.max(0, ms / 86_400_000);
}

/**
 * Apply a grade and produce the next scheduling state.
 *
 * The pre-review snapshot is captured before `next()` runs, because that is the
 * model's actual prediction at the moment of test — the only version of it that
 * is any use for later calibration checking or parameter fitting.
 */
export function review(
  scheduler: FSRS,
  state: FsrsState,
  grade: FsrsGrade,
  now = new Date()
): ReviewOutcome {
  const isFirstExposure = state.reps === 0 || !state.lastReview;
  const snapshot = {
    stabilityBefore: isFirstExposure ? null : state.stability,
    difficultyBefore: isFirstExposure ? null : state.difficulty,
    retrievabilityBefore: isFirstExposure ? null : retrievability(scheduler, state, now),
    elapsedDays: elapsedDaysSinceReview(state, now),
  };

  const { card } = scheduler.next(stateToCard(state), now, GRADE_TO_RATING[grade]);
  return { next: cardToState(state.studentId, state.itemId, card), snapshot };
}

/** Preview the interval each grade would produce, for the "next review" hint. */
export function previewIntervals(
  scheduler: FSRS,
  state: FsrsState,
  now = new Date()
): Record<FsrsGrade, { due: Date; scheduledDays: number }> {
  const preview = scheduler.repeat(stateToCard(state), now);
  const out = {} as Record<FsrsGrade, { due: Date; scheduledDays: number }>;
  for (const item of preview) {
    const grade = RATING_TO_GRADE[item.log.rating];
    if (grade) out[grade] = { due: item.card.due, scheduledDays: item.card.scheduled_days };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Derive an FSRS grade from what the app already observes.
 *
 * FSRS expects a self-report ("was that easy or hard?"). Asking a teenager to
 * rate every one of ~20 daily items would add friction to the exact loop the
 * whole design depends on them repeating for two years, so the grade is
 * inferred from correctness and speed instead, with a manual override available
 * in the UI.
 *
 * The speed thresholds are a *design choice, not a validated finding* — there
 * is no evidence base setting them. They are deliberately coarse, and the
 * calibration report (§calibration below) is what tells us whether they work
 * for this student.
 */
export const SPEED_THRESHOLDS = {
  /** Under this fraction of the expected time, a correct answer reads as easy. */
  easyFraction: 0.5,
  /** Over this multiple of expected time, a correct answer reads as effortful. */
  hardMultiple: 1.5,
} as const;

export function deriveGrade(
  correct: boolean,
  responseTimeMs: number,
  estimatedSeconds: number
): FsrsGrade {
  if (!correct) return 'again';
  const expectedMs = estimatedSeconds * 1000;
  if (responseTimeMs <= expectedMs * SPEED_THRESHOLDS.easyFraction) return 'easy';
  if (responseTimeMs >= expectedMs * SPEED_THRESHOLDS.hardMultiple) return 'hard';
  return 'good';
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export interface CalibrationBin {
  /** Midpoint of the predicted-recall bucket, e.g. 0.85 for the 0.8-0.9 bin. */
  predicted: number;
  /** Share actually recalled in that bucket. */
  observed: number;
  count: number;
}

export interface CalibrationReport {
  bins: CalibrationBin[];
  /** Mean |predicted - observed| weighted by bin size. 0 is perfect. */
  meanAbsoluteError: number;
  /** Brier score over individual reviews; lower is better. */
  brierScore: number;
  reviewCount: number;
}

/**
 * Compare what the scheduler predicted against what actually happened.
 *
 * This is the cheap test for riskiest-assumption #3 in the PRD's closing
 * section: does FSRS with published defaults actually work for this one student
 * before there is enough history to fit their own parameters? The data needed
 * is already being logged for T-05, so the check costs nothing extra.
 */
export function calibrationReport(
  reviews: { retrievabilityBefore: number | null; correct: boolean }[],
  binCount = 10
): CalibrationReport {
  const usable = reviews.filter(
    (r): r is { retrievabilityBefore: number; correct: boolean } =>
      r.retrievabilityBefore !== null
  );

  const bins: { sumPredicted: number; correct: number; count: number }[] = Array.from(
    { length: binCount },
    () => ({ sumPredicted: 0, correct: 0, count: 0 })
  );

  let brierSum = 0;
  for (const r of usable) {
    const p = Math.min(Math.max(r.retrievabilityBefore, 0), 1);
    const index = Math.min(binCount - 1, Math.floor(p * binCount));
    const bin = bins[index]!;
    bin.sumPredicted += p;
    bin.correct += r.correct ? 1 : 0;
    bin.count += 1;
    brierSum += (p - (r.correct ? 1 : 0)) ** 2;
  }

  const populated = bins
    .map((b) => ({
      predicted: b.count > 0 ? b.sumPredicted / b.count : 0,
      observed: b.count > 0 ? b.correct / b.count : 0,
      count: b.count,
    }))
    .filter((b) => b.count > 0);

  const total = usable.length;
  const mae =
    total === 0
      ? 0
      : populated.reduce((sum, b) => sum + Math.abs(b.predicted - b.observed) * b.count, 0) /
        total;

  return {
    bins: populated,
    meanAbsoluteError: mae,
    brierScore: total === 0 ? 0 : brierSum / total,
    reviewCount: total,
  };
}

export { Rating, State };
