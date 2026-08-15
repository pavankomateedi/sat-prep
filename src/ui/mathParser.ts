/**
 * A parser for the LaTeX subset the item bank actually uses.
 *
 * ## Why not KaTeX
 *
 * PRD §2.5 suggests KaTeX, which in React Native means a WebView per rendered
 * expression. That costs a WebView instance for every math item in a scrolling
 * session, needs the KaTeX bundle shipped as an offline asset, and produces
 * text the screen reader cannot reach.
 *
 * The bank uses a closed set of 15 commands — \frac, \sqrt, \pi, \times, \le,
 * \ge, \cdot, \circ, \sin, \cos, \tan, \theta, \approx, \pm, \ne — plus
 * superscripts, subscripts, and grouping. That is small enough to render
 * natively with real Text nodes: no WebView, genuinely offline, fast in a list,
 * and accessible.
 *
 * The trade is that unsupported commands degrade rather than render. The
 * content validator constrains what authors can write, and `unsupportedCommands`
 * below lets a test assert the whole bank stays inside the subset.
 */

export type MathNode =
  | { kind: 'text'; value: string }
  | { kind: 'sup'; base: MathNode[]; exponent: MathNode[] }
  | { kind: 'sub'; base: MathNode[]; index: MathNode[] }
  | { kind: 'frac'; numerator: MathNode[]; denominator: MathNode[] }
  | { kind: 'sqrt'; radicand: MathNode[] };

/** Commands that map to a single character. */
export const SYMBOLS: Record<string, string> = {
  pi: 'π',
  theta: 'θ',
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  le: '≤',
  ge: '≥',
  ne: '≠',
  approx: '≈',
  circ: '°',
  infty: '∞',
  alpha: 'α',
  beta: 'β',
  Delta: 'Δ',
  ldots: '…',
  // Script l, the conventional name for a line in coordinate geometry.
  ell: 'ℓ',
  // Function names render upright, which is what the spacing below achieves.
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  log: 'log',
  ln: 'ln',
};

const STRUCTURAL = new Set(['frac', 'sqrt']);

/**
 * Gap between a function name and its argument: "sin θ", not "sinθ".
 *
 * A thin space rather than a normal one, matching how LaTeX sets operator
 * names — a full space reads as a word break and makes "sin θ" look like two
 * unrelated terms.
 */
export const THIN_SPACE = ' ';

/**
 * Characters that are legitimately backslash-escaped to render as themselves.
 * `\%` is how a literal percent sign is written, `\$` a dollar that must not be
 * read as a math delimiter.
 */
const ESCAPED_LITERALS = new Set(['$', '%', '&', '#', '_', '{', '}', '\\']);

/**
 * LaTeX spacing commands. These are *not* escaped literals — `\;` means a
 * thick space, never a semicolon — so the parser emits whitespace for them.
 * Treating them as literals put stray semicolons in the formula sheet.
 */
const SPACING_COMMANDS = new Set([';', ',', ':', '!', ' ']);

interface Cursor {
  source: string;
  pos: number;
}

function peek(c: Cursor): string | undefined {
  return c.source[c.pos];
}

/** Read a `{...}` group, or a single character if no brace follows. */
function readGroup(c: Cursor): MathNode[] {
  if (peek(c) === '{') {
    c.pos += 1;
    const nodes = parseNodes(c, true);
    if (peek(c) === '}') c.pos += 1;
    return nodes;
  }

  if (peek(c) === '\\') {
    const start = c.pos;
    c.pos += 1;
    while (c.pos < c.source.length && /[a-zA-Z]/.test(c.source[c.pos]!)) c.pos += 1;
    const command = c.source.slice(start + 1, c.pos);
    return [{ kind: 'text', value: SYMBOLS[command] ?? command }];
  }

  const ch = c.source[c.pos];
  if (ch === undefined) return [];
  c.pos += 1;
  return [{ kind: 'text', value: ch }];
}

function pushText(nodes: MathNode[], value: string): void {
  const last = nodes[nodes.length - 1];
  if (last && last.kind === 'text') last.value += value;
  else nodes.push({ kind: 'text', value });
}

function parseNodes(c: Cursor, insideGroup: boolean): MathNode[] {
  const nodes: MathNode[] = [];

  while (c.pos < c.source.length) {
    const ch = c.source[c.pos]!;

    if (ch === '}' && insideGroup) break;

    if (ch === '\\') {
      const start = c.pos;
      c.pos += 1;

      // Escaped literals such as \$ or \%, and spacing commands such as \;.
      if (c.pos < c.source.length && !/[a-zA-Z]/.test(c.source[c.pos]!)) {
        const ch = c.source[c.pos]!;
        // A spacing command is whitespace, not the punctuation character —
        // rendering `\;` as a semicolon put stray marks in the formula sheet.
        pushText(nodes, SPACING_COMMANDS.has(ch) ? THIN_SPACE : ch);
        c.pos += 1;
        continue;
      }

      while (c.pos < c.source.length && /[a-zA-Z]/.test(c.source[c.pos]!)) c.pos += 1;
      const command = c.source.slice(start + 1, c.pos);

      if (command === 'frac') {
        const numerator = readGroup(c);
        const denominator = readGroup(c);
        nodes.push({ kind: 'frac', numerator, denominator });
        continue;
      }

      if (command === 'sqrt') {
        nodes.push({ kind: 'sqrt', radicand: readGroup(c) });
        continue;
      }

      // Multi-letter symbols are function names; see THIN_SPACE above.
      const symbol = SYMBOLS[command];
      if (symbol !== undefined) {
        pushText(nodes, symbol.length > 1 ? `${symbol}${THIN_SPACE}` : symbol);
      } else {
        // Unknown command: show its name rather than dropping the content.
        pushText(nodes, command);
      }
      continue;
    }

    if (ch === '^' || ch === '_') {
      c.pos += 1;
      const script = readGroup(c);
      // Attach to whatever came immediately before, splitting a trailing text
      // node so only the last character takes the script.
      const previous = nodes.pop();
      let base: MathNode[] = [];

      if (previous && previous.kind === 'text' && previous.value.length > 1) {
        const head = previous.value.slice(0, -1);
        const tail = previous.value.slice(-1);
        nodes.push({ kind: 'text', value: head });
        base = [{ kind: 'text', value: tail }];
      } else if (previous) {
        base = [previous];
      }

      nodes.push(
        ch === '^'
          ? { kind: 'sup', base, exponent: script }
          : { kind: 'sub', base, index: script }
      );
      continue;
    }

    if (ch === '{') {
      c.pos += 1;
      nodes.push(...parseNodes(c, true));
      if (peek(c) === '}') c.pos += 1;
      continue;
    }

    // Thousands separators are written as 1{,}000 in LaTeX; the braces are
    // handled above, so the comma just falls through as text.
    pushText(nodes, ch);
    c.pos += 1;
  }

  return nodes;
}

export function parseMath(source: string): MathNode[] {
  return parseNodes({ source, pos: 0 }, false);
}

// ---------------------------------------------------------------------------
// Mixed text and math
// ---------------------------------------------------------------------------

export type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; nodes: MathNode[] };

/**
 * Split a string into plain-text and math runs on `$` delimiters.
 *
 * The content validator already rejects unbalanced delimiters, so an odd
 * trailing `$` here means a bug upstream; the trailing run is emitted as plain
 * text rather than swallowed, so the failure is visible instead of silent.
 */
export function parseMixed(source: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = '';
  let inMath = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (ch === '$' && source[i - 1] !== '\\') {
      if (buffer !== '') {
        segments.push(inMath ? { kind: 'math', nodes: parseMath(buffer) } : { kind: 'text', value: buffer });
      }
      buffer = '';
      inMath = !inMath;
      continue;
    }
    buffer += ch;
  }

  if (buffer !== '') {
    segments.push(inMath ? { kind: 'math', nodes: parseMath(buffer) } : { kind: 'text', value: buffer });
  }

  return segments;
}

/**
 * Commands in a string that this renderer does not support.
 * Used by the content test to keep the bank inside the subset.
 */
export function unsupportedCommands(source: string): string[] {
  const found = new Set<string>();
  // Matches punctuation commands too, not just letter-named ones. The
  // letters-only version silently passed spacing commands like `\;` and `\,`,
  // so the reference sheet shipped rendering stray semicolons while its own
  // guard test reported zero offenders.
  for (const match of source.matchAll(/\\([a-zA-Z]+|[^a-zA-Z])/g)) {
    const command = match[1]!;
    // Escaped literals render as the character itself, which is correct and
    // intended: `\%` is how you write a literal percent sign, `\$` a dollar.
    if (ESCAPED_LITERALS.has(command)) continue;
    // Spacing commands are handled below, in the parser.
    if (SPACING_COMMANDS.has(command)) continue;
    if (!SYMBOLS[command] && !STRUCTURAL.has(command)) found.add(command);
  }
  return [...found];
}

/** Plain-text rendering, for accessibility labels and search. */
export function toPlainText(nodes: MathNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
          return node.value;
        case 'sup':
          return `${toPlainText(node.base)}^${toPlainText(node.exponent)}`;
        case 'sub':
          return `${toPlainText(node.base)}_${toPlainText(node.index)}`;
        case 'frac':
          return `(${toPlainText(node.numerator)})/(${toPlainText(node.denominator)})`;
        case 'sqrt':
          return `sqrt(${toPlainText(node.radicand)})`;
      }
    })
    .join('');
}
