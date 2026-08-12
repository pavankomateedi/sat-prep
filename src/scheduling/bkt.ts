/**
 * T-16 — Bayesian Knowledge Tracing with *fixed* parameters, decayed by FSRS
 * retrievability.
 *
 * Two deliberate departures from textbook BKT, both forced by n=1:
 *
 * 1. Parameters are fixed, not fitted. Fitting BKT to a single learner runs
 *    into identifiability and degeneracy — the model cannot separate its own
 *    parameters from noise, and can converge on absurdities like "guessing is
 *    more likely than knowing" (Baker, Corbett & Aleven 2008). Published,
 *    plausible values sidestep that entirely.
 *
 * 2. Standard BKT has no forgetting: P(known) only ever rises. Over a two-year
 *    programme that produces a mastery display that is simply a lie — a skill
 *    last touched in month three would still read 95%. So the displayed figure
 *    is the BKT posterior multiplied by FSRS's own retrievability estimate,
 *    which is already being tracked for scheduling.
 *
 * The honest framing, per PRD §2.3: this is a *display* model. Scheduling is
 * FSRS's job and item selection is Elo's. Mastery here exists to give the
 * student and parent an intuitive readout, not to drive decisions on its own.
 */

import type { SkillId } from '../domain/taxonomy';
import type { BktState } from '../domain/types';

/**
 * Fixed BKT parameters. These sit in the middle of the ranges commonly reported
 * for intelligent-tutoring datasets, and they satisfy the standard sanity
 * constraint that guess + slip < 1 (otherwise the model becomes degenerate and
 * a wrong answer would raise P(known)).
 */
export const BKT_PARAMS = {
  /** P(known) before any evidence. */
  pInit: 0.15,
  /** P(learn) — chance an unknown skill becomes known after one attempt. */
  pTransit: 0.12,
  /** P(guess) — correct despite not knowing. Roughly chance on a 4-choice item. */
  pGuess: 0.25,
  /** P(slip) — incorrect despite knowing. */
  pSlip: 0.1,
} as const;

export function initialBktState(
  studentId: string,
  skillId: SkillId,
  now = new Date()
): BktState {
  return {
    studentId,
    skillId,
    pKnown: BKT_PARAMS.pInit,
    attempts: 0,
    updatedAt: now.toISOString(),
  };
}

/**
 * One BKT step: Bayesian update on the observation, then the learning
 * transition. Order matters — the transition represents learning that happens
 * *during* the attempt, so it applies after conditioning on the result.
 */
export function updateBkt(state: BktState, correct: boolean, now = new Date()): BktState {
  const { pGuess, pSlip, pTransit } = BKT_PARAMS;
  const prior = state.pKnown;

  // P(known | observation)
  const posterior = correct
    ? (prior * (1 - pSlip)) / (prior * (1 - pSlip) + (1 - prior) * pGuess)
    : (prior * pSlip) / (prior * pSlip + (1 - prior) * (1 - pGuess));

  // P(known after the learning opportunity)
  const pKnown = posterior + (1 - posterior) * pTransit;

  return {
    ...state,
    pKnown: Math.min(Math.max(pKnown, 0), 1),
    attempts: state.attempts + 1,
    updatedAt: now.toISOString(),
  };
}

/** Mastery at or above this counts as "mastered" for phase transitions (T-14). */
export const MASTERY_THRESHOLD = 0.85;

/**
 * The number shown to the student and parent: what BKT believes, discounted by
 * how likely the material still is to be retrievable.
 *
 * `retrievability` is FSRS's estimate for the skill's items, 0-1. A skill can
 * be genuinely learned and still not currently retrievable — that is exactly
 * the state spaced repetition exists to detect, and hiding it behind a static
 * 95% would defeat the purpose.
 */
export function displayedMastery(state: BktState, retrievability: number): number {
  const r = Math.min(Math.max(retrievability, 0), 1);
  return state.pKnown * r;
}

export function isMastered(state: BktState, retrievability: number): boolean {
  return displayedMastery(state, retrievability) >= MASTERY_THRESHOLD;
}

/**
 * Share of all skills currently mastered — the mastery signal the phase
 * transition rule consumes (see decidePhase in src/domain/phases.ts).
 */
export function masteredFraction(
  states: { state: BktState; retrievability: number }[],
  totalSkills: number
): number {
  if (totalSkills === 0) return 0;
  const mastered = states.filter((s) => isMastered(s.state, s.retrievability)).length;
  return mastered / totalSkills;
}
