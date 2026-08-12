import { describe, expect, it } from 'vitest';
import { TUNING, totalMinutes, tuneBudgets, type ObservedPacing } from './budgetTuning';
import { PHASE_BUDGETS, SESSION_MINUTES } from './phases';

const steady: ObservedPacing = {
  sessions: 40,
  meanActualSeconds: 1800,
  meanPlannedSeconds: 1800,
  errorRetryFailureRate: 0.2,
  unservedDueRate: 0.05,
};

describe('minute-budget tuning (V2, PRD §2.2)', () => {
  it('refuses to tune on thin evidence', () => {
    const result = tuneBudgets('A', { ...steady, sessions: 5 });
    expect(result.applied).toBe(false);
    expect(result.pacingScale).toBe(1);
    expect(result.minutes).toEqual(PHASE_BUDGETS.A.minutes);
    expect(result.adjustments[0]).toMatch(/need 21/);
  });

  it('leaves a well-paced schedule alone', () => {
    const result = tuneBudgets('A', steady);
    expect(result.applied).toBe(true);
    expect(result.pacingScale).toBe(1);
    expect(result.minutes).toEqual(PHASE_BUDGETS.A.minutes);
    expect(result.adjustments[0]).toMatch(/tracking the plan/);
  });

  it('serves fewer items when sessions consistently overrun', () => {
    const result = tuneBudgets('A', { ...steady, meanActualSeconds: 2200 });
    expect(result.pacingScale).toBeGreaterThan(1);
    expect(result.adjustments.join(' ')).toMatch(/run \d+% long/);
  });

  it('serves more items when sessions finish early', () => {
    const result = tuneBudgets('A', { ...steady, meanActualSeconds: 1500 });
    expect(result.pacingScale).toBeLessThan(1);
    expect(result.adjustments.join(' ')).toMatch(/finish \d+% early/);
  });

  it('ignores small pacing drift as noise', () => {
    const result = tuneBudgets('A', { ...steady, meanActualSeconds: 1870 });
    expect(result.pacingScale).toBe(1);
  });

  it('bounds the pacing correction in both directions', () => {
    const slow = tuneBudgets('A', { ...steady, meanActualSeconds: 9000 });
    const fast = tuneBudgets('A', { ...steady, meanActualSeconds: 200 });
    expect(slow.pacingScale).toBeLessThanOrEqual(TUNING.maxPacingScale);
    expect(fast.pacingScale).toBeGreaterThanOrEqual(TUNING.minPacingScale);
  });

  it('gives error review more time when retried mistakes keep failing', () => {
    const result = tuneBudgets('A', { ...steady, errorRetryFailureRate: 0.6 });
    expect(result.minutes.error_review).toBeGreaterThan(PHASE_BUDGETS.A.minutes.error_review);
    expect(result.adjustments.join(' ')).toMatch(/still wrong/);
  });

  it('gives warm-up more time when due reviews do not fit', () => {
    const result = tuneBudgets('A', { ...steady, unservedDueRate: 0.4 });
    expect(result.minutes.warmup).toBeGreaterThan(PHASE_BUDGETS.A.minutes.warmup);
  });

  it('always keeps the session at exactly 30 minutes', () => {
    const cases: ObservedPacing[] = [
      steady,
      { ...steady, errorRetryFailureRate: 0.9, unservedDueRate: 0.9 },
      { ...steady, meanActualSeconds: 3000, errorRetryFailureRate: 0.8 },
    ];
    for (const phase of ['A', 'B', 'C', 'D'] as const) {
      for (const observed of cases) {
        expect(totalMinutes(tuneBudgets(phase, observed).minutes)).toBe(SESSION_MINUTES);
      }
    }
  });

  it('never starves new-skill time, however loud the backlog', () => {
    for (const phase of ['A', 'B', 'C', 'D'] as const) {
      const result = tuneBudgets(phase, {
        ...steady,
        errorRetryFailureRate: 0.95,
        unservedDueRate: 0.95,
      });
      expect(result.minutes.new_skill, `phase ${phase}`).toBeGreaterThanOrEqual(2);
    }
  });
});
