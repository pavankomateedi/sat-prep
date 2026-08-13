import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE,
  accuracyByDifficulty,
  accuracyByItemType,
  benchmarkSeconds,
  buildPacingReport,
  verdictFor,
  weakestSkills,
  type AttemptSample,
} from './pacing';
import { getSkill } from '../domain/taxonomy';
import { REFERENCE_SHEET, NOT_ON_THE_SHEET } from '../domain/referenceSheet';
import { unsupportedCommands } from '../ui/mathParser';

function sample(overrides: Partial<AttemptSample> = {}): AttemptSample {
  return {
    itemId: 'i1',
    section: 'math',
    domain: 'algebra',
    skill: 'linear_functions',
    difficulty: 'medium',
    itemType: 'mcq',
    correct: true,
    responseTimeMs: 95_000,
    answeredAt: '2026-09-15T10:00:00Z',
    ...overrides,
  };
}

const many = (n: number, overrides: Partial<AttemptSample> = {}) =>
  Array.from({ length: n }, () => sample(overrides));

describe('benchmarks', () => {
  it('derives seconds per question from the real section timing', () => {
    // R&W: 64 min / 54 q ≈ 71s. Math: 70 min / 44 q ≈ 95s.
    expect(Math.round(benchmarkSeconds('rw'))).toBe(71);
    expect(Math.round(benchmarkSeconds('math'))).toBe(95);
  });
});

describe('pacing verdicts', () => {
  it('refuses to judge below the minimum sample', () => {
    const report = buildPacingReport(many(MIN_SAMPLE - 1));
    expect(report.verdict).toBe('insufficient_data');
    expect(report.message).toMatch(new RegExp(`of ${MIN_SAMPLE} answers`));
  });

  it('calls steady work on pace', () => {
    const report = buildPacingReport(many(20, { responseTimeMs: 95_000 }));
    expect(report.verdict).toBe('on_pace');
  });

  it('flags work that would run out of module time', () => {
    const report = buildPacingReport(many(20, { responseTimeMs: 160_000 }));
    expect(report.verdict).toBe('too_slow');
    expect(report.message).toMatch(/runs out of time/);
  });

  it('flags rushing only when speed comes with errors', () => {
    const careless = buildPacingReport(
      many(20, { responseTimeMs: 30_000, correct: false })
    );
    expect(careless.verdict).toBe('rushing');
    expect(careless.message).toMatch(/costing marks/);
  });

  it('does not call a fast, accurate student a rusher', () => {
    // Being quick is not a problem if the answers are right — telling this
    // student to slow down would be actively wrong.
    const report = buildPacingReport(many(20, { responseTimeMs: 30_000, correct: true }));
    expect(report.verdict).not.toBe('rushing');
  });

  it('uses the median so one interruption cannot skew the verdict', () => {
    const samples = [
      ...many(19, { responseTimeMs: 90_000 }),
      sample({ responseTimeMs: 3_600_000 }), // phone put down mid-question
    ];
    expect(buildPacingReport(samples).verdict).toBe('on_pace');
  });

  it('reports per-section pacing against that section’s own benchmark', () => {
    const report = buildPacingReport([
      ...many(10, { section: 'rw', domain: 'craft_and_structure', skill: 'words_in_context' }),
      ...many(10, { section: 'math' }),
    ]);

    const rw = report.bySection.find((b) => b.label.includes('Reading'))!;
    const math = report.bySection.find((b) => b.label === 'Math')!;
    expect(rw.benchmarkSeconds).toBe(71);
    expect(math.benchmarkSeconds).toBe(95);
  });

  it('marks a bucket unreliable below the sample floor', () => {
    expect(verdictFor({
      label: 'x', attempts: 3, medianSeconds: 200, benchmarkSeconds: 95,
      accuracy: 0.3, reliable: false,
    })).toBe('insufficient_data');
  });
});

describe('accuracy breakdowns', () => {
  it('breaks accuracy down by difficulty, weakest first', () => {
    const rows = accuracyByDifficulty([
      ...many(10, { difficulty: 'easy', correct: true }),
      ...many(10, { difficulty: 'hard', correct: false }),
    ]);
    expect(rows[0]!.label).toBe('Hard');
    expect(rows[0]!.accuracy).toBe(0);
    expect(rows[1]!.accuracy).toBe(1);
  });

  it('separates multiple choice from student-produced response', () => {
    const rows = accuracyByItemType([
      ...many(10, { itemType: 'mcq', correct: true }),
      ...many(10, { itemType: 'spr', correct: false }),
    ]);
    expect(rows.map((r) => r.label)).toContain('Student-produced response');
    expect(rows[0]!.accuracy).toBe(0);
  });

  it('flags buckets with too little data as unreliable', () => {
    const rows = accuracyByDifficulty(many(3, { difficulty: 'hard' }));
    expect(rows[0]!.reliable).toBe(false);
  });

  it('recommends only skills that are both weak and well-evidenced', () => {
    const weak = weakestSkills(
      [
        ...many(12, { skill: 'circles', correct: false }),
        ...many(12, { skill: 'percentages', correct: true }),
        // Weak, but only two attempts — not enough to act on.
        ...many(2, { skill: 'transitions', correct: false }),
      ],
      (skill) => getSkill(skill).name
    );

    const names = weak.map((w) => w.key);
    expect(names).toContain('circles');
    expect(names).not.toContain('percentages');
    expect(names).not.toContain('transitions');
  });

  it('returns nothing to recommend when everything is strong', () => {
    expect(weakestSkills(many(20, { correct: true }), (s) => getSkill(s).name)).toEqual([]);
  });
});

describe('formula reference sheet', () => {
  it('covers the groups the real sheet provides', () => {
    const titles = REFERENCE_SHEET.map((g) => g.title.toLowerCase()).join(' ');
    expect(titles).toMatch(/circle/);
    expect(titles).toMatch(/triangle/);
    expect(titles).toMatch(/volume/);
  });

  it('renders entirely within the supported LaTeX subset', () => {
    // A formula the renderer cannot draw is worse than no formula — the
    // student would see raw markup mid-test.
    const offenders: string[] = [];
    for (const group of REFERENCE_SHEET) {
      for (const entry of group.entries) {
        const bad = unsupportedCommands(entry.formula);
        if (bad.length > 0) offenders.push(`${entry.label}: ${bad.join(', ')}`);
      }
    }
    for (const line of NOT_ON_THE_SHEET) {
      const bad = unsupportedCommands(line);
      if (bad.length > 0) offenders.push(`${line}: ${bad.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('lists the formulas that are NOT provided', () => {
    // Knowing what the sheet omits is as useful as knowing what it has.
    const text = NOT_ON_THE_SHEET.join(' ').toLowerCase();
    expect(text).toMatch(/slope/);
    expect(text).toMatch(/quadratic formula/);
    expect(text).toMatch(/sohcahtoa|trig/);
  });
});
