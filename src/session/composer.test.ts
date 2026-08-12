import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../content';
import {
  adjustBudgetForMissedDays,
  composeSession,
  fillBudget,
  plannedSeconds,
  selectErrorReviewCandidates,
  selectMixedCandidates,
  sessionItemIds,
  type ComposerInput,
} from './composer';
import { PHASE_BUDGETS, SESSION_MINUTES, decidePhase } from '../domain/phases';
import type { FsrsState, Item, ProgramPhase } from '../domain/types';
import { emptyState } from '../scheduling/fsrs';
import { addDays } from '../lib/dates';

const TODAY = '2026-09-15';
const NOW = new Date('2026-09-15T07:00:00Z');
const ITEM_MAP = new Map(ITEMS.map((i) => [i.id, i]));

function baseInput(overrides: Partial<ComposerInput> = {}): ComposerInput {
  return {
    studentId: 's1',
    today: TODAY,
    phase: 'A',
    now: NOW,
    items: ITEMS,
    fsrsStates: new Map(),
    eloStates: new Map(),
    masteryBySkill: new Map(),
    errorQueue: [],
    practisedDates: new Set([addDays(TODAY, -1)]),
    programStartDate: '2026-09-01',
    seed: 12345,
    ...overrides,
  };
}

/** A review state that is already due, so it lands in the warm-up block. */
function dueState(itemId: string, dueAt: string): FsrsState {
  return {
    ...emptyState('s1', itemId),
    reps: 3,
    state: 2,
    stability: 5,
    difficulty: 5,
    due: dueAt,
    lastReview: '2026-09-10T07:00:00Z',
  };
}

/** A review state scheduled in the future, so it is practice-ready, not due. */
function futureState(itemId: string): FsrsState {
  return { ...dueState(itemId, '2026-10-15T07:00:00Z') };
}

describe('minute budgeting', () => {
  it('keeps every phase at exactly 30 minutes', () => {
    for (const phase of ['A', 'B', 'C', 'D'] as ProgramPhase[]) {
      const total = Object.values(PHASE_BUDGETS[phase].minutes).reduce((a, b) => a + b, 0);
      expect(total, `phase ${phase}`).toBe(SESSION_MINUTES);
    }
  });

  it('shifts weight from new material to review across the arc', () => {
    expect(PHASE_BUDGETS.A.minutes.new_skill).toBeGreaterThan(PHASE_BUDGETS.D.minutes.new_skill);
    expect(PHASE_BUDGETS.D.minutes.mixed).toBeGreaterThan(PHASE_BUDGETS.A.minutes.mixed);
    expect(PHASE_BUDGETS.D.minutes.error_review).toBeGreaterThan(
      PHASE_BUDGETS.A.minutes.error_review
    );
  });

  it('raises the retention target as the test approaches', () => {
    expect(PHASE_BUDGETS.D.desiredRetention).toBeGreaterThan(PHASE_BUDGETS.A.desiredRetention);
  });

  it('fills a budget without exceeding it by more than one item', () => {
    const used = new Set<string>();
    const chosen = fillBudget(ITEMS.slice(0, 40), 5, used);
    const seconds = chosen.reduce((sum, id) => sum + ITEM_MAP.get(id)!.estimatedSeconds, 0);
    const lastItem = ITEM_MAP.get(chosen[chosen.length - 1]!)!;
    expect(seconds - lastItem.estimatedSeconds).toBeLessThan(5 * 60);
    expect(chosen.length).toBe(new Set(chosen).size);
  });

  it('never serves the same item twice across blocks', () => {
    const used = new Set<string>();
    fillBudget(ITEMS, 5, used);
    const second = fillBudget(ITEMS, 5, used);
    expect(second.every((id) => !second.slice(0, second.indexOf(id)).includes(id))).toBe(true);
    expect(used.size).toBe(new Set(used).size);
  });
});

describe('missed-day replanning (T-19)', () => {
  it('leaves the budget alone when nothing was missed', () => {
    const result = adjustBudgetForMissedDays(PHASE_BUDGETS.A.minutes, 0);
    expect(result.shifted).toBe(0);
    expect(result.minutes).toEqual(PHASE_BUDGETS.A.minutes);
  });

  it('shifts minutes toward review after missed days, keeping the total at 30', () => {
    const result = adjustBudgetForMissedDays(PHASE_BUDGETS.A.minutes, 2);
    expect(result.shifted).toBeGreaterThan(0);
    expect(result.minutes.warmup).toBeGreaterThan(PHASE_BUDGETS.A.minutes.warmup);
    expect(result.minutes.new_skill).toBeLessThan(PHASE_BUDGETS.A.minutes.new_skill);
    const total = Object.values(result.minutes).reduce((a, b) => a + b, 0);
    expect(total).toBe(SESSION_MINUTES);
  });

  it('caps the shift so a long gap never eliminates new material', () => {
    const result = adjustBudgetForMissedDays(PHASE_BUDGETS.A.minutes, 90);
    expect(result.shifted).toBeLessThanOrEqual(5);
    expect(result.minutes.new_skill).toBeGreaterThanOrEqual(2);
  });

  it('protects new-skill minutes in phases that already have few', () => {
    // Phase D allocates only 3 minutes to new skills; the floor is 2.
    const result = adjustBudgetForMissedDays(PHASE_BUDGETS.D.minutes, 30);
    expect(result.minutes.new_skill).toBeGreaterThanOrEqual(2);
    const total = Object.values(result.minutes).reduce((a, b) => a + b, 0);
    expect(total).toBe(SESSION_MINUTES);
  });

  it('counts the current missed streak into the composed session', () => {
    const { session, notes } = composeSession(
      baseInput({ practisedDates: new Set([addDays(TODAY, -5)]) })
    );
    expect(notes.missedDays).toBe(4);
    expect(session.missedDaysBefore).toBe(4);
  });
});

describe('session composition (T-06)', () => {
  it('always produces the four blocks in a fixed order', () => {
    const { session } = composeSession(baseInput());
    expect(session.blocks.map((b) => b.kind)).toEqual([
      'warmup',
      'new_skill',
      'mixed',
      'error_review',
    ]);
  });

  it('produces a roughly 30-minute session on day one, before any history', () => {
    const { session } = composeSession(baseInput());
    const seconds = plannedSeconds(session, ITEM_MAP);
    // No items are due and there is no error history on day one, so those
    // minutes get redirected rather than lost.
    expect(seconds).toBeGreaterThan(20 * 60);
    expect(seconds).toBeLessThan(42 * 60);
  });

  it('never repeats an item within a session', () => {
    const fsrsStates = new Map(
      ITEMS.slice(0, 60).map((i) => [i.id, dueState(i.id, '2026-09-14T07:00:00Z')])
    );
    const { session } = composeSession(baseInput({ fsrsStates }));
    const ids = sessionItemIds(session);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills warm-up from due items, most overdue first', () => {
    const fsrsStates = new Map<string, FsrsState>([
      [ITEMS[0]!.id, dueState(ITEMS[0]!.id, '2026-09-14T07:00:00Z')],
      [ITEMS[1]!.id, dueState(ITEMS[1]!.id, '2026-09-01T07:00:00Z')],
      [ITEMS[2]!.id, dueState(ITEMS[2]!.id, '2026-09-10T07:00:00Z')],
    ]);
    const { session } = composeSession(baseInput({ fsrsStates }));
    const warmup = session.blocks.find((b) => b.kind === 'warmup')!;
    // The most overdue item (Sept 1) must come first.
    expect(warmup.itemIds[0]).toBe(ITEMS[1]!.id);
  });

  it('leads the new-skill block with the least-mastered skill, blocked together', () => {
    const mastery = new Map(ITEMS.map((i) => [i.skills[0]!, 0.9]));
    mastery.set('circles', 0.05);

    const { session, notes } = composeSession(baseInput({ masteryBySkill: mastery }));
    expect(notes.newSkillTarget).toBe('circles');

    const newSkill = session.blocks.find((b) => b.kind === 'new_skill')!;
    const skills = newSkill.itemIds.map((id) => ITEM_MAP.get(id)!.skills[0]);

    // The weakest skill comes first and its items are contiguous — blocked
    // practice. The block runs on into other skills once that one is exhausted,
    // because six items cannot fill a thirty-minute day-one session.
    expect(skills[0]).toBe('circles');
    const lastCircle = skills.lastIndexOf('circles');
    expect(skills.slice(0, lastCircle + 1).every((s) => s === 'circles')).toBe(true);
  });

  it('excludes items the student has already seen from the new-skill block', () => {
    const fsrsStates = new Map(ITEMS.map((i) => [i.id, futureState(i.id)]));
    const { session } = composeSession(baseInput({ fsrsStates }));
    const newSkill = session.blocks.find((b) => b.kind === 'new_skill')!;
    expect(newSkill.itemIds).toEqual([]);
  });

  it('is deterministic for a given day and seed', () => {
    const a = composeSession(baseInput());
    const b = composeSession(baseInput());
    expect(sessionItemIds(a.session)).toEqual(sessionItemIds(b.session));
  });
});

describe('error review (T-08)', () => {
  const wrongItem = ITEMS[5]!;

  it('withholds an item until the cooling-off period has passed', () => {
    const tooRecent = selectErrorReviewCandidates(
      baseInput({
        errorQueue: [
          { itemId: wrongItem.id, lastWrongAt: '2026-09-15T06:00:00Z', wrongCount: 1 },
        ],
      })
    );
    expect(tooRecent).toEqual([]);

    const ready = selectErrorReviewCandidates(
      baseInput({
        errorQueue: [
          { itemId: wrongItem.id, lastWrongAt: '2026-09-13T06:00:00Z', wrongCount: 1 },
        ],
      })
    );
    expect(ready.map((i) => i.id)).toEqual([wrongItem.id]);
  });

  it('prioritises repeatedly-missed items over one-off slips', () => {
    const candidates = selectErrorReviewCandidates(
      baseInput({
        errorQueue: [
          { itemId: ITEMS[5]!.id, lastWrongAt: '2026-09-12T06:00:00Z', wrongCount: 1 },
          { itemId: ITEMS[6]!.id, lastWrongAt: '2026-09-13T06:00:00Z', wrongCount: 4 },
        ],
      })
    );
    expect(candidates[0]!.id).toBe(ITEMS[6]!.id);
  });

  it('keeps queued error items out of warm-up and mixed, so they appear once', () => {
    const fsrsStates = new Map(ITEMS.map((i) => [i.id, dueState(i.id, '2026-09-14T07:00:00Z')]));
    const errorQueue = [
      { itemId: wrongItem.id, lastWrongAt: '2026-09-13T06:00:00Z', wrongCount: 2 },
    ];

    const { session } = composeSession(baseInput({ fsrsStates, errorQueue }));
    const warmup = session.blocks.find((b) => b.kind === 'warmup')!;
    const mixed = session.blocks.find((b) => b.kind === 'mixed')!;
    const errors = session.blocks.find((b) => b.kind === 'error_review')!;

    expect(warmup.itemIds).not.toContain(wrongItem.id);
    expect(mixed.itemIds).not.toContain(wrongItem.id);
    expect(errors.itemIds).toContain(wrongItem.id);
  });
});

describe('interleaving asymmetry (PRD §4.3)', () => {
  /** Practice-ready states for everything, so the mixed block has a full pool. */
  const readyStates = new Map(ITEMS.map((i) => [i.id, futureState(i.id)]));

  it('interleaves Math domains rather than clumping them', () => {
    const candidates = selectMixedCandidates(
      baseInput({ fsrsStates: readyStates, phase: 'C' }),
      new Set()
    );
    const mathDomains = candidates
      .filter((i) => i.section === 'math')
      .slice(0, 8)
      .map((i) => i.domain);
    // A properly interleaved run should not be all one domain.
    expect(new Set(mathDomains).size).toBeGreaterThan(1);
  });

  it('keeps words-in-context blocked in Phase A but interleaves it by Phase C', () => {
    const phaseA = selectMixedCandidates(
      baseInput({ fsrsStates: readyStates, phase: 'A' }),
      new Set()
    );
    const vocabPositionsA = phaseA
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.skills[0] === 'words_in_context')
      .map(({ index }) => index);

    // Blocked: the vocabulary items sit in one contiguous run at the end.
    expect(vocabPositionsA.length).toBeGreaterThan(0);
    const contiguous = vocabPositionsA.every(
      (pos, i) => i === 0 || pos === vocabPositionsA[i - 1]! + 1
    );
    expect(contiguous).toBe(true);
    expect(vocabPositionsA[vocabPositionsA.length - 1]).toBe(phaseA.length - 1);

    // By Phase C they are mixed in with everything else.
    const phaseC = selectMixedCandidates(
      baseInput({ fsrsStates: readyStates, phase: 'C' }),
      new Set()
    );
    const vocabPositionsC = phaseC
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.skills[0] === 'words_in_context')
      .map(({ index }) => index);
    expect(vocabPositionsC[0]).toBeLessThan(phaseC.length - vocabPositionsC.length);
  });
});

describe('phase transitions (T-14)', () => {
  // A 21-month arc: 9th grade starting Sept 2026, target test June 2028.
  const student = { programStartDate: '2026-09-01', targetTestDate: '2028-06-01' };

  it('starts in Phase A', () => {
    expect(decidePhase(student, 0, '2026-09-15').phase).toBe('A');
  });

  it('advances through B and C on the time schedule', () => {
    expect(decidePhase(student, 0.5, '2027-05-01').phase).toBe('B');
    expect(decidePhase(student, 0.5, '2027-10-01').phase).toBe('C');
  });

  it('enters Phase D within six months of the target test', () => {
    expect(decidePhase(student, 0.5, '2028-01-15').phase).toBe('D');
  });

  it('lets strong mastery pull the student forward by one phase', () => {
    const decision = decidePhase(student, 0.9, '2026-09-15');
    expect(decision.timeBasedPhase).toBe('A');
    expect(decision.phase).toBe('B');
  });

  it('holds a struggling student back by one phase', () => {
    const decision = decidePhase(student, 0.1, '2027-05-01');
    expect(decision.timeBasedPhase).toBe('B');
    expect(decision.phase).toBe('A');
  });

  it('never lets weak mastery delay Phase D — the test date does not move', () => {
    const decision = decidePhase(student, 0.0, '2028-01-15');
    expect(decision.phase).toBe('D');
  });

  it('never skips more than one phase in either direction', () => {
    expect(decidePhase(student, 1.0, '2026-09-15').phase).toBe('B');
    expect(decidePhase(student, 0.0, '2027-10-01').phase).toBe('B');
  });
});
