import { describe, expect, it } from 'vitest';
import {
  parseMath,
  parseMixed,
  THIN_SPACE,
  toPlainText,
  unsupportedCommands,
} from './mathParser';
import { ITEMS } from '../../content';

const render = (source: string) => toPlainText(parseMath(source));

describe('math parsing', () => {
  it('passes plain algebra through unchanged', () => {
    expect(render('3x + 7 = 22')).toBe('3x + 7 = 22');
  });

  it('maps symbol commands to characters', () => {
    expect(render('\\pi')).toBe('π');
    expect(render('2\\times 3')).toBe('2× 3');
    expect(render('x \\le 5')).toBe('x ≤ 5');
    expect(render('90\\circ')).toBe('90°');
  });

  it('separates function names from their argument with a thin space', () => {
    // Composed from the exported constant rather than a typed literal: the
    // separator is U+2009, which is visually indistinguishable from a normal
    // space in source and would otherwise make this assertion untrustworthy.
    expect(render('\\sin\\theta')).toBe(`sin${THIN_SPACE}θ`);
    expect(THIN_SPACE).toBe(' ');
  });

  it('parses superscripts, attaching only to the preceding character', () => {
    const nodes = parseMath('2x^2');
    expect(toPlainText(nodes)).toBe('2x^2');
    // "2" stays plain text; only "x" carries the exponent.
    expect(nodes[0]).toEqual({ kind: 'text', value: '2' });
    expect(nodes[1]!.kind).toBe('sup');
  });

  it('parses braced superscripts', () => {
    expect(render('3^{x + 1}')).toBe('3^x + 1');
    const nodes = parseMath('3^{x+1}');
    const sup = nodes.find((n) => n.kind === 'sup');
    expect(sup).toBeDefined();
  });

  it('parses fractions including nested ones', () => {
    expect(render('\\frac{1}{2}')).toBe('(1)/(2)');
    expect(render('\\frac{5\\pi}{6}')).toBe('(5π)/(6)');
    expect(render('\\frac{x+1}{\\frac{1}{2}}')).toBe('(x+1)/((1)/(2))');
  });

  it('parses square roots', () => {
    expect(render('\\sqrt{50x^3}')).toBe('sqrt(50x^3)');
    // Without braces, the root takes a single token.
    expect(render('\\sqrt2')).toBe('sqrt(2)');
  });

  it('handles LaTeX thousands separators', () => {
    expect(render('1{,}200')).toBe('1,200');
  });

  it('handles escaped dollar signs', () => {
    expect(render('\\$45')).toBe('$45');
  });

  it('splits mixed text and math on dollar delimiters', () => {
    const segments = parseMixed('If $3x = 9$, what is $x$?');
    expect(segments.map((s) => s.kind)).toEqual(['text', 'math', 'text', 'math', 'text']);
    expect(segments[0]).toEqual({ kind: 'text', value: 'If ' });
  });

  it('leaves text with no math as a single segment', () => {
    const segments = parseMixed('Which choice completes the text?');
    expect(segments).toHaveLength(1);
    expect(segments[0]!.kind).toBe('text');
  });

  it('terminates on malformed input rather than looping', () => {
    expect(() => parseMath('\\frac{1}')).not.toThrow();
    expect(() => parseMath('{{{')).not.toThrow();
    expect(() => parseMath('^')).not.toThrow();
    expect(() => parseMixed('$unclosed')).not.toThrow();
  });
});

describe('bank stays inside the supported subset', () => {
  it('uses no LaTeX command the renderer cannot draw', () => {
    const offenders: string[] = [];

    for (const item of ITEMS) {
      const texts = [
        item.stem,
        item.rationale,
        ...(item.choices ?? []).map((c) => c.text),
      ];
      for (const text of texts) {
        const unsupported = unsupportedCommands(text);
        if (unsupported.length > 0) offenders.push(`${item.id}: ${unsupported.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('renders every math-bearing stem to non-empty output', () => {
    const mathItems = ITEMS.filter((i) => i.stem.includes('$'));
    expect(mathItems.length).toBeGreaterThan(50);

    for (const item of mathItems) {
      const segments = parseMixed(item.stem);
      expect(segments.length, item.id).toBeGreaterThan(0);
      for (const segment of segments) {
        const rendered =
          segment.kind === 'text' ? segment.value : toPlainText(segment.nodes);
        expect(rendered.length, `${item.id} produced an empty segment`).toBeGreaterThan(0);
      }
    }
  });
});
