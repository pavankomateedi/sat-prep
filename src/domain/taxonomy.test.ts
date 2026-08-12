import { describe, expect, it } from 'vitest';
import {
  ALL_DOMAINS,
  ALL_SKILLS,
  SECTIONS,
  getDomain,
  getSkill,
  overallDomainWeight,
  sectionOfSkill,
} from './taxonomy';

/**
 * T-01 acceptance criteria: "every domain has a documented list of child skill
 * tags with no overlaps."
 */
describe('skill-tag taxonomy (T-01)', () => {
  it('covers exactly the 8 official domains, 4 per section', () => {
    expect(ALL_DOMAINS).toHaveLength(8);
    for (const section of SECTIONS) {
      expect(section.domains).toHaveLength(4);
    }
  });

  it('assigns every skill to exactly one domain — no overlaps', () => {
    const ids = ALL_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Each skill's self-reported domain must match the domain that contains it.
    for (const domain of ALL_DOMAINS) {
      for (const skill of domain.skills) {
        expect(skill.domain).toBe(domain.id);
      }
    }
  });

  it('gives every domain at least one documented skill', () => {
    for (const domain of ALL_DOMAINS) {
      expect(domain.skills.length).toBeGreaterThan(0);
      for (const skill of domain.skills) {
        expect(skill.name.length).toBeGreaterThan(0);
        expect(skill.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('has domain weights summing to 1.0 within each section', () => {
    for (const section of SECTIONS) {
      const total = section.domains.reduce((sum, d) => sum + d.weight, 0);
      // PRD §1.3 weights are approximate and published to the nearest percent.
      expect(total).toBeCloseTo(1.0, 2);
    }
  });

  it('matches the PRD §1.1 module structure', () => {
    const rw = SECTIONS.find((s) => s.id === 'rw')!;
    const math = SECTIONS.find((s) => s.id === 'math')!;

    expect(rw.questionCount).toBe(54);
    expect(rw.questionsPerModule * 2).toBe(rw.questionCount);
    expect(rw.minutesPerModule * 2).toBe(rw.minutes);

    expect(math.questionCount).toBe(44);
    expect(math.questionsPerModule * 2).toBe(math.questionCount);
    expect(math.minutesPerModule * 2).toBe(math.minutes);

    // Whole-test totals from PRD §1.1: 98 questions, 134 minutes.
    expect(rw.questionCount + math.questionCount).toBe(98);
    expect(rw.minutes + math.minutes).toBe(134);
  });

  it('resolves lookups and rejects unknown ids', () => {
    expect(getSkill('circles').domain).toBe('geometry_and_trigonometry');
    expect(getDomain('algebra').section).toBe('math');
    expect(sectionOfSkill('transitions')).toBe('rw');
    expect(() => getSkill('not_a_skill' as never)).toThrow(/Unknown skill/);
    expect(() => getDomain('not_a_domain' as never)).toThrow(/Unknown domain/);
  });

  it('renormalises domain weights across the whole test to 1.0', () => {
    const total = ALL_DOMAINS.reduce((sum, d) => sum + overallDomainWeight(d.id), 0);
    expect(total).toBeCloseTo(1.0, 2);

    // R&W is 54/98 of administered items, so Craft & Structure (28% of R&W)
    // should outweigh Geometry (15% of Math) overall.
    expect(overallDomainWeight('craft_and_structure')).toBeGreaterThan(
      overallDomainWeight('geometry_and_trigonometry')
    );
  });
});
