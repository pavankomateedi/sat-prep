/**
 * National percentile context.
 *
 * PRD §4.1: "the app tracks the student's own trend line but never
 * contextualises it against College Board's published percentile tables, so
 * 'you're improving' has no external anchor."
 *
 * This supplies the anchor. Two honesty constraints carried through from §2.6:
 *
 *  1. The table below is **approximate**, reconstructed from published
 *     nationally-representative percentile ranges. College Board revises these
 *     annually and does not publish them in machine-readable form, so treat a
 *     percentile here as a band, not a rank.
 *  2. Because the underlying score is itself a range, the percentile is
 *     reported as a range too. Converting a ±60-point score band into a single
 *     percentile would reintroduce exactly the false precision the confidence
 *     band exists to prevent.
 */

import { SCALE } from './scoring';

/**
 * Anchor points: composite score → approximate nationally-representative
 * percentile. Values between anchors are interpolated linearly, which is
 * accurate enough given the source data is itself rounded to whole percentiles.
 */
const ANCHORS: readonly { score: number; percentile: number }[] = [
  { score: 400, percentile: 1 },
  { score: 600, percentile: 4 },
  { score: 700, percentile: 8 },
  { score: 800, percentile: 12 },
  { score: 900, percentile: 22 },
  { score: 1000, percentile: 34 },
  { score: 1050, percentile: 41 },
  { score: 1100, percentile: 49 },
  { score: 1150, percentile: 57 },
  { score: 1200, percentile: 64 },
  { score: 1250, percentile: 72 },
  { score: 1300, percentile: 79 },
  { score: 1350, percentile: 85 },
  { score: 1400, percentile: 90 },
  { score: 1450, percentile: 94 },
  { score: 1500, percentile: 97 },
  { score: 1550, percentile: 99 },
  { score: 1600, percentile: 99 },
] as const;

/** ISO date the table was last checked against a published source. */
export const PERCENTILES_VERIFIED_ON = '2026-07-31';

export const PERCENTILE_DISCLAIMER =
  'Percentiles are approximate, based on published nationally representative ranges. ' +
  'College Board revises them annually.';

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Approximate percentile for a composite score. */
export function percentileFor(totalScaled: number): number {
  const score = clamp(totalScaled, SCALE.totalMin, SCALE.totalMax);

  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const lower = ANCHORS[i]!;
    const upper = ANCHORS[i + 1]!;
    if (score >= lower.score && score <= upper.score) {
      const span = upper.score - lower.score;
      const position = span === 0 ? 0 : (score - lower.score) / span;
      return Math.round(lower.percentile + position * (upper.percentile - lower.percentile));
    }
  }

  return score <= ANCHORS[0]!.score ? ANCHORS[0]!.percentile : ANCHORS[ANCHORS.length - 1]!.percentile;
}

export interface PercentileBand {
  low: number;
  high: number;
  /** Ready-to-render, e.g. "58th–72nd percentile". */
  label: string;
  /** One sentence a parent or student can act on. */
  interpretation: string;
  disclaimer: string;
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

/**
 * Percentile band for a score that is itself a range.
 *
 * Both ends of the score band are converted, so the output honestly reflects
 * that a practice test cannot locate the student to a single percentile.
 */
export function percentileBand(totalScaled: number, halfWidth: number): PercentileBand {
  const low = percentileFor(totalScaled - halfWidth);
  const high = percentileFor(totalScaled + halfWidth);

  const label =
    low === high
      ? `${ordinal(low)} percentile`
      : `${ordinal(low)}–${ordinal(high)} percentile`;

  const midpoint = Math.round((low + high) / 2);
  const interpretation =
    midpoint >= 90
      ? 'Above roughly nine in ten test-takers nationally.'
      : midpoint >= 75
        ? 'In the top quarter of test-takers nationally.'
        : midpoint >= 50
          ? 'Above the national median.'
          : midpoint >= 25
            ? 'Below the national median, with room to move.'
            : 'Early days — this is a starting point, not a ceiling.';

  return { low, high, label, interpretation, disclaimer: PERCENTILE_DISCLAIMER };
}

/**
 * Score needed to reach a target percentile — the inverse lookup, for
 * "what would it take to reach the top quarter?".
 */
export function scoreForPercentile(targetPercentile: number): number {
  const target = clamp(targetPercentile, 1, 99);

  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const lower = ANCHORS[i]!;
    const upper = ANCHORS[i + 1]!;
    if (target >= lower.percentile && target <= upper.percentile) {
      const span = upper.percentile - lower.percentile;
      const position = span === 0 ? 0 : (target - lower.percentile) / span;
      const score = lower.score + position * (upper.score - lower.score);
      return Math.round(score / SCALE.increment) * SCALE.increment;
    }
  }

  return SCALE.totalMax;
}
