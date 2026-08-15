/**
 * Expression parser and evaluator for the built-in calculator.
 *
 * The real Digital SAT embeds Desmos on every Math question, so a prep app
 * without a calculator is not practising the same test. Desmos's own API has to
 * load from their CDN, which would put a network dependency on a core screen —
 * so this exists as the offline path (see src/ui/Calculator.tsx for how the two
 * are chosen between).
 *
 * Deliberately a small, complete recursive-descent parser rather than a
 * dependency: it has to run offline, the grammar is tiny, and `eval` is not an
 * option on user input. Every operator and function below is one the SAT
 * actually requires.
 */

export type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

export class ExpressionError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(message);
    this.name = 'ExpressionError';
  }
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

/** Single-argument functions, plus the two-argument ones handled separately. */
const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
};

const BINARY_FUNCTIONS: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  // Odd roots of negatives are real (cbrt(-8) = -2); even roots are not.
  // Returning -4 for nthroot(-16, 2) would contradict sqrt(-16) giving NaN and
  // affirm a value that does not exist on a domain question.
  nthroot: (a, b) => {
    if (a < 0) {
      const isOddInteger = Number.isInteger(b) && Math.abs(b % 2) === 1;
      if (!isOddInteger) return Number.NaN;
      return -(Math.abs(a) ** (1 / b));
    }
    return a ** (1 / b);
  },
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j += 1;

      // Scientific notation: consume `e`/`E` only when a digit actually
      // follows (optionally signed). Without this, `6.02e23` tokenises as
      // 6.02 * e * 23 via implicit multiplication with Euler's constant and
      // returns a confidently wrong number — and the calculator's own
      // formatResult output could not be re-entered. The digit requirement is
      // what keeps `2e` meaning 2 x Euler's constant.
      if (j < input.length && /[eE]/.test(input[j]!)) {
        let k = j + 1;
        if (k < input.length && /[+-]/.test(input[k]!)) k += 1;
        if (k < input.length && /[0-9]/.test(input[k]!)) {
          while (k < input.length && /[0-9]/.test(input[k]!)) k += 1;
          j = k;
        }
      }

      const raw = input.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new ExpressionError(`Bad number "${raw}"`, i);
      tokens.push({ kind: 'number', value });
      i = j;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j]!)) j += 1;
      tokens.push({ kind: 'name', value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }

    if ('+-*/^%'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i += 1;
      continue;
    }

    throw new ExpressionError(`Unexpected character "${ch}"`, i);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser — precedence climbing
// ---------------------------------------------------------------------------

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'unary'; op: string; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

interface ParserState {
  tokens: Token[];
  pos: number;
}

function peek(s: ParserState): Token | undefined {
  return s.tokens[s.pos];
}

/** Handles only + - * / % — exponentiation lives in parsePower, below. */
function parseExpression(s: ParserState, minPrecedence = 0): Node {
  let left = parseUnary(s);

  for (;;) {
    const token = peek(s);
    if (!token || token.kind !== 'op') break;

    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 }[token.value];
    if (precedence === undefined || precedence < minPrecedence) break;

    s.pos += 1;
    const right = parseExpression(s, precedence + 1);
    left = { kind: 'binary', op: token.value, left, right };
  }

  return left;
}

function parseUnary(s: ParserState): Node {
  const token = peek(s);
  if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
    s.pos += 1;
    // Looser than '^', so -3^2 is -(3^2) = -9, as it is written on the test.
    return { kind: 'unary', op: token.value, operand: parseUnary(s) };
  }
  return parseImplicitProduct(s);
}

/**
 * Exponentiation, right-associative: 2^3^2 is 2^(3^2).
 *
 * Sits *below* implicit multiplication so that each factor takes its own
 * exponent — `2x^2` must parse as 2*(x^2), not (2x)^2. Getting this backwards
 * silently returns wrong answers on some of the most common expressions a
 * student types, which is worse than refusing to parse them.
 */
function parsePower(s: ParserState): Node {
  const base = parsePrimary(s);
  const token = peek(s);
  if (token?.kind === 'op' && token.value === '^') {
    s.pos += 1;
    return { kind: 'binary', op: '^', left: base, right: parseUnary(s) };
  }
  return base;
}

/**
 * Implicit multiplication, which students type constantly: `2x`, `3(x+1)`,
 * `2sin(x)`. Rejecting those would make the calculator feel broken.
 */
function parseImplicitProduct(s: ParserState): Node {
  let node = parsePower(s);

  for (;;) {
    const token = peek(s);
    if (!token) break;
    const implicit =
      token.kind === 'number' || token.kind === 'name' || token.kind === 'lparen';
    if (!implicit) break;
    node = { kind: 'binary', op: '*', left: node, right: parsePower(s) };
  }

  return node;
}

function parsePrimary(s: ParserState): Node {
  const token = peek(s);
  if (!token) throw new ExpressionError('Unexpected end of expression');

  if (token.kind === 'number') {
    s.pos += 1;
    return { kind: 'number', value: token.value };
  }

  if (token.kind === 'lparen') {
    s.pos += 1;
    const inner = parseExpression(s);
    if (peek(s)?.kind !== 'rparen') throw new ExpressionError('Missing closing bracket');
    s.pos += 1;
    return inner;
  }

  if (token.kind === 'name') {
    s.pos += 1;
    const name = token.value;

    if (peek(s)?.kind === 'lparen') {
      s.pos += 1;
      const args: Node[] = [];
      if (peek(s)?.kind !== 'rparen') {
        args.push(parseExpression(s));
        while (peek(s)?.kind === 'comma') {
          s.pos += 1;
          args.push(parseExpression(s));
        }
      }
      if (peek(s)?.kind !== 'rparen') throw new ExpressionError('Missing closing bracket');
      s.pos += 1;
      return { kind: 'call', name, args };
    }

    return { kind: 'variable', name };
  }

  throw new ExpressionError('Unexpected symbol');
}

/**
 * Strip a leading `y =` or `f(x) =`.
 *
 * Students write functions that way, and the calculator's own placeholder
 * suggests it. `=` is not a token the grammar accepts, so without this the
 * documented example returns a tokeniser error.
 */
export function stripFunctionPrefix(input: string): string {
  return input.replace(/^\s*(?:y|f\s*\(\s*[a-zA-Z]\s*\))\s*=\s*/i, '');
}

export function parse(input: string): Node {
  const trimmed = stripFunctionPrefix(input).trim();
  if (trimmed === '') throw new ExpressionError('Empty expression');
  const state: ParserState = { tokens: tokenize(trimmed), pos: 0 };
  const node = parseExpression(state);
  if (state.pos < state.tokens.length) throw new ExpressionError('Unexpected trailing input');
  return node;
}

/**
 * Whether an expression actually references a variable.
 *
 * Decided by parsing, not by regex. A word-boundary test like `/\bx\b/` fails
 * on every implicit-product form — `2x`, `3x+1`, `2x^2` — because the
 * preceding digit is itself a word character, which routed exactly the
 * expressions this calculator exists to graph into the scalar evaluator.
 */
export function usesVariable(input: string, name = 'x'): boolean {
  let node: Node;
  try {
    node = parse(input);
  } catch {
    // Unparseable input still counts as a graph attempt if the letter is
    // present, so the student sees a parse error rather than "cannot evaluate".
    return new RegExp(`(^|[^a-zA-Z])${name}([^a-zA-Z]|$)`).test(input);
  }

  const walk = (current: Node): boolean => {
    switch (current.kind) {
      case 'variable':
        return current.name === name;
      case 'unary':
        return walk(current.operand);
      case 'binary':
        return walk(current.left) || walk(current.right);
      case 'call':
        return current.args.some(walk);
      default:
        return false;
    }
  };

  return walk(node);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluate(node: Node, variables: Record<string, number> = {}): number {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'variable': {
      if (node.name in variables) return variables[node.name]!;
      if (node.name in CONSTANTS) return CONSTANTS[node.name]!;
      throw new ExpressionError(`Unknown value "${node.name}"`);
    }

    case 'unary': {
      const value = evaluate(node.operand, variables);
      return node.op === '-' ? -value : value;
    }

    case 'binary': {
      const a = evaluate(node.left, variables);
      const b = evaluate(node.right, variables);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        // Division by zero yields Infinity/NaN rather than throwing — the
        // grapher needs to skip those points, not abort the whole plot.
        case '/': return a / b;
        case '%': return a % b;
        case '^': return a ** b;
        default: throw new ExpressionError(`Unknown operator "${node.op}"`);
      }
    }

    case 'call': {
      const unary = FUNCTIONS[node.name];
      if (unary) {
        if (node.args.length !== 1) {
          throw new ExpressionError(`${node.name} takes one argument`);
        }
        return unary(evaluate(node.args[0]!, variables));
      }

      const binary = BINARY_FUNCTIONS[node.name];
      if (binary) {
        if (node.args.length !== 2) {
          throw new ExpressionError(`${node.name} takes two arguments`);
        }
        return binary(
          evaluate(node.args[0]!, variables),
          evaluate(node.args[1]!, variables)
        );
      }

      throw new ExpressionError(`Unknown function "${node.name}"`);
    }
  }
}

/** Parse and evaluate in one step. Returns null on any error. */
export function tryEvaluate(
  input: string,
  variables: Record<string, number> = {}
): number | null {
  try {
    const value = evaluate(parse(input), variables);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plotting
// ---------------------------------------------------------------------------

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const DEFAULT_VIEWPORT: Viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

/** A run of consecutive plottable points. Breaks mark asymptotes and gaps. */
export type PlotSegment = { x: number; y: number }[];

/**
 * Sample a function across the viewport.
 *
 * Splits into segments rather than returning one list, so a discontinuity like
 * 1/x is drawn as two curves instead of a vertical line joining them across the
 * asymptote — which is what a naive polyline does and what makes home-made
 * graphers look wrong.
 */
export function plot(
  expression: string,
  viewport: Viewport = DEFAULT_VIEWPORT,
  samples = 240
): { segments: PlotSegment[]; error: string | null } {
  let node: Node;
  try {
    node = parse(expression);
  } catch (error) {
    return {
      segments: [],
      error: error instanceof Error ? error.message : 'Invalid expression',
    };
  }

  const segments: PlotSegment[] = [];
  let current: PlotSegment = [];
  const step = (viewport.xMax - viewport.xMin) / samples;
  // A jump larger than the whole visible height is a discontinuity, not a curve.
  const jumpLimit = (viewport.yMax - viewport.yMin) * 2;
  let previousY: number | null = null;

  for (let i = 0; i <= samples; i += 1) {
    const x = viewport.xMin + i * step;
    let y: number;
    try {
      y = evaluate(node, { x });
    } catch {
      return { segments: [], error: 'Could not evaluate' };
    }

    const plottable = Number.isFinite(y);
    const jumped = previousY !== null && Math.abs(y - previousY) > jumpLimit;

    if (!plottable || jumped) {
      if (current.length > 1) segments.push(current);
      current = [];
      previousY = plottable ? y : null;
      if (!plottable) continue;
    }

    current.push({ x, y });
    previousY = y;
  }

  if (current.length > 1) segments.push(current);
  return { segments, error: null };
}

/** Approximate x-intercepts by sign change, refined by bisection. */
export function findRoots(expression: string, viewport: Viewport, samples = 400): number[] {
  let node: Node;
  try {
    node = parse(expression);
  } catch {
    return [];
  }

  const at = (x: number): number | null => {
    try {
      const y = evaluate(node, { x });
      return Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
  };

  const roots: number[] = [];
  const step = (viewport.xMax - viewport.xMin) / samples;
  let previousX = viewport.xMin;
  let previousY = at(previousX);

  for (let i = 1; i <= samples; i += 1) {
    const x = viewport.xMin + i * step;
    const y = at(x);

    if (previousY !== null && y !== null && previousY !== 0 && previousY * y < 0) {
      // Bisect into the bracketed interval.
      let lo = previousX;
      let hi = x;
      let loY = previousY;
      for (let iteration = 0; iteration < 40; iteration += 1) {
        const mid = (lo + hi) / 2;
        const midY = at(mid);
        if (midY === null) break;
        if (loY * midY <= 0) hi = mid;
        else {
          lo = mid;
          loY = midY;
        }
      }
      roots.push(Number(((lo + hi) / 2).toFixed(6)));
    } else if (y === 0) {
      roots.push(Number(x.toFixed(6)));
    }

    previousX = x;
    previousY = y;
  }

  return roots;
}

/** Format a result the way a calculator display should. */
export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'undefined' : '∞';

  // Magnitude check comes first: 1.5e12 is an integer, but printing it as
  // 1500000000000 is unreadable on a calculator display.
  const magnitude = Math.abs(value);
  if (magnitude >= 1e10 || (magnitude < 1e-6 && value !== 0)) {
    return value.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
  }

  if (Number.isInteger(value)) return String(value);
  // Trim floating-point noise: 0.30000000000000004 should read 0.3.
  return String(Number(value.toPrecision(12)));
}
