/**
 * V2 — Tuning the minute budgets against this student's own data.
 *
 * PRD §2.2 is unusually candid about the Phase A–D table: "no study specifies
 * exact minute allocations for a 30-minute daily SAT session, so these numbers
 * are a starting design, meant to be tuned against the student's own actual
 * mastery data over time." §2.8 then schedules that tuning for V2, and the
 * closing section names it as riskiest-assumption #2 with an explicit cheap
 * test: instrument from day one, then compare.
 *
 * This is that comparison. Two independent adjustments:
 *
 *  1. **Pacing.** If sessions consistently overrun or underrun 30 minutes, the
 *     per-item time estimates are wrong, not the student. Scale the budget so a
 *     session actually fits — otherwise the thirty-minute promise quietly
 *     becomes forty, and the habit is what breaks.
 *
 *  2. **Mix.** If a block is doing disproportionate work — an error queue that
 *     never drains, or new material outrunning retention — shift minutes toward
 *     it, within bounds.
 *
 * Everything is bounded and reversible. The defaults are a considered starting
 * point, and drifting far from them on a few weeks of noisy data would be worse
 * than leaving them alone.
 */

import type { BlockKind, ProgramPhase } from './types';
import { PHASE_BUDGETS, SESSION_MINUTES } from './phases';

export interface ObservedPacing {
  /** Completed sessions considered. */
  sessions: number;
  /** Mean actual seconds per completed session. */
  meanActualSeconds: number;
  /** Mean planned seconds for those sessions. */
  meanPlannedSeconds: number;
  /** Share of error-review items still answered incorrectly on the retry. */
  errorRetryFailureRate: number;
  /** Share of due reviews the composer could not fit into the warm-up budget. */
  unservedDueRate: number;
}

export const TUNING = {
  /** Minimum completed sessions before any adjustment is considered. */
  minSessions: 21,
  /** Ignore pacing drift smaller than this — it is noise, not signal. */
  pacingDeadband: 0.08,
  /** Hard bounds on the scaling applied to per-item time estimates. */
  minPacingScale: 0.7,
  maxPacingScale: 1.4,
  /** Most minutes that may be moved between blocks. */
  maxMinuteShift: 4,
  /** Error-retry failure rate above which error review earns more time. */
  errorPressureThreshold: 0.4,
  /** Share of due reviews going unserved before warm-up earns more time. */
  duePressureThreshold: 0.25,
} as const;

export interface TuningResult {
  /**
   * Multiplier for `estimatedSeconds` when budgeting. Above 1 means the student
   * is slower than the item estimates assume.
   */
  pacingScale: number;
  minutes: Record<BlockKind, number>;
  adjustments: string[];
  /** False when there is not yet enough evidence to change anything. */
  applied: boolean;
}

/**
 * Derive tuned budgets from observed behaviour.
 *
 * Returns the phase defaults untouched when evidence is thin — the honest
 * outcome for the first few weeks, and the common case for a while after.
 */
export function tuneBudgets(phase: ProgramPhase, observed: ObservedPacing): TuningResult {
  const base = PHASE_BUDGETS[phase].minutes;
  const adjustments: string[] = [];

  if (observed.sessions < TUNING.minSessions || observed.meanPlannedSeconds <= 0) {
    return {
      pacingScale: 1,
      minutes: { ...base },
      adjustments: [
        `Only ${observed.sessions} completed sessions; need ${TUNING.minSessions} before tuning.`,
      ],
      applied: false,
    };
  }

  // --- pacing -------------------------------------------------------------
  const ratio = observed.meanActualSeconds / observed.meanPlannedSeconds;
  let pacingScale = 1;

  if (Math.abs(ratio - 1) > TUNING.pacingDeadband) {
    pacingScale = clamp(ratio, TUNING.minPacingScale, TUNING.maxPacingScale);
    adjustments.push(
      ratio > 1
        ? `Sessions run ${Math.round((ratio - 1) * 100)}% long; serving fewer items per block.`
        : `Sessions finish ${Math.round((1 - ratio) * 100)}% early; serving more items per block.`
    );
  }

  // --- mix ----------------------------------------------------------------
  const minutes: Record<BlockKind, number> = { ...base };

  if (observed.errorRetryFailureRate > TUNING.errorPressureThreshold) {
    const shift = moveMinutes(minutes, 'new_skill', 'error_review', 2);
    if (shift > 0) {
      adjustments.push(
        `${Math.round(observed.errorRetryFailureRate * 100)}% of retried mistakes are still wrong; ` +
          `${shift} more minutes on error review.`
      );
    }
  }

  if (observed.unservedDueRate > TUNING.duePressureThreshold) {
    const shift = moveMinutes(minutes, 'new_skill', 'warmup', 2);
    if (shift > 0) {
      adjustments.push(
        `${Math.round(observed.unservedDueRate * 100)}% of due reviews are not fitting; ` +
          `${shift} more minutes on warm-up.`
      );
    }
  }

  if (adjustments.length === 0) {
    adjustments.push('Pacing and mix are tracking the plan; no changes.');
  }

  return { pacingScale, minutes, adjustments, applied: true };
}

/**
 * Move minutes between blocks, respecting a floor on the donor.
 *
 * New-skill time is the usual donor, and it is protected: a student who stops
 * meeting new material stops progressing, however loud the review backlog gets.
 */
function moveMinutes(
  minutes: Record<BlockKind, number>,
  from: BlockKind,
  to: BlockKind,
  requested: number
): number {
  const floor = from === 'new_skill' ? 2 : 3;
  const available = Math.max(0, minutes[from] - floor);
  const shift = Math.min(requested, available, TUNING.maxMinuteShift);
  if (shift <= 0) return 0;
  minutes[from] -= shift;
  minutes[to] += shift;
  return shift;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Total must always be 30 — the promise the whole design rests on. */
export function totalMinutes(minutes: Record<BlockKind, number>): number {
  return Object.values(minutes).reduce((a, b) => a + b, 0);
}

export { SESSION_MINUTES };
