import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT,
  ExpressionError,
  findRoots,
  formatResult,
  parse,
  plot,
  stripFunctionPrefix,
  tryEvaluate,
  usesVariable,
} from './expression';

const ev = (input: string, vars?: Record<string, number>) => tryEvaluate(input, vars);

describe('arithmetic', () => {
  it('applies operator precedence', () => {
    expect(ev('2 + 3 * 4')).toBe(14);
    expect(ev('(2 + 3) * 4')).toBe(20);
    expect(ev('10 - 2 - 3')).toBe(5); // left-associative
  });

  it('makes exponentiation right-associative', () => {
    // 2^(3^2) = 2^9 = 512, not (2^3)^2 = 64.
    expect(ev('2^3^2')).toBe(512);
  });

  it('binds unary minus looser than exponentiation', () => {
    // -x^2 is -(x^2), which is how it is written on the test.
    expect(ev('-3^2')).toBe(-9);
    expect(ev('(-3)^2')).toBe(9);
  });

  it('handles decimals and negative numbers', () => {
    expect(ev('0.1 + 0.2')).toBeCloseTo(0.3, 10);
    expect(ev('-5 + 3')).toBe(-2);
  });
});

describe('implicit multiplication', () => {
  it('accepts the forms students actually type', () => {
    expect(ev('2x', { x: 5 })).toBe(10);
    expect(ev('3(2 + 1)')).toBe(9);
    expect(ev('2(3)(4)')).toBe(24);
    expect(ev('2sqrt(9)')).toBe(6);
  });

  it('still respects precedence with implicit products', () => {
    expect(ev('2x^2', { x: 3 })).toBe(18); // 2*(x^2), not (2x)^2
  });
});

describe('functions and constants', () => {
  it('evaluates the functions the SAT needs', () => {
    expect(ev('sqrt(16)')).toBe(4);
    expect(ev('abs(-7)')).toBe(7);
    expect(ev('log(1000)')).toBeCloseTo(3, 10);
    expect(ev('ln(e)')).toBeCloseTo(1, 10);
    expect(ev('min(3, 8)')).toBe(3);
    expect(ev('max(3, 8)')).toBe(8);
  });

  it('evaluates trigonometry in radians, as the test does', () => {
    expect(ev('sin(0)')).toBe(0);
    expect(ev('cos(0)')).toBe(1);
    expect(ev('sin(pi/2)')).toBeCloseTo(1, 10);
  });

  it('knows pi and e', () => {
    expect(ev('pi')).toBeCloseTo(Math.PI, 10);
    expect(ev('e')).toBeCloseTo(Math.E, 10);
  });

  it('substitutes variables', () => {
    expect(ev('3x + 7', { x: 5 })).toBe(22);
    expect(ev('x^2 - 4', { x: 3 })).toBe(5);
  });
});

describe('error handling', () => {
  it('rejects malformed input rather than guessing', () => {
    expect(ev('2 +')).toBeNull();
    expect(ev('(2 + 3')).toBeNull();
    expect(ev('')).toBeNull();
    expect(ev('2 @ 3')).toBeNull();
    expect(ev('nosuchfn(2)')).toBeNull();
  });

  it('returns null for an unbound variable instead of assuming zero', () => {
    expect(ev('x + 1')).toBeNull();
  });

  it('reports non-finite results as null', () => {
    expect(ev('1/0')).toBeNull();
    expect(ev('sqrt(-1)')).toBeNull();
  });

  it('throws a typed error from parse()', () => {
    expect(() => parse('2 +')).toThrow(ExpressionError);
  });

  it('never evaluates arbitrary code', () => {
    // The parser only knows numbers, names, and operators — there is no path
    // from user input to execution.
    expect(ev('process.exit(1)')).toBeNull();
    expect(ev('constructor')).toBeNull();
  });
});

describe('plotting', () => {
  it('samples a straight line across the viewport', () => {
    const { segments, error } = plot('2x + 1', DEFAULT_VIEWPORT);
    expect(error).toBeNull();
    expect(segments).toHaveLength(1);

    const points = segments[0]!;
    expect(points.length).toBeGreaterThan(100);
    for (const { x, y } of points) expect(y).toBeCloseTo(2 * x + 1, 8);
  });

  it('splits a discontinuous function rather than drawing across the asymptote', () => {
    // The classic home-made-grapher bug: 1/x joined by a vertical line at x=0.
    const { segments } = plot('1/x', DEFAULT_VIEWPORT);
    expect(segments.length).toBeGreaterThanOrEqual(2);

    for (const segment of segments) {
      const signs = new Set(segment.map((p) => Math.sign(p.x)));
      expect(signs.size).toBe(1);
    }
  });

  it('reports a parse failure instead of drawing nothing silently', () => {
    const { segments, error } = plot('2 +', DEFAULT_VIEWPORT);
    expect(segments).toEqual([]);
    expect(error).toBeTruthy();
  });

  it('omits points where the function is undefined', () => {
    const { segments } = plot('sqrt(x)', DEFAULT_VIEWPORT);
    for (const segment of segments) {
      for (const point of segment) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });
});

describe('roots', () => {
  it('finds the zeros of a quadratic', () => {
    const roots = findRoots('x^2 - 4', DEFAULT_VIEWPORT);
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => Math.round(r * 1000) / 1000).sort((a, b) => a - b)).toEqual([-2, 2]);
  });

  it('finds a single root of a line', () => {
    const roots = findRoots('2x + 6', DEFAULT_VIEWPORT);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBeCloseTo(-3, 4);
  });

  it('returns nothing when the curve never crosses the axis', () => {
    expect(findRoots('x^2 + 1', DEFAULT_VIEWPORT)).toEqual([]);
  });
});

describe('display formatting', () => {
  it('shows integers without decimal noise', () => {
    expect(formatResult(4)).toBe('4');
    expect(formatResult(-12)).toBe('-12');
  });

  it('trims floating-point artefacts', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
    expect(formatResult(1 / 3)).toMatch(/^0\.333333/);
  });

  it('falls back to scientific notation at the extremes', () => {
    expect(formatResult(1.5e12)).toMatch(/e\+?12/);
    expect(formatResult(0.0000000123)).toMatch(/e-08/);
  });

  it('labels non-finite results in words rather than showing NaN', () => {
    expect(formatResult(Number.NaN)).toBe('undefined');
    expect(formatResult(Number.POSITIVE_INFINITY)).toBe('∞');
  });
});

describe('regressions found in review', () => {
  it('detects the variable in implicit-product forms', () => {
    // `/\bx\b/` returns false for all of these: a digit is a word character,
    // so there is no boundary before the x. They were routed to the scalar
    // evaluator and reported as unevaluable.
    for (const input of ['2x', '3x+1', '2x^2 - 4', '2sqrt(x)', '3(x+1)']) {
      expect(usesVariable(input), input).toBe(true);
    }
    for (const input of ['2 + 3', 'sqrt(16)', 'pi * 2']) {
      expect(usesVariable(input), input).toBe(false);
    }
  });

  it('parses scientific notation instead of multiplying by Euler’s constant', () => {
    // 6.02e23 tokenised as 6.02 * e * 23 and returned ~376 with no error.
    expect(ev('6.02e23')).toBeCloseTo(6.02e23, -18);
    expect(ev('1.5e3')).toBe(1500);
    expect(ev('1.5e+3')).toBe(1500);
    expect(ev('2e-3')).toBeCloseTo(0.002, 10);
  });

  it('round-trips its own formatted output', () => {
    // formatResult emits exponential form, which previously could not be
    // re-entered into the calculator.
    for (const value of [1.5e12, 0.0000000123, 42, 1 / 3]) {
      const rendered = formatResult(value);
      expect(ev(rendered), rendered).toBeCloseTo(value, 6);
    }
  });

  it('still reads a bare e as Euler’s constant', () => {
    expect(ev('2e')).toBeCloseTo(2 * Math.E, 10);
    expect(ev('e')).toBeCloseTo(Math.E, 10);
  });

  it('accepts the y = form the placeholder suggests', () => {
    expect(stripFunctionPrefix('y = x^2 - 4')).toBe('x^2 - 4');
    expect(stripFunctionPrefix('f(x) = 2x + 1')).toBe('2x + 1');
    expect(ev('y = 3 * 4')).toBe(12);
    expect(plot('y = x^2 - 4', DEFAULT_VIEWPORT).error).toBeNull();
  });

  it('returns NaN for even roots of negatives, matching sqrt', () => {
    // nthroot(-16, 2) previously returned -4, contradicting sqrt(-16) = NaN.
    expect(ev('nthroot(-16, 2)')).toBeNull();
    expect(ev('nthroot(-8, 3)')).toBeCloseTo(-2, 10);
    expect(ev('nthroot(16, 2)')).toBeCloseTo(4, 10);
  });
});
