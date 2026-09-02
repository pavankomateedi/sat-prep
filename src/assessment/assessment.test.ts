import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../content';
import {
  EASIER_MODULE_CEILING,
  SCALE,
  SCORING_DISCLAIMER,
  confidenceHalfWidth,
  domainHighlights,
  routeSecondModule,
  scaleSectionScore,
  scoreComposite,
  scoreDomains,
  scoreSection,
} from './scoring';
import {
  PRACTICE_TIME_BUFFER_MINUTES,
  buildSecondModule,
  buildTest,
  nextAssessmentDue,
  selectModuleItems,
} from './testBuilder';
import { getSection } from '../domain/taxonomy';

describe('score scaling (T-11)', () => {
  it('maps raw performance into the 200-800 band', () => {
    expect(scaleSectionScore(0, 44, 'harder')).toBe(SCALE.sectionMin);
    expect(scaleSectionScore(44, 44, 'harder')).toBe(SCALE.sectionMax);
    expect(scaleSectionScore(22, 44, 'harder')).toBe(500);
  });

  it('reports scores in 10-point increments', () => {
    for (let correct = 0; correct <= 44; correct += 1) {
      const score = scaleSectionScore(correct, 44, 'harder');
      expect(score % SCALE.increment).toBe(0);
    }
  });

  it('caps the score when the student routed to the easier second module', () => {
    // Module-adaptive delivery means the easier form has no items hard enough
    // to demonstrate top-band ability (PRD §1.2).
    expect(scaleSectionScore(44, 44, 'easier')).toBe(EASIER_MODULE_CEILING);
    expect(scaleSectionScore(44, 44, 'harder')).toBe(SCALE.sectionMax);
    // Below the ceiling, the two paths agree.
    expect(scaleSectionScore(20, 44, 'easier')).toBe(scaleSectionScore(20, 44, 'harder'));
  });

  it('routes on module-1 performance', () => {
    expect(routeSecondModule(18, 22)).toBe('harder');
    expect(routeSecondModule(8, 22)).toBe('easier');
    // Exactly at the threshold routes up.
    expect(routeSecondModule(6, 10)).toBe('harder');
    expect(routeSecondModule(0, 0)).toBe('easier');
  });
});

describe('confidence bands (PRD §2.6 — no bare point estimates)', () => {
  it('never reports a zero-width band, even on a perfect score', () => {
    expect(confidenceHalfWidth(44, 44)).toBeGreaterThan(0);
    expect(confidenceHalfWidth(0, 44)).toBeGreaterThan(0);
  });

  it('narrows the band as the number of questions grows', () => {
    const short = confidenceHalfWidth(11, 22);
    const long = confidenceHalfWidth(49, 98);
    expect(long).toBeLessThan(short);
  });

  it('produces a composite score with a renderable range and a disclaimer', () => {
    const rw = scoreSection({
      section: 'rw',
      module1Correct: 20,
      module1Total: 27,
      module2Correct: 18,
      module2Total: 27,
      path: 'harder',
    });
    const math = scoreSection({
      section: 'math',
      module1Correct: 15,
      module1Total: 22,
      module2Correct: 13,
      module2Total: 22,
      path: 'harder',
    });

    const composite = scoreComposite([rw, math]);
    expect(composite.totalScaled).toBe(rw.scaledScore + math.scaledScore);
    expect(composite.totalScaled).toBeGreaterThanOrEqual(SCALE.totalMin);
    expect(composite.totalScaled).toBeLessThanOrEqual(SCALE.totalMax);
    expect(composite.range).toMatch(/^\d+-\d+$/);
    expect(composite.confidenceHalfWidth).toBeGreaterThan(0);
    expect(composite.disclaimer).toBe(SCORING_DISCLAIMER);
  });

  it('combines section variances rather than summing half-widths', () => {
    const section = {
      section: 'rw' as const,
      rawCorrect: 30,
      rawTotal: 54,
      scaledScore: 530,
      halfWidth: 60,
    };
    const composite = scoreComposite([section, { ...section, section: 'math' }]);
    // sqrt(60^2 + 60^2) ≈ 85, not 120.
    expect(composite.confidenceHalfWidth).toBeLessThan(120);
    expect(composite.confidenceHalfWidth).toBeGreaterThan(60);
  });
});

describe('domain reporting', () => {
  const responses = [
    { domain: 'algebra' as const, correct: true },
    { domain: 'algebra' as const, correct: true },
    { domain: 'algebra' as const, correct: true },
    { domain: 'algebra' as const, correct: true },
    { domain: 'circles' as never, correct: false },
    { domain: 'geometry_and_trigonometry' as const, correct: false },
    { domain: 'geometry_and_trigonometry' as const, correct: false },
    { domain: 'geometry_and_trigonometry' as const, correct: false },
    { domain: 'geometry_and_trigonometry' as const, correct: true },
  ];

  it('aggregates per domain, weakest first', () => {
    const scores = scoreDomains(responses.filter((r) => r.domain !== ('circles' as never)));
    expect(scores[0]!.domain).toBe('geometry_and_trigonometry');
    expect(scores[0]!.correct).toBe(1);
    expect(scores[0]!.total).toBe(4);
  });

  it('excludes domains with too few items rather than reporting noise', () => {
    const scores = scoreDomains(responses);
    const { excluded, strongest, weakest } = domainHighlights(scores, 4);
    expect(excluded.some((d) => d.total < 4)).toBe(true);
    for (const d of [...strongest, ...weakest]) expect(d.total).toBeGreaterThanOrEqual(4);
  });
});

describe('test assembly (T-18)', () => {
  it('builds module 1 for both sections at the real question counts', () => {
    const test = buildTest({ kind: 'full_length', items: ITEMS, seed: 1 });
    expect(test.modules).toHaveLength(2);

    for (const module of test.modules) {
      const spec = getSection(module.section);
      expect(module.index).toBe(1);
      expect(module.itemIds).toHaveLength(spec.questionsPerModule);
      expect(module.timeLimitSeconds).toBe((spec.minutesPerModule + PRACTICE_TIME_BUFFER_MINUTES) * 60);
    }
    expect(test.shortfall).toEqual([]);
  });

  it('gives a few extra minutes per module beyond real PRD §1.1 timing, for learning', () => {
    // Deliberate departure — see PRACTICE_TIME_BUFFER_MINUTES in testBuilder.ts.
    // Pacing analytics (src/analytics/pacing.ts) still compares against the
    // real, unbuffered timing, so this clock being generous never distorts
    // the "how are you pacing against the actual test" signal.
    const test = buildTest({ kind: 'full_length', items: ITEMS, seed: 1 });
    const rw = test.modules.find((m) => m.section === 'rw')!;
    const math = test.modules.find((m) => m.section === 'math')!;
    expect(rw.timeLimitSeconds).toBe((32 + PRACTICE_TIME_BUFFER_MINUTES) * 60);
    expect(math.timeLimitSeconds).toBe((35 + PRACTICE_TIME_BUFFER_MINUTES) * 60);
    // Full-length: 4 modules total, real 134 min + 4 × buffer.
    expect(test.totalMinutes).toBe(134 + 4 * PRACTICE_TIME_BUFFER_MINUTES);
  });

  it('defaults a diagnostic to half length', () => {
    const diagnostic = buildTest({ kind: 'diagnostic', items: ITEMS, seed: 1 });
    // Real half-length is 67 min (2 modules); plus buffer on each module.
    expect(diagnostic.totalMinutes).toBe(67 + 2 * PRACTICE_TIME_BUFFER_MINUTES);
  });

  it('never repeats an item across modules of the same test', () => {
    const test = buildTest({ kind: 'full_length', items: ITEMS, seed: 3 });
    const used = new Set(test.modules.flatMap((m) => m.itemIds));

    const exclude = new Set(used);
    const second = buildSecondModule({
      items: ITEMS,
      section: 'math',
      module1Correct: 18,
      module1Total: 22,
      exclude,
      seed: 3,
    });

    for (const id of second.itemIds) expect(used.has(id)).toBe(false);
  });

  it('routes module 2 harder or easier based on module 1', () => {
    const harder = buildSecondModule({
      items: ITEMS,
      section: 'math',
      module1Correct: 20,
      module1Total: 22,
      exclude: new Set(),
      seed: 5,
    });
    const easier = buildSecondModule({
      items: ITEMS,
      section: 'math',
      module1Correct: 5,
      module1Total: 22,
      exclude: new Set(),
      seed: 5,
    });

    expect(harder.path).toBe('harder');
    expect(easier.path).toBe('easier');

    const byId = new Map(ITEMS.map((i) => [i.id, i]));
    const hardCount = (ids: string[]) =>
      ids.filter((id) => byId.get(id)!.difficulty === 'hard').length;

    expect(hardCount(harder.itemIds)).toBeGreaterThan(hardCount(easier.itemIds));
  });

  it('prefers unseen items and reports how many seen ones it had to use', () => {
    const seen = new Set(ITEMS.slice(0, 150).map((i) => i.id));
    const test = buildTest({ kind: 'full_length', items: ITEMS, seenItemIds: seen, seed: 9 });

    const clean = buildTest({ kind: 'full_length', items: ITEMS, seed: 9 });
    expect(clean.previouslySeenCount).toBe(0);
    // With most of the bank already seen, some reuse is unavoidable — the
    // point is that it is counted and reported, not hidden.
    expect(test.previouslySeenCount).toBeGreaterThan(0);
  });

  it('respects the section domain weights when selecting a module', () => {
    const { itemIds } = selectModuleItems({
      items: ITEMS,
      section: 'math',
      count: 22,
      mix: { easy: 0.3, medium: 0.5, hard: 0.2 },
      exclude: new Set(),
      seenItemIds: new Set(),
      rand: () => 0.5,
    });

    const byId = new Map(ITEMS.map((i) => [i.id, i]));
    const domains = itemIds.map((id) => byId.get(id)!.domain);
    const algebra = domains.filter((d) => d === 'algebra').length;
    const geometry = domains.filter((d) => d === 'geometry_and_trigonometry').length;

    // Algebra is 35% of Math and Geometry 15%, so Algebra must dominate.
    expect(algebra).toBeGreaterThan(geometry);
    expect(itemIds).toHaveLength(22);
  });
});

describe('assessment cadence (PRD §2.4)', () => {
  it('calls for a baseline when none has been taken', () => {
    const result = nextAssessmentDue(null, [], '2026-09-01');
    expect(result.due).toBe(true);
    expect(result.reason).toMatch(/baseline/i);
  });

  it('holds off when a checkpoint was taken recently', () => {
    const result = nextAssessmentDue('2026-08-01', [], '2026-09-01');
    expect(result.due).toBe(false);
    expect(result.reason).toMatch(/next in about/);
  });

  it('schedules a checkpoint ahead of a real administration', () => {
    const result = nextAssessmentDue('2026-04-01', ['2026-10-15'], '2026-10-01');
    expect(result.due).toBe(true);
    expect(result.reason).toMatch(/real test/);
  });

  it('does not stack a checkpoint onto a recent one even before a real test', () => {
    const result = nextAssessmentDue('2026-09-25', ['2026-10-15'], '2026-10-01');
    expect(result.due).toBe(false);
  });

  it('becomes due again after a full term', () => {
    const result = nextAssessmentDue('2026-05-01', [], '2026-09-01');
    expect(result.due).toBe(true);
  });
});
