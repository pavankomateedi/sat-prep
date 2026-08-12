import { describe, expect, it } from 'vitest';
import {
  calibrationReport,
  createScheduler,
  deriveGrade,
  emptyState,
  previewIntervals,
  retrievability,
  review,
  State,
} from './fsrs';
import {
  ELO_CONVERGENCE_ATTEMPTS,
  expectedCorrect,
  initialEloState,
  isConverged,
  kFactor,
  targetDifficulty,
  updateElo,
} from './elo';
import {
  BKT_PARAMS,
  displayedMastery,
  initialBktState,
  isMastered,
  masteredFraction,
  updateBkt,
} from './bkt';
import { evaluateWeights, optimiseParameters, shouldOptimise, type ReviewRecord } from './optimizer';

const scheduler = createScheduler({ desiredRetention: 0.9, enableFuzz: false });

describe('FSRS scheduling (T-05)', () => {
  it('schedules a new item into the future after a good review', () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const state = emptyState('s1', 'i1', now);
    expect(state.reps).toBe(0);

    const { next } = review(scheduler, state, 'good', now);
    expect(next.reps).toBe(1);
    expect(new Date(next.due).getTime()).toBeGreaterThan(now.getTime());
    expect(next.stability).toBeGreaterThan(0);
  });

  it('gives a longer interval for easy than for again', () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const state = emptyState('s1', 'i1', now);
    const intervals = previewIntervals(scheduler, state, now);

    const againDue = intervals.again.due.getTime();
    const easyDue = intervals.easy.due.getTime();
    expect(easyDue).toBeGreaterThan(againDue);
  });

  it('records no prediction on first exposure and a real one afterwards', () => {
    const first = new Date('2026-09-01T10:00:00Z');
    const state = emptyState('s1', 'i1', first);

    const firstReview = review(scheduler, state, 'good', first);
    expect(firstReview.snapshot.retrievabilityBefore).toBeNull();
    expect(firstReview.snapshot.stabilityBefore).toBeNull();

    const later = new Date('2026-09-08T10:00:00Z');
    const secondReview = review(scheduler, firstReview.next, 'good', later);
    expect(secondReview.snapshot.retrievabilityBefore).toBeGreaterThan(0);
    expect(secondReview.snapshot.retrievabilityBefore).toBeLessThanOrEqual(1);
    expect(secondReview.snapshot.elapsedDays).toBeCloseTo(7, 1);
  });

  it('decays retrievability as time passes without review', () => {
    const now = new Date('2026-09-01T10:00:00Z');
    const reviewed = review(scheduler, emptyState('s1', 'i1', now), 'good', now).next;

    const soon = retrievability(scheduler, reviewed, new Date('2026-09-02T10:00:00Z'));
    const later = retrievability(scheduler, reviewed, new Date('2026-10-01T10:00:00Z'));
    expect(soon).toBeGreaterThan(later);
  });

  it('lapses reduce stability relative to continued success', () => {
    const t0 = new Date('2026-09-01T10:00:00Z');
    const t1 = new Date('2026-09-01T10:15:00Z');
    const t2 = new Date('2026-09-05T10:00:00Z');

    // Graduate the card out of the learning steps first. FSRS only counts a
    // failure as a lapse once a card has reached the Review state; before that
    // an 'again' just walks back a learning step.
    let base = review(scheduler, emptyState('s1', 'i1', t0), 'good', t0).next;
    base = review(scheduler, base, 'good', t1).next;
    expect(base.state).toBe(State.Review);

    const kept = review(scheduler, base, 'good', t2).next;
    const lapsed = review(scheduler, base, 'again', t2).next;

    expect(lapsed.stability).toBeLessThan(kept.stability);
    expect(lapsed.lapses).toBe(base.lapses + 1);
    expect(kept.lapses).toBe(base.lapses);
  });

  it('derives grades from correctness and speed', () => {
    expect(deriveGrade(false, 30_000, 60)).toBe('again');
    expect(deriveGrade(true, 20_000, 60)).toBe('easy');
    expect(deriveGrade(true, 60_000, 60)).toBe('good');
    expect(deriveGrade(true, 120_000, 60)).toBe('hard');
  });

  it('scores calibration of predicted against observed recall', () => {
    // A perfectly calibrated stream: 90% predicted, 9 of 10 recalled.
    const reviews = Array.from({ length: 10 }, (_, i) => ({
      retrievabilityBefore: 0.9,
      correct: i < 9,
    }));
    const report = calibrationReport(reviews);
    expect(report.reviewCount).toBe(10);
    expect(report.meanAbsoluteError).toBeCloseTo(0, 5);

    // A badly calibrated stream: predicts 90%, delivers 30%.
    const bad = Array.from({ length: 10 }, (_, i) => ({
      retrievabilityBefore: 0.9,
      correct: i < 3,
    }));
    expect(calibrationReport(bad).meanAbsoluteError).toBeGreaterThan(0.5);
  });

  it('ignores first exposures when scoring calibration', () => {
    const report = calibrationReport([
      { retrievabilityBefore: null, correct: true },
      { retrievabilityBefore: null, correct: false },
    ]);
    expect(report.reviewCount).toBe(0);
  });
});

describe('Elo ability tracking (T-15)', () => {
  it('starts neutral and unconverged', () => {
    const state = initialEloState('s1', 'circles');
    expect(state.ability).toBe(0);
    expect(isConverged(state)).toBe(false);
    expect(targetDifficulty(state)).toBeNull();
  });

  it('raises ability on correct answers and lowers it on incorrect', () => {
    const state = initialEloState('s1', 'circles');
    expect(updateElo(state, 'medium', true).next.ability).toBeGreaterThan(0);
    expect(updateElo(state, 'medium', false).next.ability).toBeLessThan(0);
  });

  it('moves ability more for a correct answer on a hard item than an easy one', () => {
    const state = initialEloState('s1', 'circles');
    const hardGain = updateElo(state, 'hard', true).next.ability;
    const easyGain = updateElo(state, 'easy', true).next.ability;
    expect(hardGain).toBeGreaterThan(easyGain);
  });

  it('decays the step size as attempts accumulate', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(10));
    expect(kFactor(10)).toBeGreaterThan(kFactor(100));
    expect(kFactor(10_000)).toBeGreaterThanOrEqual(0.12);
  });

  it('converges within about 10 attempts for a consistently strong student', () => {
    let state = initialEloState('s1', 'circles');
    for (let i = 0; i < ELO_CONVERGENCE_ATTEMPTS; i += 1) {
      state = updateElo(state, 'medium', true).next;
    }
    expect(isConverged(state)).toBe(true);
    expect(state.ability).toBeGreaterThan(0.5);
    expect(targetDifficulty(state)).not.toBeNull();
  });

  it('keeps ability inside the informative band', () => {
    let state = initialEloState('s1', 'circles');
    for (let i = 0; i < 500; i += 1) state = updateElo(state, 'hard', true).next;
    expect(state.ability).toBeLessThanOrEqual(4);
  });

  it('predicts higher success against easier items', () => {
    expect(expectedCorrect(0, -0.8)).toBeGreaterThan(expectedCorrect(0, 0.8));
    expect(expectedCorrect(0, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('BKT mastery (T-16)', () => {
  it('uses non-degenerate fixed parameters', () => {
    // The standard sanity constraint: if guess + slip >= 1 the model inverts
    // and a wrong answer would raise P(known).
    expect(BKT_PARAMS.pGuess + BKT_PARAMS.pSlip).toBeLessThan(1);
  });

  it('raises P(known) on correct answers and lowers it on incorrect', () => {
    const state = initialBktState('s1', 'circles');
    expect(updateBkt(state, true).pKnown).toBeGreaterThan(state.pKnown);

    // Take the state somewhere confident first, so the learning transition
    // doesn't mask the drop.
    let confident = state;
    for (let i = 0; i < 6; i += 1) confident = updateBkt(confident, true);
    expect(updateBkt(confident, false).pKnown).toBeLessThan(confident.pKnown);
  });

  it('approaches but never exceeds certainty', () => {
    let state = initialBktState('s1', 'circles');
    for (let i = 0; i < 50; i += 1) state = updateBkt(state, true);
    expect(state.pKnown).toBeGreaterThan(0.95);
    expect(state.pKnown).toBeLessThanOrEqual(1);
  });

  it('decays displayed mastery by retrievability', () => {
    let state = initialBktState('s1', 'circles');
    for (let i = 0; i < 20; i += 1) state = updateBkt(state, true);

    // Known but not currently retrievable must not read as mastered — the
    // whole point of pairing BKT with FSRS.
    expect(displayedMastery(state, 1)).toBeCloseTo(state.pKnown, 6);
    expect(displayedMastery(state, 0.5)).toBeLessThan(state.pKnown);
    expect(isMastered(state, 1)).toBe(true);
    expect(isMastered(state, 0.3)).toBe(false);
  });

  it('computes the mastered fraction across all skills', () => {
    let learned = initialBktState('s1', 'circles');
    for (let i = 0; i < 20; i += 1) learned = updateBkt(learned, true);
    const fresh = initialBktState('s1', 'percentages');

    const fraction = masteredFraction(
      [
        { state: learned, retrievability: 1 },
        { state: fresh, retrievability: 1 },
      ],
      4
    );
    expect(fraction).toBeCloseTo(0.25, 6);
  });
});

describe('FSRS parameter optimisation (T-17)', () => {
  /** Deterministic pseudo-random history, so the test is reproducible. */
  function buildHistory(count: number, accuracy: number): ReviewRecord[] {
    const records: ReviewRecord[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const start = new Date('2026-09-01T10:00:00Z').getTime();
    for (let i = 0; i < count; i += 1) {
      const correct = rand() < accuracy;
      records.push({
        itemId: `item-${i % 25}`,
        answeredAt: new Date(start + i * 6 * 3600_000).toISOString(),
        grade: correct ? 'good' : 'again',
        correct,
      });
    }
    return records;
  }

  it('refuses to fit below the minimum review count', () => {
    const result = optimiseParameters(buildHistory(40, 0.85), 0.9);
    expect(result.adopted).toBe(false);
    expect(result.weights).toHaveLength(21);
    expect(result.reason).toMatch(/need 100/);
  });

  it('gates re-optimisation on review count and elapsed time', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    expect(shouldOptimise(50, null, now)).toBe(false);
    expect(shouldOptimise(150, null, now)).toBe(true);
    expect(shouldOptimise(150, '2026-11-25T00:00:00Z', now)).toBe(false);
    expect(shouldOptimise(150, '2026-10-01T00:00:00Z', now)).toBe(true);
  });

  it('scores weights by log loss over post-first-exposure reviews only', () => {
    const history = buildHistory(120, 0.85);
    const { logLoss, scored } = evaluateWeights(history, undefined as never, 0.9);
    // 120 reviews over 25 distinct items: 25 first exposures are unscored.
    expect(scored).toBe(120 - 25);
    expect(logLoss).toBeGreaterThan(0);
    expect(Number.isFinite(logLoss)).toBe(true);
  });

  it('produces a usable weight vector and an honest adoption decision', () => {
    const result = optimiseParameters(buildHistory(160, 0.85), 0.9);

    expect(result.reviewCount).toBe(160);
    expect(result.weights).toHaveLength(21);
    for (const w of result.weights) expect(Number.isFinite(w)).toBe(true);

    // Whatever it decides, the decision must be grounded in a real comparison
    // against the defaults on data the fit never saw.
    expect(Number.isFinite(result.holdoutLogLoss)).toBe(true);
    expect(Number.isFinite(result.baselineLogLoss)).toBe(true);
    expect(result.adopted).toBe(result.holdoutLogLoss < result.baselineLogLoss);
  });
});
