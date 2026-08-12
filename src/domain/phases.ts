/**
 * T-14 — The four-phase minute-budget schedule from PRD §2.2, plus the phase
 * transition rule.
 *
 * PRD §2.2 is explicit that these minute allocations are *reasoned inference*,
 * not evidence: no study specifies minute-level budgets for a 30-minute daily
 * SAT session. They are a starting design meant to be tuned against this
 * student's own data. `PHASE_BUDGETS` is therefore kept as flat, obvious data
 * so it is cheap to revise once real adherence and mastery numbers exist.
 */

import type { BlockKind, ProgramPhase, Student } from './types';
import { monthsBetween, toLocalDate, type LocalDate } from '../lib/dates';

export const SESSION_MINUTES = 30;

export interface PhaseBudget {
  phase: ProgramPhase;
  label: string;
  description: string;
  minutes: Record<BlockKind, number>;
  /**
   * FSRS desired-retention target for this phase (PRD §2.3). Rises as the test
   * approaches: a tighter target means shorter intervals and more review, which
   * is the right trade closer to test day and the wrong one two years out.
   */
  desiredRetention: number;
}

export const PHASE_BUDGETS: Record<ProgramPhase, PhaseBudget> = {
  A: {
    phase: 'A',
    label: 'Foundation',
    description: 'Building first-pass coverage across all eight domains.',
    minutes: { warmup: 5, new_skill: 15, mixed: 5, error_review: 5 },
    desiredRetention: 0.88,
  },
  B: {
    phase: 'B',
    label: 'Breadth',
    description: 'Widening coverage while review load starts to accumulate.',
    minutes: { warmup: 7, new_skill: 10, mixed: 8, error_review: 5 },
    desiredRetention: 0.88,
  },
  C: {
    phase: 'C',
    label: 'Consolidation',
    description: 'Shifting from new material toward mixed, test-realistic practice.',
    minutes: { warmup: 8, new_skill: 5, mixed: 10, error_review: 7 },
    desiredRetention: 0.9,
  },
  D: {
    phase: 'D',
    label: 'Test-ready',
    description: 'Maintaining and stress-testing skills ahead of the real test.',
    minutes: { warmup: 5, new_skill: 3, mixed: 12, error_review: 10 },
    desiredRetention: 0.93,
  },
};

/** Fixed order the blocks are always presented in. */
export const BLOCK_ORDER: readonly BlockKind[] = [
  'warmup',
  'new_skill',
  'mixed',
  'error_review',
] as const;

const PHASE_ORDER: readonly ProgramPhase[] = ['A', 'B', 'C', 'D'] as const;

export function phaseIndex(phase: ProgramPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

// ---------------------------------------------------------------------------
// Transition rule
// ---------------------------------------------------------------------------

/**
 * Time thresholds from the PRD §2.2 phase table, expressed as the two clocks
 * that actually matter: how long the student has been running the program, and
 * how close the target test is.
 */
const TIME_RULES = {
  /** Phase D: final 4-6 months before the target test. */
  phaseDMonthsBeforeTarget: 6,
  /** Phase C: 10th grade onward, i.e. roughly a year into the program. */
  phaseCMonthsElapsed: 12,
  /** Phase B: back half of 9th grade, roughly 7 months in. */
  phaseBMonthsElapsed: 7,
} as const;

/**
 * Mastery gates. PRD §2.8 specifies phase transitions "driven by elapsed time +
 * mastery signal", so time sets a baseline and mastery can nudge it one step in
 * either direction.
 */
const MASTERY_RULES = {
  /** Mastery high enough to justify moving on a phase early. */
  advanceEarly: 0.75,
  /** Mastery low enough that pushing ahead would outrun the foundation. */
  holdBack: 0.35,
} as const;

export interface PhaseDecision {
  phase: ProgramPhase;
  /** What time alone would have chosen, before the mastery adjustment. */
  timeBasedPhase: ProgramPhase;
  reason: string;
}

/**
 * Decide the current phase.
 *
 * `masteredFraction` is the share of skills the BKT layer considers mastered
 * (0-1). Pass 0 before any mastery signal exists — the MVP path — and the
 * decision falls back to time alone.
 *
 * The mastery adjustment is capped at one phase in either direction so a
 * transient dip or spike can't skip the student across the whole arc. The
 * proximity of the real test always wins: once inside the Phase D window, no
 * amount of weak mastery holds the student back, because the test date does not
 * move.
 */
export function decidePhase(
  student: Pick<Student, 'programStartDate' | 'targetTestDate'>,
  masteredFraction: number,
  today: LocalDate = toLocalDate()
): PhaseDecision {
  const elapsedMonths = monthsBetween(student.programStartDate, today);
  const monthsToTarget = monthsBetween(today, student.targetTestDate);

  let timeBased: ProgramPhase;
  if (monthsToTarget <= TIME_RULES.phaseDMonthsBeforeTarget) {
    timeBased = 'D';
  } else if (elapsedMonths >= TIME_RULES.phaseCMonthsElapsed) {
    timeBased = 'C';
  } else if (elapsedMonths >= TIME_RULES.phaseBMonthsElapsed) {
    timeBased = 'B';
  } else {
    timeBased = 'A';
  }

  // Inside the final run-up, the calendar is the only thing that matters.
  if (timeBased === 'D') {
    return {
      phase: 'D',
      timeBasedPhase: 'D',
      reason: `Within ${TIME_RULES.phaseDMonthsBeforeTarget} months of the target test date.`,
    };
  }

  const idx = phaseIndex(timeBased);

  if (masteredFraction >= MASTERY_RULES.advanceEarly && idx < PHASE_ORDER.length - 1) {
    const phase = PHASE_ORDER[idx + 1]!;
    return {
      phase,
      timeBasedPhase: timeBased,
      reason: `Mastery at ${Math.round(masteredFraction * 100)}% — moved ahead of the ${elapsedMonths.toFixed(1)}-month schedule.`,
    };
  }

  if (masteredFraction < MASTERY_RULES.holdBack && idx > 0) {
    const phase = PHASE_ORDER[idx - 1]!;
    return {
      phase,
      timeBasedPhase: timeBased,
      reason: `Mastery at ${Math.round(masteredFraction * 100)}% — holding at an earlier phase to build the foundation.`,
    };
  }

  return {
    phase: timeBased,
    timeBasedPhase: timeBased,
    reason: `${elapsedMonths.toFixed(1)} months into the program.`,
  };
}

export function budgetFor(phase: ProgramPhase): PhaseBudget {
  return PHASE_BUDGETS[phase];
}
