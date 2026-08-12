/**
 * T-11 / T-18 — Assembling diagnostic and full-length practice tests.
 *
 * Mirrors the real delivery structure from PRD §1.1-§1.2: two sections, two
 * modules each, with module 2 routed by module-1 performance. PRD §1.2 is
 * emphatic that the Digital SAT is **module-adaptive, not item-adaptive** —
 * there is no per-question difficulty adjustment — and that practice should
 * mirror "module, then branch" so the student builds accurate intuition for how
 * the real thing behaves.
 *
 * Full-length tests are the one place the 30-minute daily cap is deliberately
 * suspended (PRD §2.4). They are scheduled as their own event.
 */

import type { Difficulty, Item } from '../domain/types';
import type { AssessmentKind } from '../domain/types';
import type { SectionId } from '../domain/taxonomy';
import { SECTIONS, getSection } from '../domain/taxonomy';
import { ROUTING_THRESHOLD, routeSecondModule, type RoutingPath } from './scoring';

export type ModuleIndex = 1 | 2;

export interface TestModule {
  section: SectionId;
  index: ModuleIndex;
  /** Only set for module 2. */
  path?: RoutingPath;
  itemIds: string[];
  timeLimitSeconds: number;
}

export interface BuiltTest {
  kind: AssessmentKind;
  /** Module 1 for each section. Module 2 is built after routing. */
  modules: TestModule[];
  /** Total seated time in minutes, excluding breaks. */
  totalMinutes: number;
  /**
   * How many selected items the student had already seen in daily practice.
   * Surfaced with the result: a score built partly from familiar items is
   * inflated, and the student deserves to know that rather than be told a
   * cleaner-looking number.
   */
  previouslySeenCount: number;
  /** Set when the bank could not supply a full-length form. */
  shortfall: { section: SectionId; index: ModuleIndex; wanted: number; got: number }[];
}

/**
 * Difficulty mix per module.
 *
 * Module 1 is the fixed, moderate routing module every student sees. Module 2
 * branches: the harder form loads up on hard items, the easier form on easy
 * ones. The easier form's lack of hard items is precisely why it carries a
 * score ceiling (see EASIER_MODULE_CEILING in scoring.ts).
 */
const DIFFICULTY_MIX: Record<string, Record<Difficulty, number>> = {
  module1: { easy: 0.3, medium: 0.5, hard: 0.2 },
  module2_harder: { easy: 0.1, medium: 0.35, hard: 0.55 },
  module2_easier: { easy: 0.55, medium: 0.35, hard: 0.1 },
};

function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface ModuleSelectionInput {
  items: readonly Item[];
  section: SectionId;
  count: number;
  mix: Record<Difficulty, number>;
  /** Items already used elsewhere in this test. */
  exclude: Set<string>;
  /** Items the student has already answered in daily practice. */
  seenItemIds: ReadonlySet<string>;
  rand: () => number;
}

/**
 * Choose items for one module, honouring the section's domain weights and the
 * module's difficulty mix, preferring items the student has not already met.
 */
export function selectModuleItems(input: ModuleSelectionInput): {
  itemIds: string[];
  seenUsed: number;
} {
  const { items, section, count, mix, exclude, seenItemIds, rand } = input;
  const sectionSpec = getSection(section);

  const pool = items.filter((i) => i.section === section && !exclude.has(i.id));

  // How many items each domain should contribute, from the published weights.
  const perDomain = sectionSpec.domains.map((domain) => ({
    domain: domain.id,
    wanted: Math.max(1, Math.round(domain.weight * count)),
  }));

  const chosen: string[] = [];
  let seenUsed = 0;

  const take = (candidates: Item[], n: number) => {
    // Unseen first — a test built from items the student has already drilled
    // measures recall of this bank, not readiness for the real exam.
    const unseen = shuffle(
      candidates.filter((i) => !seenItemIds.has(i.id)),
      rand
    );
    const seen = shuffle(
      candidates.filter((i) => seenItemIds.has(i.id)),
      rand
    );

    for (const item of [...unseen, ...seen]) {
      if (chosen.length >= count) return;
      if (n <= 0) return;
      if (exclude.has(item.id)) continue;
      chosen.push(item.id);
      exclude.add(item.id);
      if (seenItemIds.has(item.id)) seenUsed += 1;
      n -= 1;
    }
  };

  for (const { domain, wanted } of perDomain) {
    const domainPool = pool.filter((i) => i.domain === domain);

    for (const difficulty of ['hard', 'medium', 'easy'] as Difficulty[]) {
      const share = Math.round(wanted * (mix[difficulty] ?? 0));
      if (share <= 0) continue;
      take(
        domainPool.filter((i) => i.difficulty === difficulty),
        share
      );
    }

    // Top up from the domain regardless of difficulty if rounding left a gap.
    take(domainPool, wanted);
  }

  // Final top-up across the whole section, so a thin domain doesn't shorten
  // the module.
  take(pool, count - chosen.length);

  return { itemIds: chosen.slice(0, count), seenUsed };
}

export interface BuildTestOptions {
  kind: AssessmentKind;
  items: readonly Item[];
  seenItemIds?: ReadonlySet<string>;
  seed?: number;
  /**
   * Diagnostics default to half-length — one module per section. PRD §2.4
   * allows "full-length or half-length" at program start, and a 134-minute
   * sit-down on day one of a two-year habit is a poor first impression.
   */
  halfLength?: boolean;
}

/** Build the first module of each section. Module 2 follows after routing. */
export function buildTest(options: BuildTestOptions): BuiltTest {
  const rand = makeRandom(options.seed ?? 20260731);
  const seen = options.seenItemIds ?? new Set<string>();
  const exclude = new Set<string>();
  const halfLength = options.halfLength ?? options.kind === 'diagnostic';

  const modules: TestModule[] = [];
  const shortfall: BuiltTest['shortfall'] = [];
  let previouslySeenCount = 0;

  for (const section of SECTIONS) {
    const { itemIds, seenUsed } = selectModuleItems({
      items: options.items,
      section: section.id,
      count: section.questionsPerModule,
      mix: DIFFICULTY_MIX.module1!,
      exclude,
      seenItemIds: seen,
      rand,
    });

    previouslySeenCount += seenUsed;
    if (itemIds.length < section.questionsPerModule) {
      shortfall.push({
        section: section.id,
        index: 1,
        wanted: section.questionsPerModule,
        got: itemIds.length,
      });
    }

    modules.push({
      section: section.id,
      index: 1,
      itemIds,
      timeLimitSeconds: section.minutesPerModule * 60,
    });
  }

  const totalMinutes = modules.reduce((sum, m) => sum + m.timeLimitSeconds / 60, 0);

  return {
    kind: options.kind,
    modules,
    totalMinutes: halfLength ? totalMinutes : totalMinutes * 2,
    previouslySeenCount,
    shortfall,
  };
}

/**
 * Build the second module for a section, given how module 1 went.
 *
 * This is the routing step, and the only adaptive moment in the whole test.
 * There is no re-routing inside a module and no per-question adjustment.
 */
export function buildSecondModule(options: {
  items: readonly Item[];
  section: SectionId;
  module1Correct: number;
  module1Total: number;
  exclude: Set<string>;
  seenItemIds?: ReadonlySet<string>;
  seed?: number;
}): TestModule & { seenUsed: number } {
  const sectionSpec = getSection(options.section);
  const path = routeSecondModule(options.module1Correct, options.module1Total);
  const rand = makeRandom(options.seed ?? 98765);

  const { itemIds, seenUsed } = selectModuleItems({
    items: options.items,
    section: options.section,
    count: sectionSpec.questionsPerModule,
    mix: path === 'harder' ? DIFFICULTY_MIX.module2_harder! : DIFFICULTY_MIX.module2_easier!,
    exclude: options.exclude,
    seenItemIds: options.seenItemIds ?? new Set(),
    rand,
  });

  return {
    section: options.section,
    index: 2,
    path,
    itemIds,
    timeLimitSeconds: sectionSpec.minutesPerModule * 60,
    seenUsed,
  };
}

/**
 * When the next full-length checkpoint is due.
 *
 * PRD §2.4: checkpoints precede each real administration and otherwise run no
 * more than about once per academic term. Two reasons for the cap — the
 * official practice material is a finite pool, and frequent full-length tests
 * pull against the "30 minutes a day, not a cram tool" premise the whole
 * product rests on.
 */
export const ASSESSMENT_CADENCE = {
  minimumDaysBetween: 90,
  /** Schedule a checkpoint this far before a real PSAT/SAT administration. */
  daysBeforeRealTest: 21,
} as const;

export function nextAssessmentDue(
  lastTakenOn: string | null,
  upcomingRealTestDates: readonly string[],
  today: string
): { due: boolean; reason: string; suggestedDate: string | null } {
  const todayMs = new Date(today).getTime();

  for (const testDate of [...upcomingRealTestDates].sort()) {
    const testMs = new Date(testDate).getTime();
    if (testMs < todayMs) continue;
    const daysUntil = (testMs - todayMs) / 86_400_000;
    if (daysUntil <= ASSESSMENT_CADENCE.daysBeforeRealTest) {
      const sinceLast = lastTakenOn
        ? (todayMs - new Date(lastTakenOn).getTime()) / 86_400_000
        : Number.POSITIVE_INFINITY;
      if (sinceLast >= ASSESSMENT_CADENCE.minimumDaysBetween) {
        return {
          due: true,
          reason: `A real test is ${Math.round(daysUntil)} days away.`,
          suggestedDate: today,
        };
      }
    }
  }

  if (!lastTakenOn) {
    return { due: true, reason: 'No baseline diagnostic has been taken yet.', suggestedDate: today };
  }

  const sinceLast = (todayMs - new Date(lastTakenOn).getTime()) / 86_400_000;
  if (sinceLast >= ASSESSMENT_CADENCE.minimumDaysBetween) {
    return {
      due: true,
      reason: `${Math.round(sinceLast)} days since the last checkpoint.`,
      suggestedDate: today,
    };
  }

  return {
    due: false,
    reason: `Last checkpoint was ${Math.round(sinceLast)} days ago; next in about ${Math.round(
      ASSESSMENT_CADENCE.minimumDaysBetween - sinceLast
    )} days.`,
    suggestedDate: null,
  };
}

export { ROUTING_THRESHOLD };
