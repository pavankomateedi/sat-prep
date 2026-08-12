/**
 * Answer checking.
 *
 * Multiple choice is trivial. Student-produced response is not: the Digital SAT
 * accepts equivalent forms, so a student who enters `7/25` when the key says
 * `0.28` is correct and must not be marked wrong. Getting this wrong would be
 * worse than a UI annoyance — a false negative poisons the FSRS grade, the Elo
 * update, and the error queue all at once.
 */

import type { Item } from '../domain/types';

/** Parse a numeric answer, accepting fractions, decimals, and a leading dot. */
export function parseNumeric(raw: string): number | null {
  const text = raw.trim().replace(/\s+/g, '').replace(/^\+/, '');
  if (text === '') return null;

  const fraction = /^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/.exec(text);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return numerator / denominator;
  }

  // Accepts ".5" as well as "0.5".
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Compare two student-produced answers.
 *
 * A relative tolerance handles the rounding the real test expects — a student
 * entering 4.47 for √20 is right, and so is 4.472.
 */
export function numericallyEqual(a: number, b: number, relativeTolerance = 1e-3): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= relativeTolerance * scale;
}

export interface CheckResult {
  correct: boolean;
  /** The accepted form the response matched, for the explanation UI. */
  matched: string | null;
}

export function checkAnswer(item: Item, response: string): CheckResult {
  const trimmed = response.trim();
  if (trimmed === '') return { correct: false, matched: null };

  if (item.itemType === 'mcq') {
    const key = Array.isArray(item.answer) ? item.answer[0] : item.answer;
    return {
      correct: trimmed.toUpperCase() === String(key).toUpperCase(),
      matched: trimmed.toUpperCase() === String(key).toUpperCase() ? String(key) : null,
    };
  }

  const accepted = Array.isArray(item.answer) ? item.answer : [item.answer];

  // Exact string match first, so a key like "150" matches without any parsing.
  for (const form of accepted) {
    if (form.trim() === trimmed) return { correct: true, matched: form };
  }

  const responseValue = parseNumeric(trimmed);
  if (responseValue === null) return { correct: false, matched: null };

  for (const form of accepted) {
    const keyValue = parseNumeric(form);
    if (keyValue !== null && numericallyEqual(responseValue, keyValue)) {
      return { correct: true, matched: form };
    }
  }

  return { correct: false, matched: null };
}
