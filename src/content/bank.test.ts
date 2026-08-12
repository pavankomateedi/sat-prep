import { describe, expect, it } from 'vitest';
import { ITEMS, PASSAGES } from '../../content';
import { itemSchema, passageSchema, validateBank } from './schema';
import { ALL_SKILLS } from '../domain/taxonomy';

/**
 * T-02 / T-03 acceptance criteria: every domain has items across at least two
 * difficulty labels, every item validates, and every item's licensing
 * provenance is recorded (T-21).
 */
describe('item bank', () => {
  it('validates every item against the content schema', () => {
    const failures: string[] = [];
    for (const item of ITEMS) {
      const result = itemSchema.safeParse(item);
      if (!result.success) {
        failures.push(
          `${item.id}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it('validates every passage against the content schema', () => {
    for (const passage of PASSAGES) {
      expect(passageSchema.safeParse(passage).success).toBe(true);
    }
  });

  it('passes bank-level validation with no errors', () => {
    const result = validateBank(ITEMS, PASSAGES);
    const errors = result.issues.filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('covers all 30 skills at the launch bar', () => {
    const { coverage } = validateBank(ITEMS, PASSAGES);
    expect(coverage).toHaveLength(ALL_SKILLS.length);
    for (const entry of coverage) {
      expect(entry.itemCount, `skill ${entry.skillId}`).toBeGreaterThanOrEqual(6);
      expect(entry.difficulties.length, `skill ${entry.skillId}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('records licensing provenance for every item (T-21)', () => {
    for (const item of ITEMS) {
      expect(item.source, `item ${item.id}`).toBeDefined();
      expect(item.source.kind, `item ${item.id}`).toBeTruthy();
      // Official College Board material must never be re-typeset into the bank.
      expect(item.source.kind, `item ${item.id}`).not.toBe('official_as_delivered');
    }
  });

  it('has unique ids', () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives student-produced-response items only to Math', () => {
    for (const item of ITEMS.filter((i) => i.itemType === 'spr')) {
      expect(item.section, `item ${item.id}`).toBe('math');
      expect(Array.isArray(item.answer), `item ${item.id}`).toBe(true);
    }
  });
});
