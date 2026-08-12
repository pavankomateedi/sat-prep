/**
 * T-11 / T-18 — Scoring for diagnostics and full-length practice tests.
 *
 * ## An honesty warning that belongs in the code, not just the docs
 *
 * College Board does not publish the IRT parameters or conversion tables behind
 * Digital SAT scaling, and those tables differ from form to form. So the
 * mapping below is an **approximation**, not a score prediction. It exists to
 * give the student a stable, comparable number to track over two years — its
 * value is in the *trend*, not the absolute figure.
 *
 * This is the direct implementation of two PRD commitments:
 *  - §3 point 3, "honest uncertainty vs. false precision": every score is
 *    reported with a confidence band, never as a bare point estimate.
 *  - §2.6: the UI is forbidden from showing a single predicted-score number.
 *
 * `SCORING_DISCLAIMER` is exported so the UI cannot render a score without
 * having the caveat available to show alongside it.
 */

import type { DomainId, SectionId } from '../domain/taxonomy';
import { SECTIONS, getDomain } from '../domain/taxonomy';
import type { DomainScore, SectionScore } from '../domain/types';

export const SCORING_DISCLAIMER =
  'Estimated from practice performance using an approximate scale. College Board does not ' +
  'publish its conversion tables, so treat this as a trend indicator, not a predicted score.';

/** Scale bounds from PRD §1.1. */
export const SCALE = {
  sectionMin: 200,
  sectionMax: 800,
  totalMin: 400,
  totalMax: 1600,
  /** Scores are reported in 10-point increments. */
  increment: 10,
} as const;

/**
 * Ceiling when the student is routed to the easier second module.
 *
 * This is the practical consequence of module-adaptive delivery (PRD §1.2):
 * the easier module 2 contains no items difficult enough to demonstrate
 * top-band ability, so the attainable score is capped. Modelling it is what
 * makes a practice score behave like a real one — and it is the single most
 * commonly misunderstood feature of the digital test.
 *
 * The exact cap is an assumption; College Board publishes no figure.
 */
export const EASIER_MODULE_CEILING = 650;

/** Module-1 accuracy at or above which the student routes to the harder form. */
export const ROUTING_THRESHOLD = 0.6;

export type RoutingPath = 'harder' | 'easier';

export function routeSecondModule(module1Correct: number, module1Total: number): RoutingPath {
  if (module1Total === 0) return 'easier';
  return module1Correct / module1Total >= ROUTING_THRESHOLD ? 'harder' : 'easier';
}

function roundToIncrement(value: number): number {
  return Math.round(value / SCALE.increment) * SCALE.increment;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/**
 * Convert raw performance to a section scale score.
 *
 * Deliberately a plain linear map across the 200-800 band, then capped by the
 * routing path. A fancier curve would imply a precision this has no basis for.
 */
export function scaleSectionScore(
  rawCorrect: number,
  rawTotal: number,
  path: RoutingPath
): number {
  if (rawTotal === 0) return SCALE.sectionMin;
  const proportion = clamp(rawCorrect / rawTotal, 0, 1);
  const linear = SCALE.sectionMin + proportion * (SCALE.sectionMax - SCALE.sectionMin);
  const ceiling = path === 'easier' ? EASIER_MODULE_CEILING : SCALE.sectionMax;
  return roundToIncrement(clamp(linear, SCALE.sectionMin, ceiling));
}

/**
 * Half-width of the reported confidence band, in scale points.
 *
 * Derived from the binomial standard error of the observed proportion. The
 * point is that a 44-question section simply cannot pin a score to ±10 —
 * treating it as if it could is the false precision the PRD warns against.
 *
 * This captures sampling error only. Real score variation also includes day-to-
 * day variability and form differences, so this is a *lower bound* on true
 * uncertainty — the band is, if anything, too narrow rather than too wide.
 */
export function confidenceHalfWidth(rawCorrect: number, rawTotal: number): number {
  if (rawTotal === 0) return SCALE.sectionMax - SCALE.sectionMin;
  const p = clamp(rawCorrect / rawTotal, 0, 1);
  // Guard the variance away from zero: a perfect score does not mean perfect
  // certainty, so borrow the variance of the nearest non-degenerate proportion.
  const variance = Math.max(p * (1 - p), 0.25 / rawTotal);
  const standardError = Math.sqrt(variance / rawTotal);
  const halfWidth = 1.96 * standardError * (SCALE.sectionMax - SCALE.sectionMin);
  return Math.max(SCALE.increment * 2, roundToIncrement(halfWidth));
}

export interface SectionResultInput {
  section: SectionId;
  module1Correct: number;
  module1Total: number;
  module2Correct: number;
  module2Total: number;
  path: RoutingPath;
}

export function scoreSection(input: SectionResultInput): SectionScore & {
  path: RoutingPath;
  halfWidth: number;
} {
  const rawCorrect = input.module1Correct + input.module2Correct;
  const rawTotal = input.module1Total + input.module2Total;
  return {
    section: input.section,
    rawCorrect,
    rawTotal,
    scaledScore: scaleSectionScore(rawCorrect, rawTotal, input.path),
    path: input.path,
    halfWidth: confidenceHalfWidth(rawCorrect, rawTotal),
  };
}

export interface CompositeScore {
  sectionScores: SectionScore[];
  totalScaled: number;
  /** Half-width of the composite band, in points. */
  confidenceHalfWidth: number;
  /** Ready-to-render range, e.g. "1080-1200". */
  range: string;
  disclaimer: string;
}

export function scoreComposite(
  sections: (SectionScore & { halfWidth: number })[]
): CompositeScore {
  const totalScaled = clamp(
    sections.reduce((sum, s) => sum + s.scaledScore, 0),
    SCALE.totalMin,
    SCALE.totalMax
  );

  // Independent sections, so variances add rather than the half-widths.
  const combined = Math.sqrt(sections.reduce((sum, s) => sum + s.halfWidth ** 2, 0));
  const half = Math.max(SCALE.increment * 2, roundToIncrement(combined));

  return {
    sectionScores: sections.map(({ halfWidth: _ignored, ...rest }) => rest),
    totalScaled,
    confidenceHalfWidth: half,
    range: `${clamp(totalScaled - half, SCALE.totalMin, SCALE.totalMax)}-${clamp(
      totalScaled + half,
      SCALE.totalMin,
      SCALE.totalMax
    )}`,
    disclaimer: SCORING_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Domain breakdown
// ---------------------------------------------------------------------------

/**
 * Per-domain correct/total — the "which domains are strongest and weakest"
 * readout the parent user story in PRD §2.1 asks for ahead of each test.
 */
export function scoreDomains(
  responses: { domain: DomainId; correct: boolean }[]
): DomainScore[] {
  const byDomain = new Map<DomainId, { correct: number; total: number }>();

  for (const response of responses) {
    const entry = byDomain.get(response.domain) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (response.correct) entry.correct += 1;
    byDomain.set(response.domain, entry);
  }

  return [...byDomain.entries()]
    .map(([domain, counts]) => ({ domain, correct: counts.correct, total: counts.total }))
    .sort((a, b) => {
      // Weakest first, so the report opens on what needs attention.
      const rateA = a.total === 0 ? 1 : a.correct / a.total;
      const rateB = b.total === 0 ? 1 : b.correct / b.total;
      return rateA - rateB;
    });
}

/**
 * Domains ranked strongest and weakest, with enough items behind each to be
 * worth saying out loud. Domains with too few items are excluded rather than
 * reported with a meaningless percentage.
 */
export function domainHighlights(
  domainScores: DomainScore[],
  minimumItems = 4
): { strongest: DomainScore[]; weakest: DomainScore[]; excluded: DomainScore[] } {
  const usable = domainScores.filter((d) => d.total >= minimumItems);
  const excluded = domainScores.filter((d) => d.total < minimumItems);
  const sorted = [...usable].sort((a, b) => b.correct / b.total - a.correct / a.total);

  return {
    strongest: sorted.slice(0, 2),
    weakest: sorted.slice(-2).reverse(),
    excluded,
  };
}

/** Section a domain belongs to; used when grouping a report. */
export function sectionOfDomain(domain: DomainId): SectionId {
  return getDomain(domain).section;
}

export { SECTIONS };
