/**
 * Timed drills — a focused set of questions on one domain or skill, under real
 * time pressure.
 *
 * The gap this fills: the daily session is untimed by design (it is about
 * learning, not performing), and full-length tests are timed but rare and
 * expensive. Paid tools all offer the middle option — twenty Algebra questions
 * against the clock — and there was no way to practise pacing on a weak area
 * without burning a whole practice test.
 *
 * Drills deliberately do not feed the FSRS scheduler as new introductions. They
 * draw on material already seen, so a drill is extra practice rather than a
 * back door that floods the review queue.
 */

import type { Difficulty, Item } from '../domain/types';
import type { DomainId, SkillId } from '../domain/taxonomy';
import { getDomain, getSkill } from '../domain/taxonomy';
import { benchmarkSeconds } from '../analytics/pacing';

export type DrillScope =
  | { kind: 'domain'; domain: DomainId }
  | { kind: 'skill'; skill: SkillId };

export interface DrillRequest {
  scope: DrillScope;
  count: number;
  /** Restrict to one difficulty band, or leave open for a mix. */
  difficulty?: Difficulty;
  items: readonly Item[];
  /** Items the student has already met. Preferred, for the reason above. */
  seenItemIds?: ReadonlySet<string>;
  /** Practise against the clock, or work through untimed. */
  timed: boolean;
  seed?: number;
}

export interface Drill {
  title: string;
  itemIds: string[];
  /** Seconds allowed, or null when untimed. */
  timeLimitSeconds: number | null;
  timed: boolean;
  /** Set when the bank could not supply the full request. */
  shortfall: number;
}

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

function matchesScope(item: Item, scope: DrillScope): boolean {
  return scope.kind === 'domain'
    ? item.domain === scope.domain
    : item.skills[0] === scope.skill;
}

export function scopeTitle(scope: DrillScope): string {
  return scope.kind === 'domain' ? getDomain(scope.domain).name : getSkill(scope.skill).name;
}

/**
 * Assemble a drill.
 *
 * The time limit uses the section's real seconds-per-question rather than the
 * sum of authored estimates — the point of a timed drill is to rehearse the
 * pressure of the actual test, not to allow however long these particular
 * questions were expected to take.
 */
export function buildDrill(request: DrillRequest): Drill {
  const rand = makeRandom(request.seed ?? 4242);
  const seen = request.seenItemIds ?? new Set<string>();

  let pool = request.items.filter((item) => matchesScope(item, request.scope));
  if (request.difficulty) {
    pool = pool.filter((item) => item.difficulty === request.difficulty);
  }

  // Prefer already-introduced material, then fall back so a drill on a fresh
  // skill still works rather than returning an empty set.
  const familiar = shuffle(pool.filter((i) => seen.has(i.id)), rand);
  const rest = shuffle(pool.filter((i) => !seen.has(i.id)), rand);
  const chosen = [...familiar, ...rest].slice(0, request.count);

  const section = chosen[0]?.section ?? 'math';
  const perQuestion = benchmarkSeconds(section);

  return {
    title: `${scopeTitle(request.scope)}${request.difficulty ? ` · ${request.difficulty}` : ''}`,
    itemIds: chosen.map((i) => i.id),
    timeLimitSeconds: request.timed ? Math.round(perQuestion * chosen.length) : null,
    timed: request.timed,
    shortfall: Math.max(0, request.count - chosen.length),
  };
}

/** Drill sizes offered in the UI. */
export const DRILL_SIZES = [5, 10, 20] as const;

/**
 * Suggest what to drill next, from the skills the analytics say are weakest.
 * Falls back to nothing rather than inventing a recommendation from thin data.
 */
export function suggestedDrills(
  weakSkills: readonly { key: string; label: string }[],
  limit = 3
): DrillScope[] {
  return weakSkills.slice(0, limit).map((row) => ({
    kind: 'skill' as const,
    skill: row.key as SkillId,
  }));
}
