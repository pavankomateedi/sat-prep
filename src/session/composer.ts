/**
 * T-06 / T-08 / T-14 / T-19 — The daily session composer.
 *
 * This is the product. Everything else exists so that opening the app at 7am
 * presents thirty minutes of the right work with no decisions to make.
 *
 * The four-block skeleton is fixed (PRD §2.2) so the *shape* of a session is
 * predictable even as its content changes daily; only the minute split moves,
 * across the four phases of the two-year arc.
 *
 * Two design points worth flagging because they are easy to get wrong:
 *
 *  - **Interleaving is applied asymmetrically.** Meta-analytic evidence favours
 *    interleaving for maths problem-solving (g ≈ 0.34) but found it *harmful*
 *    for vocabulary-style learning (g ≈ −0.39) — see PRD §4.3. So Math domains
 *    are always interleaved in the mixed block, while words-in-context items
 *    stay blocked during the early phases and only interleave later.
 *
 *  - **Missed days are absorbed, never accumulated.** Blocks are budgeted in
 *    minutes, so a two-week gap cannot produce a 300-item queue. The backlog
 *    shows up as a modest, bounded shift of minutes toward review (T-19).
 */

import type { Item, ProgramPhase, Session, PlannedBlock, BlockKind, FsrsState } from '../domain/types';
import type { SkillId } from '../domain/taxonomy';
import { ALL_SKILLS, getSkill, sectionOfSkill } from '../domain/taxonomy';
import { BLOCK_ORDER, budgetFor, SESSION_MINUTES } from '../domain/phases';
import { currentMissedStreak, toLocalDate, type LocalDate } from '../lib/dates';
import type { EloState } from '../domain/types';
import { targetDifficulty } from '../scheduling/elo';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** An item the student got wrong, waiting to be re-attempted (T-08). */
export interface ErrorQueueEntry {
  itemId: string;
  /** ISO timestamp of the most recent incorrect attempt. */
  lastWrongAt: string;
  /** How many times this item has been answered incorrectly. */
  wrongCount: number;
}

export interface ComposerInput {
  studentId: string;
  today: LocalDate;
  phase: ProgramPhase;
  now: Date;
  /** The whole bank. Filtered internally. */
  items: readonly Item[];
  /** Scheduling state, keyed by item id. Absent means never seen. */
  fsrsStates: ReadonlyMap<string, FsrsState>;
  /** Ability per skill, for difficulty targeting. */
  eloStates: ReadonlyMap<SkillId, EloState>;
  /** Displayed mastery per skill, 0-1. Drives new-skill selection. */
  masteryBySkill: ReadonlyMap<SkillId, number>;
  errorQueue: readonly ErrorQueueEntry[];
  /** Local dates on which a session was completed. */
  practisedDates: ReadonlySet<LocalDate>;
  programStartDate: LocalDate;
  /** Fixed seed keeps composition reproducible for a given day. */
  seed?: number;
}

export const COMPOSER_CONFIG = {
  /** Minimum wait before a wrong item is offered again (T-08). */
  errorRetryDelayHours: 20,
  /**
   * Ceiling on minutes moved from new-skill into warm-up when days were missed.
   * Capped so a long gap never wipes out new material entirely — that would
   * turn a lapse into a stall.
   */
  maxBacklogShiftMinutes: 5,
  /** Minutes of new-skill work always protected, even at maximum backlog. */
  minNewSkillMinutes: 2,
  /** Phase from which R&W words-in-context items join the interleaved mix. */
  interleaveVocabFromPhase: 'C' as ProgramPhase,
} as const;

// ---------------------------------------------------------------------------
// Deterministic shuffling
// ---------------------------------------------------------------------------

/** Small deterministic PRNG, so a given day composes identically on a retry. */
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

function seedFromDate(date: LocalDate, salt: number): number {
  let h = salt;
  for (let i = 0; i < date.length; i += 1) h = (h * 31 + date.charCodeAt(i)) >>> 0;
  return h || 1;
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Budgeting
// ---------------------------------------------------------------------------

/**
 * Fill a minute budget with items, in order.
 *
 * Allows the last item to overshoot rather than leaving a large gap: stopping
 * a block 90 seconds short every day wastes more time over two years than one
 * slightly long item costs.
 */
export function fillBudget(
  candidates: readonly Item[],
  budgetMinutes: number,
  used: Set<string>
): string[] {
  const budgetSeconds = budgetMinutes * 60;
  const chosen: string[] = [];
  let spent = 0;

  for (const item of candidates) {
    if (used.has(item.id)) continue;
    if (spent >= budgetSeconds) break;
    chosen.push(item.id);
    used.add(item.id);
    spent += item.estimatedSeconds;
  }

  return chosen;
}

/**
 * T-19 — Redistribute minutes when days have been missed.
 *
 * The session stays exactly 30 minutes. Missing a week means a slightly
 * review-heavier session for a few days, not a punitive backlog screen.
 */
export function adjustBudgetForMissedDays(
  base: Record<BlockKind, number>,
  missedDays: number
): { minutes: Record<BlockKind, number>; shifted: number } {
  if (missedDays <= 0) return { minutes: { ...base }, shifted: 0 };

  const headroom = Math.max(0, base.new_skill - COMPOSER_CONFIG.minNewSkillMinutes);
  const shifted = Math.min(
    Math.ceil(missedDays * 1.5),
    COMPOSER_CONFIG.maxBacklogShiftMinutes,
    headroom
  );

  return {
    minutes: {
      ...base,
      new_skill: base.new_skill - shifted,
      warmup: base.warmup + shifted,
    },
    shifted,
  };
}

// ---------------------------------------------------------------------------
// Candidate selection per block
// ---------------------------------------------------------------------------

function isDue(state: FsrsState, now: Date): boolean {
  return new Date(state.due).getTime() <= now.getTime();
}

/** Warm-up: previously-seen items due for review, most overdue first. */
export function selectWarmupCandidates(input: ComposerInput, errorIds: Set<string>): Item[] {
  const { items, fsrsStates, now } = input;

  const due = items
    .filter((item) => {
      // Items awaiting an error retry belong to the error-review block, not
      // here — otherwise a wrong answer would surface twice in one session.
      if (errorIds.has(item.id)) return false;
      const state = fsrsStates.get(item.id);
      return state !== undefined && state.reps > 0 && isDue(state, now);
    })
    .sort((a, b) => {
      const dueA = new Date(fsrsStates.get(a.id)!.due).getTime();
      const dueB = new Date(fsrsStates.get(b.id)!.due).getTime();
      return dueA - dueB;
    });

  return due;
}

/**
 * New-skill: unseen items, weakest skill first.
 *
 * Returned skill-by-skill rather than interleaved, so `fillBudget` takes a
 * contiguous run of one skill before moving on — blocked practice, which is
 * what scaffolded acquisition calls for. Interleaving happens later, in the
 * mixed block, once there is something to interleave.
 *
 * The list continues past the target skill deliberately. On day one no items
 * are due and there is no error history, so this block absorbs the whole
 * session; a single skill holds only a handful of items, and thirty minutes
 * hammering one skill is both impossible and pedagogically wrong. Running on
 * into the next-weakest skills produces the broad first pass Phase A is for.
 */
export function selectNewSkillCandidates(input: ComposerInput): Item[] {
  const { items, fsrsStates, masteryBySkill, eloStates } = input;

  const unseen = items.filter((item) => !fsrsStates.has(item.id));
  if (unseen.length === 0) return [];

  const available = new Set(unseen.map((i) => i.skills[0]!));
  const ranked = ALL_SKILLS.filter((s) => available.has(s.id)).sort(
    (a, b) => (masteryBySkill.get(a.id) ?? 0) - (masteryBySkill.get(b.id) ?? 0)
  );

  return ranked.flatMap((skill) => {
    const forSkill = unseen.filter((i) => i.skills[0] === skill.id);
    const wanted = targetDifficulty(
      eloStates.get(skill.id) ?? ({ ability: 0, attempts: 0 } as EloState)
    );

    // Easiest first while the ability estimate is still noisy; once Elo has
    // converged, lead with the difficulty band it points at.
    const rank = (item: Item) => {
      const order = { easy: 0, medium: 1, hard: 2 }[item.difficulty];
      return wanted && item.difficulty === wanted ? -1 : order;
    };

    return [...forSkill].sort((a, b) => rank(a) - rank(b));
  });
}

/**
 * Mixed: interleaved practice across domains.
 *
 * See the module header — Math interleaves unconditionally, R&W vocabulary is
 * held back until Phase C, because the evidence for interleaving points in
 * opposite directions for those two material types.
 */
export function selectMixedCandidates(input: ComposerInput, errorIds: Set<string>): Item[] {
  const { items, fsrsStates, phase, now, eloStates } = input;
  const rand = makeRandom(input.seed ?? seedFromDate(input.today, 7919));

  const seen = items.filter((item) => {
    if (errorIds.has(item.id)) return false;
    const state = fsrsStates.get(item.id);
    // Practice-ready: already introduced, and not needed for review right now
    // (those go to warm-up). This block is application, not rescue.
    return state !== undefined && state.reps > 0 && !isDue(state, now);
  });

  if (seen.length === 0) return [];

  const holdVocabBlocked =
    phase === 'A' || (phase === 'B' && COMPOSER_CONFIG.interleaveVocabFromPhase === 'C');

  const vocabBlocked: Item[] = [];
  const interleavable: Item[] = [];
  for (const item of seen) {
    const skill = item.skills[0]!;
    if (holdVocabBlocked && skill === 'words_in_context') vocabBlocked.push(item);
    else interleavable.push(item);
  }

  // Prefer items near the student's ability, then interleave by domain.
  const byDomain = new Map<string, Item[]>();
  for (const item of interleavable) {
    const list = byDomain.get(item.domain) ?? [];
    list.push(item);
    byDomain.set(item.domain, list);
  }

  for (const [domain, list] of byDomain) {
    const shuffled = shuffle(list, rand);
    shuffled.sort((a, b) => {
      const wanted = targetDifficulty(
        eloStates.get(a.skills[0]!) ?? ({ ability: 0, attempts: 0 } as EloState)
      );
      if (!wanted) return 0;
      return (a.difficulty === wanted ? 0 : 1) - (b.difficulty === wanted ? 0 : 1);
    });
    byDomain.set(domain, shuffled);
  }

  // Round-robin across domains — this is what makes the block interleaved
  // rather than a shuffled pile that can still clump by topic.
  const queues = shuffle([...byDomain.values()], rand);
  const interleaved: Item[] = [];
  let index = 0;
  while (queues.some((q) => q.length > index)) {
    for (const queue of queues) {
      const item = queue[index];
      if (item) interleaved.push(item);
    }
    index += 1;
  }

  // Blocked vocabulary sits together at the end of the block.
  return [...interleaved, ...shuffle(vocabBlocked, rand)];
}

/**
 * T-08 — Error review: items the student got wrong, offered again after a
 * cooling-off period.
 *
 * Ordered by how often the item has been missed, then by how long it has been
 * waiting, so persistent misconceptions surface ahead of one-off slips.
 */
export function selectErrorReviewCandidates(input: ComposerInput): Item[] {
  const { items, errorQueue, now } = input;
  const byId = new Map(items.map((i) => [i.id, i]));
  const cutoff = now.getTime() - COMPOSER_CONFIG.errorRetryDelayHours * 3600_000;

  return errorQueue
    .filter((entry) => new Date(entry.lastWrongAt).getTime() <= cutoff)
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return a.lastWrongAt.localeCompare(b.lastWrongAt);
    })
    .map((entry) => byId.get(entry.itemId))
    .filter((item): item is Item => item !== undefined);
}

/** Items currently awaiting an error retry, whatever their cooling-off state. */
function pendingErrorIds(input: ComposerInput): Set<string> {
  return new Set(input.errorQueue.map((e) => e.itemId));
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export interface ComposedSession {
  session: Session;
  /** Why the session looks the way it does — surfaced in the UI and in tests. */
  notes: {
    missedDays: number;
    minutesShiftedToReview: number;
    dueCount: number;
    errorQueueSize: number;
    newSkillTarget: SkillId | null;
    /** Blocks that could not be filled, e.g. no items due on day one. */
    underfilledBlocks: BlockKind[];
  };
}

export function composeSession(input: ComposerInput): ComposedSession {
  const missedDays = currentMissedStreak(
    input.practisedDates,
    input.today,
    input.programStartDate
  );

  const base = budgetFor(input.phase).minutes;
  const { minutes, shifted } = adjustBudgetForMissedDays(base, missedDays);

  const errorIds = pendingErrorIds(input);
  const used = new Set<string>();

  const candidates: Record<BlockKind, Item[]> = {
    warmup: selectWarmupCandidates(input, errorIds),
    new_skill: selectNewSkillCandidates(input),
    mixed: selectMixedCandidates(input, errorIds),
    error_review: selectErrorReviewCandidates(input),
  };

  const blocks: PlannedBlock[] = [];
  const underfilled: BlockKind[] = [];

  for (const kind of BLOCK_ORDER) {
    const budget = minutes[kind];
    const itemIds = fillBudget(candidates[kind], budget, used);
    if (itemIds.length === 0 && budget > 0) underfilled.push(kind);
    blocks.push({ kind, budgetMinutes: budget, itemIds });
  }

  // Early in the programme there is nothing due and no error history, so
  // warm-up and error-review come up empty. Rather than serve a short session,
  // spend the unused minutes on new material — which is exactly what a Phase A
  // student needs anyway.
  const unusedMinutes = blocks
    .filter((b) => b.itemIds.length === 0)
    .reduce((sum, b) => sum + b.budgetMinutes, 0);

  if (unusedMinutes > 0) {
    const newSkillBlock = blocks.find((b) => b.kind === 'new_skill');
    if (newSkillBlock) {
      const extra = fillBudget(candidates.new_skill, unusedMinutes, used);
      newSkillBlock.itemIds.push(...extra);
      if (extra.length > 0) {
        const mixedBlock = blocks.find((b) => b.kind === 'mixed');
        // Anything still spare goes to mixed practice.
        if (mixedBlock && mixedBlock.itemIds.length === 0) {
          mixedBlock.itemIds.push(...fillBudget(candidates.mixed, unusedMinutes, used));
        }
      }
    }
  }

  const session: Session = {
    id: `${input.studentId}:${input.today}`,
    studentId: input.studentId,
    date: input.today,
    phase: input.phase,
    blocks,
    startedAt: null,
    completedAt: null,
    actualSeconds: 0,
    missedDaysBefore: missedDays,
    synced: false,
  };

  return {
    session,
    notes: {
      missedDays,
      minutesShiftedToReview: shifted,
      dueCount: candidates.warmup.length,
      errorQueueSize: candidates.error_review.length,
      newSkillTarget: candidates.new_skill[0]?.skills[0] ?? null,
      underfilledBlocks: underfilled,
    },
  };
}

/** Every item id in a composed session, in presentation order. */
export function sessionItemIds(session: Session): string[] {
  return session.blocks.flatMap((b) => b.itemIds);
}

/** Planned length. Should land near SESSION_MINUTES; used by tests and the UI. */
export function plannedSeconds(session: Session, items: ReadonlyMap<string, Item>): number {
  return sessionItemIds(session).reduce(
    (sum, id) => sum + (items.get(id)?.estimatedSeconds ?? 0),
    0
  );
}

export { SESSION_MINUTES, sectionOfSkill, getSkill };
