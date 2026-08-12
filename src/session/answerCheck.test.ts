import { describe, expect, it } from 'vitest';
import { checkAnswer, numericallyEqual, parseNumeric } from './answerCheck';
import { ITEMS } from '../../content';
import type { Item } from '../domain/types';

const byId = new Map(ITEMS.map((i) => [i.id, i]));

describe('numeric parsing', () => {
  it('accepts decimals, leading dots, and negatives', () => {
    expect(parseNumeric('0.28')).toBeCloseTo(0.28);
    expect(parseNumeric('.28')).toBeCloseTo(0.28);
    expect(parseNumeric('-1')).toBe(-1);
    expect(parseNumeric(' 150 ')).toBe(150);
  });

  it('accepts fractions', () => {
    expect(parseNumeric('7/25')).toBeCloseTo(0.28);
    expect(parseNumeric('5/2')).toBeCloseTo(2.5);
    expect(parseNumeric('-3/4')).toBeCloseTo(-0.75);
  });

  it('rejects nonsense and division by zero', () => {
    expect(parseNumeric('abc')).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('1/0')).toBeNull();
    expect(parseNumeric('1..2')).toBeNull();
  });

  it('treats values equal within a relative tolerance', () => {
    expect(numericallyEqual(4.47, 4.472)).toBe(true);
    expect(numericallyEqual(0.28, 7 / 25)).toBe(true);
    expect(numericallyEqual(150, 151)).toBe(false);
  });
});

describe('answer checking', () => {
  it('marks the correct multiple-choice option', () => {
    const item = byId.get('m-lin1-001')!;
    expect(checkAnswer(item, 'A').correct).toBe(true);
    expect(checkAnswer(item, 'a').correct).toBe(true);
    expect(checkAnswer(item, 'B').correct).toBe(false);
    expect(checkAnswer(item, '').correct).toBe(false);
  });

  it('accepts equivalent forms of a student-produced response', () => {
    // The key lists 0.28, .28, and 7/25 — all three must pass, and so must an
    // unlisted-but-equal form.
    const item = byId.get('m-prob-006')!;
    expect(checkAnswer(item, '0.28').correct).toBe(true);
    expect(checkAnswer(item, '.28').correct).toBe(true);
    expect(checkAnswer(item, '7/25').correct).toBe(true);
    expect(checkAnswer(item, '14/50').correct).toBe(true);
    expect(checkAnswer(item, '0.3').correct).toBe(false);
  });

  it('accepts a rounded answer where the key allows it', () => {
    const item = byId.get('m-area-006')!;
    expect(checkAnswer(item, '4.47').correct).toBe(true);
    expect(checkAnswer(item, '4.472').correct).toBe(true);
    expect(checkAnswer(item, '4.5').correct).toBe(false);
  });

  it('handles negative student-produced answers', () => {
    const item = byId.get('m-lin2-002')!;
    expect(checkAnswer(item, '-1').correct).toBe(true);
    expect(checkAnswer(item, '1').correct).toBe(false);
  });

  it('rejects an empty or unparseable response', () => {
    const item = byId.get('m-sys-001')!;
    expect(checkAnswer(item, '   ').correct).toBe(false);
    expect(checkAnswer(item, 'seven').correct).toBe(false);
    expect(checkAnswer(item, '7').correct).toBe(true);
  });

  it('checks every student-produced item in the bank against its own key', () => {
    // Guards against an authoring mistake where a key is unparseable and would
    // therefore mark every response wrong.
    const sprItems = ITEMS.filter((i: Item) => i.itemType === 'spr');
    expect(sprItems.length).toBeGreaterThan(0);

    for (const item of sprItems) {
      const forms = Array.isArray(item.answer) ? item.answer : [item.answer];
      for (const form of forms) {
        expect(checkAnswer(item, form).correct, `${item.id} rejects its own key "${form}"`).toBe(
          true
        );
      }
    }
  });
});
