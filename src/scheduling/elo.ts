/**
 * T-15 — Frozen-difficulty Elo ability tracking, one estimate per skill.
 *
 * The constraint that shapes this whole module: proper IRT calibration needs
 * roughly 100-200 students' responses per item (Pelánek 2016), and this app has
 * exactly one student. So item difficulty is *authored*, not fitted — it enters
 * as a fixed input from the content bank — and only the student's ability moves.
 *
 * That inversion is what makes Elo work at n=1. With difficulty frozen, each
 * response is direct evidence about ability alone, and the estimate settles
 * within roughly 10 items per skill: fast enough to be useful inside a
 * two-year programme rather than converging just as it ends.
 */

import { DIFFICULTY_LOGIT, type Difficulty } from '../domain/types';
import type { SkillId } from '../domain/taxonomy';
import type { EloState } from '../domain/types';

/**
 * Uncertainty-scaled step size. Pelánek's approach: a large K early, when the
 * estimate is mostly noise, decaying as evidence accumulates. A fixed K would
 * force a choice between converging too slowly to matter and jittering forever.
 */
export const ELO_K = {
  /** Step size on the very first attempt for a skill. */
  initial: 0.9,
  /** Controls how fast K decays with attempt count. */
  decay: 0.08,
  /** Floor, so the estimate can still track genuine improvement over 2 years. */
  minimum: 0.12,
} as const;

export function kFactor(attempts: number): number {
  return Math.max(ELO_K.minimum, ELO_K.initial / (1 + ELO_K.decay * attempts));
}

/** Logistic probability of a correct response: ability vs authored difficulty. */
export function expectedCorrect(ability: number, itemDifficulty: number): number {
  return 1 / (1 + Math.exp(-(ability - itemDifficulty)));
}

export function initialEloState(
  studentId: string,
  skillId: SkillId,
  now = new Date()
): EloState {
  return {
    studentId,
    skillId,
    // 0 means "matched to a medium item" — a neutral prior, since we have no
    // reason to assume the student starts above or below that.
    ability: 0,
    attempts: 0,
    updatedAt: now.toISOString(),
  };
}

export interface EloUpdate {
  next: EloState;
  /** Ability before the update, recorded on the Attempt. */
  before: number;
  /** What the model predicted, for calibration checks. */
  expected: number;
}

/**
 * Standard Elo update against a fixed item difficulty.
 *
 * A correct answer on a hard item moves ability more than a correct answer on
 * an easy one, because the surprise is larger — that is the `correct - expected`
 * term, and it is the reason authored difficulty has to be roughly right for
 * the estimate to mean anything.
 */
export function updateElo(
  state: EloState,
  itemDifficulty: Difficulty,
  correct: boolean,
  now = new Date()
): EloUpdate {
  const difficulty = DIFFICULTY_LOGIT[itemDifficulty];
  const expected = expectedCorrect(state.ability, difficulty);
  const k = kFactor(state.attempts);
  const ability = state.ability + k * ((correct ? 1 : 0) - expected);

  return {
    before: state.ability,
    expected,
    next: {
      ...state,
      // Clamp to a plausible band. Beyond about ±4 logits the logistic is
      // saturated and further movement carries no information.
      ability: Math.min(Math.max(ability, -4), 4),
      attempts: state.attempts + 1,
      updatedAt: now.toISOString(),
    },
  };
}

/** Attempts before the estimate is stable enough to show or act on. */
export const ELO_CONVERGENCE_ATTEMPTS = 10;

export function isConverged(state: EloState): boolean {
  return state.attempts >= ELO_CONVERGENCE_ATTEMPTS;
}

/**
 * The difficulty band this student should be practising in for a skill.
 *
 * Targets items the student gets right about 70% of the time — hard enough to
 * be worth doing, easy enough not to be demoralising. Returns null while the
 * estimate is still converging, in which case the composer should spread across
 * difficulties rather than trusting a noisy number.
 */
export function targetDifficulty(state: EloState): Difficulty | null {
  if (!isConverged(state)) return null;
  if (state.ability < DIFFICULTY_LOGIT.easy + 0.4) return 'easy';
  if (state.ability > DIFFICULTY_LOGIT.hard - 0.4) return 'hard';
  return 'medium';
}
