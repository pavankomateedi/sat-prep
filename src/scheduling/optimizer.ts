/**
 * T-17 — Per-student FSRS parameter optimisation.
 *
 * FSRS ships with population defaults; after roughly 100 reviews there is
 * enough of this student's own history to do better. The upstream optimiser is
 * a native Rust binding that cannot run in React Native, so this is a pure-TS
 * implementation that runs on-device and offline.
 *
 * Three safeguards, all of them there because n=1 makes overfitting the default
 * outcome rather than an edge case:
 *
 *  1. **Chronological hold-out.** The last slice of reviews is never trained on.
 *     A random split would leak, because reviews of the same item are
 *     correlated and later reviews depend on earlier scheduling decisions.
 *  2. **Regularisation toward the published defaults**, weighted by how little
 *     history exists. With 100 reviews the fit barely moves; with 2,000 it is
 *     mostly free. This encodes "the population prior is better than a
 *     confident fit to noise".
 *  3. **Adopt only on a hold-out win.** If the fitted weights do not beat the
 *     defaults on data they never saw, they are discarded and the app keeps
 *     using the defaults. A failed optimisation run is a normal outcome, not
 *     an error.
 *
 * The forward model is `ts-fsrs` itself rather than a reimplementation of the
 * FSRS-6 equations, so the optimiser necessarily scores the exact scheduler the
 * app runs — no risk of tuning a lookalike model that has drifted.
 */

import { clipParameters, default_w } from 'ts-fsrs';
import type { FsrsGrade } from '../domain/types';
import { createScheduler, emptyState, retrievability, review } from './fsrs';

/** One graded review, as replayed by the optimiser. */
export interface ReviewRecord {
  itemId: string;
  /** ISO timestamp. Records are sorted by this before replay. */
  answeredAt: string;
  grade: FsrsGrade;
  correct: boolean;
}

export const OPTIMIZER_CONFIG = {
  /** Below this, the defaults are better than anything we could fit. */
  minReviews: 100,
  /** Fraction of history held out, chronologically. */
  holdoutFraction: 0.2,
  /** Full passes over the parameter vector. */
  maxRounds: 6,
  /** Step sizes tried per parameter, as a fraction of its plausible range. */
  stepFractions: [0.15, 0.05, 0.015] as const,
  /**
   * Regularisation strength at exactly `minReviews`. Scales as
   * minReviews/reviewCount, so it fades as evidence accumulates.
   */
  baseRegularisation: 0.02,
  /** Re-run cadence once the first optimisation has succeeded. */
  reoptimiseAfterDays: 30,
} as const;

/**
 * Legal ranges per parameter. `clipParameters` enforces FSRS's own hard limits;
 * these are the search bounds, kept deliberately tight around the defaults so
 * coordinate descent cannot wander somewhere the clipper would just undo.
 */
function searchBounds(index: number): { lo: number; hi: number } {
  const d = default_w[index] ?? 0;
  const span = Math.max(Math.abs(d) * 1.5, 0.5);
  return { lo: d - span, hi: d + span };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const EPSILON = 1e-6;

/**
 * Mean binary log loss of predicted recall against what actually happened.
 *
 * Only reviews *after* an item's first exposure are scored: on a first sight
 * the model has no memory state and therefore makes no prediction, so including
 * those would score the item bank's difficulty rather than the scheduler.
 */
export function evaluateWeights(
  history: ReviewRecord[],
  weights: readonly number[],
  desiredRetention: number
): { logLoss: number; scored: number } {
  // Fuzz is disabled: it randomises due dates, which would make an identical
  // parameter vector score differently on each run and break the descent.
  const scheduler = createScheduler({
    desiredRetention,
    weights,
    enableFuzz: false,
  });

  const states = new Map<string, ReturnType<typeof emptyState>>();
  let sum = 0;
  let scored = 0;

  for (const record of history) {
    const now = new Date(record.answeredAt);
    let state = states.get(record.itemId);

    if (state) {
      const predicted = Math.min(Math.max(retrievability(scheduler, state, now), EPSILON), 1 - EPSILON);
      sum += record.correct ? -Math.log(predicted) : -Math.log(1 - predicted);
      scored += 1;
    } else {
      state = emptyState('optimiser', record.itemId, now);
    }

    state = review(scheduler, state, record.grade, now).next;
    states.set(record.itemId, state);
  }

  return { logLoss: scored === 0 ? Number.POSITIVE_INFINITY : sum / scored, scored };
}

/** Training objective: fit plus a pull toward the population defaults. */
function penalisedLoss(
  history: ReviewRecord[],
  weights: readonly number[],
  desiredRetention: number,
  regularisation: number
): number {
  const { logLoss } = evaluateWeights(history, weights, desiredRetention);
  if (!Number.isFinite(logLoss)) return Number.POSITIVE_INFINITY;

  let penalty = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const w = weights[i] ?? 0;
    const d = default_w[i] ?? 0;
    const { lo, hi } = searchBounds(i);
    const scale = hi - lo || 1;
    // Scaled so parameters with different natural magnitudes are penalised
    // comparably; an unscaled L2 would effectively pin the large ones.
    penalty += ((w - d) / scale) ** 2;
  }

  return logLoss + regularisation * penalty;
}

// ---------------------------------------------------------------------------
// Optimisation
// ---------------------------------------------------------------------------

export interface OptimisationResult {
  /** True when the fitted weights beat the defaults out of sample. */
  adopted: boolean;
  /** The weights to use going forward — fitted if adopted, defaults if not. */
  weights: readonly number[];
  reviewCount: number;
  trainLogLoss: number;
  /** Hold-out loss of the fitted weights. */
  holdoutLogLoss: number;
  /** Hold-out loss of the published defaults, for comparison. */
  baselineLogLoss: number;
  reason: string;
}

/**
 * Fit FSRS weights to this student's history.
 *
 * Bounded coordinate descent: for each parameter, try a step up and down at
 * decreasing sizes and keep whichever improves the penalised training loss.
 * Chosen over gradient descent because the forward model is a black-box replay
 * with no analytic gradient, and over a full global search because 21
 * dimensions and a few hundred data points do not justify one.
 */
export function optimiseParameters(
  history: ReviewRecord[],
  desiredRetention: number
): OptimisationResult {
  const sorted = [...history].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const reviewCount = sorted.length;

  const defaults = [...default_w];

  if (reviewCount < OPTIMIZER_CONFIG.minReviews) {
    return {
      adopted: false,
      weights: default_w,
      reviewCount,
      trainLogLoss: Number.NaN,
      holdoutLogLoss: Number.NaN,
      baselineLogLoss: Number.NaN,
      reason: `Only ${reviewCount} reviews; need ${OPTIMIZER_CONFIG.minReviews} before fitting.`,
    };
  }

  const splitAt = Math.floor(reviewCount * (1 - OPTIMIZER_CONFIG.holdoutFraction));
  const train = sorted.slice(0, splitAt);
  const holdout = sorted.slice(splitAt);

  const regularisation =
    OPTIMIZER_CONFIG.baseRegularisation * (OPTIMIZER_CONFIG.minReviews / reviewCount);

  let best = defaults.slice();
  let bestLoss = penalisedLoss(train, best, desiredRetention, regularisation);

  for (let round = 0; round < OPTIMIZER_CONFIG.maxRounds; round += 1) {
    let improvedThisRound = false;

    for (let i = 0; i < best.length; i += 1) {
      const { lo, hi } = searchBounds(i);
      const range = hi - lo;

      for (const fraction of OPTIMIZER_CONFIG.stepFractions) {
        const step = range * fraction;

        for (const direction of [1, -1]) {
          const candidate = best.slice();
          const moved = (candidate[i] ?? 0) + direction * step;
          candidate[i] = Math.min(Math.max(moved, lo), hi);
          if (candidate[i] === best[i]) continue;

          // Keep the vector inside FSRS's own legal region, so we never score a
          // parameter set the scheduler would silently reject at runtime.
          const clipped = clipParameters(candidate, 0);
          const loss = penalisedLoss(train, clipped, desiredRetention, regularisation);

          if (loss < bestLoss - 1e-9) {
            best = clipped;
            bestLoss = loss;
            improvedThisRound = true;
          }
        }
      }
    }

    if (!improvedThisRound) break;
  }

  const fitted = evaluateWeights(holdout, best, desiredRetention);
  const baseline = evaluateWeights(holdout, defaults, desiredRetention);
  const adopted = fitted.logLoss < baseline.logLoss;

  return {
    adopted,
    weights: adopted ? best : default_w,
    reviewCount,
    trainLogLoss: bestLoss,
    holdoutLogLoss: fitted.logLoss,
    baselineLogLoss: baseline.logLoss,
    reason: adopted
      ? `Fitted weights beat defaults on held-out data (${fitted.logLoss.toFixed(4)} vs ${baseline.logLoss.toFixed(4)}).`
      : `Fitted weights did not beat defaults out of sample (${fitted.logLoss.toFixed(4)} vs ${baseline.logLoss.toFixed(4)}); keeping defaults.`,
  };
}

/** Whether it is time to run (or re-run) optimisation. */
export function shouldOptimise(
  reviewCount: number,
  lastOptimisedAt: string | null,
  now = new Date()
): boolean {
  if (reviewCount < OPTIMIZER_CONFIG.minReviews) return false;
  if (!lastOptimisedAt) return true;
  const days = (now.getTime() - new Date(lastOptimisedAt).getTime()) / 86_400_000;
  return days >= OPTIMIZER_CONFIG.reoptimiseAfterDays;
}
