/**
 * Tests for the grade-and-persist core (`gradeAndPersist`, exercised via its
 * two exports `recordAnswer` and `recordTestAttempt`).
 *
 * `service.ts` touches `../data/repositories`, which imports `expo-sqlite` /
 * `expo-crypto` — native modules unavailable under Vitest/Node, which is why
 * this file has never had direct coverage before. Mocking the repository
 * layer (an in-memory fake, not the real SQLite path) lets the actual FSRS/
 * Elo/BKT/attempt-building logic run for real, which a manual code read
 * cannot substitute for.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../../content';
import type { Attempt, BktState, EloState, FsrsState, Session, Student } from '../domain/types';

// service.ts also imports contentLoader, which imports db.ts → expo-sqlite
// (a native module Vitest/Node can't parse). Not exercised by
// recordAnswer/recordTestAttempt, so a no-op stub is enough.
vi.mock('../data/contentLoader', () => ({
  loadContentIfNeeded: vi.fn(async () => {}),
  isContentLoaded: vi.fn(async () => true),
}));

vi.mock('../data/repositories', () => {
  const fsrsStates = new Map<string, FsrsState>();
  const eloStates = new Map<string, EloState>();
  const bktStates = new Map<string, BktState>();
  const attempts: Attempt[] = [];
  let counter = 0;

  return {
    newId: () => `fake-id-${counter++}`,
    getFsrsParams: vi.fn(async () => null),
    getFsrsStates: vi.fn(async () => new Map(fsrsStates)),
    saveFsrsState: vi.fn(async (s: FsrsState) => {
      fsrsStates.set(s.itemId, s);
    }),
    getEloStates: vi.fn(async () => new Map(eloStates)),
    saveEloState: vi.fn(async (s: EloState) => {
      eloStates.set(s.skillId, s);
    }),
    getBktStates: vi.fn(async () => new Map(bktStates)),
    saveBktState: vi.fn(async (s: BktState) => {
      bktStates.set(s.skillId, s);
    }),
    saveAttempt: vi.fn(async (a: Attempt) => {
      attempts.push(a);
    }),
    __fakeStore: { fsrsStates, eloStates, bktStates, attempts },
  };
});

import { recordAnswer, recordTestAttempt } from './service';
// eslint-disable-next-line import/no-named-as-default-member -- test-only reach into the mock's internals
import * as repo from '../data/repositories';

const fakeStore = (repo as unknown as {
  __fakeStore: {
    fsrsStates: Map<string, FsrsState>;
    eloStates: Map<string, EloState>;
    bktStates: Map<string, BktState>;
    attempts: Attempt[];
  };
}).__fakeStore;

const STUDENT: Student = {
  id: 'student-1',
  displayName: 'Test',
  gradeLevel: 9,
  programStartDate: '2026-08-01',
  targetTestDate: '2028-05-06',
};

const SESSION: Session = {
  id: 'session-1',
  studentId: STUDENT.id,
  date: '2026-09-02',
  phase: 'A',
  blocks: [],
  startedAt: null,
  completedAt: null,
  actualSeconds: 0,
  missedDaysBefore: 0,
  synced: false,
};

const ITEM = ITEMS.find((i) => i.itemType === 'mcq')!;
const CORRECT_RESPONSE = ITEM.choices!.find((c) => c.id === ITEM.answer)!.id;
const WRONG_RESPONSE = ITEM.choices!.find((c) => c.id !== ITEM.answer)!.id;

beforeEach(() => {
  fakeStore.fsrsStates.clear();
  fakeStore.eloStates.clear();
  fakeStore.bktStates.clear();
  fakeStore.attempts.length = 0;
});

describe('recordAnswer (daily session)', () => {
  it('saves an attempt with sessionId/blockKind attached, and advances FSRS/Elo/BKT', async () => {
    const outcome = await recordAnswer({
      student: STUDENT,
      session: SESSION,
      item: ITEM,
      response: CORRECT_RESPONSE,
      responseTimeMs: 20_000,
      blockKind: 'mixed',
      phase: 'A',
      now: new Date('2026-09-02T12:00:00Z'),
    });

    expect(outcome.correct).toBe(true);
    expect(fakeStore.attempts).toHaveLength(1);
    const saved = fakeStore.attempts[0]!;
    expect(saved.sessionId).toBe(SESSION.id);
    expect(saved.blockKind).toBe('mixed');
    expect(saved.itemId).toBe(ITEM.id);
    expect(saved.correct).toBe(true);

    expect(fakeStore.fsrsStates.has(ITEM.id)).toBe(true);
    expect(fakeStore.eloStates.has(ITEM.skills[0]!)).toBe(true);
    expect(fakeStore.bktStates.has(ITEM.skills[0]!)).toBe(true);
  });
});

describe('recordTestAttempt (full-length/diagnostic test)', () => {
  it('saves an attempt with sessionId/blockKind null, per the Attempt schema', async () => {
    const outcome = await recordTestAttempt({
      student: STUDENT,
      item: ITEM,
      response: WRONG_RESPONSE,
      responseTimeMs: 45_000,
      phase: 'A',
      now: new Date('2026-09-02T12:00:00Z'),
    });

    expect(outcome.correct).toBe(false);
    expect(fakeStore.attempts).toHaveLength(1);
    const saved = fakeStore.attempts[0]!;
    expect(saved.sessionId).toBeNull();
    expect(saved.blockKind).toBeNull();
    expect(saved.itemId).toBe(ITEM.id);
    expect(saved.correct).toBe(false);
    expect(saved.responseTimeMs).toBe(45_000);
    expect(outcome.attemptId).toBe(saved.id);
  });

  it('advances the same FSRS/Elo/BKT state a daily-session answer would', async () => {
    await recordTestAttempt({
      student: STUDENT,
      item: ITEM,
      response: CORRECT_RESPONSE,
      responseTimeMs: 30_000,
      phase: 'A',
      now: new Date('2026-09-02T12:00:00Z'),
    });

    expect(fakeStore.fsrsStates.has(ITEM.id)).toBe(true);
    expect(fakeStore.eloStates.has(ITEM.skills[0]!)).toBe(true);
    expect(fakeStore.bktStates.has(ITEM.skills[0]!)).toBe(true);
  });

  it('a second attempt on the same item reads back the first attempt\'s updated state', async () => {
    const first = await recordTestAttempt({
      student: STUDENT,
      item: ITEM,
      response: CORRECT_RESPONSE,
      responseTimeMs: 30_000,
      phase: 'A',
      now: new Date('2026-09-02T12:00:00Z'),
    });

    const secondFsrs = fakeStore.fsrsStates.get(ITEM.id)!;

    await recordTestAttempt({
      student: STUDENT,
      item: ITEM,
      response: CORRECT_RESPONSE,
      responseTimeMs: 15_000,
      phase: 'A',
      now: new Date('2026-09-10T12:00:00Z'),
    });

    expect(fakeStore.attempts).toHaveLength(2);
    expect(fakeStore.attempts[1]!.stabilityBefore).toBe(secondFsrs.stability);
    expect(first.attemptId).not.toBe(fakeStore.attempts[1]!.id);
  });
});
