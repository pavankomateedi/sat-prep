/**
 * Session service — the orchestration the UI talks to.
 *
 * Answering one question touches five subsystems (FSRS, Elo, BKT, the attempt
 * log, the error queue). Doing that inline in a component would scatter the
 * learning model across the view layer, so it all lives here and the UI just
 * calls `recordAnswer`.
 */

import type {
  Attempt,
  BlockKind,
  Item,
  ProgramPhase,
  Session,
  Student,
} from '../domain/types';
import type { DomainId, SkillId } from '../domain/taxonomy';
import { ALL_DOMAINS, ALL_SKILLS, TOTAL_SKILL_COUNT, getSkill } from '../domain/taxonomy';
import { budgetFor, decidePhase } from '../domain/phases';
import { startOfWeek, toLocalDate, type LocalDate } from '../lib/dates';
import {
  createScheduler,
  deriveGrade,
  emptyState,
  retrievability,
  review,
} from '../scheduling/fsrs';
import { initialEloState, updateElo } from '../scheduling/elo';
import {
  displayedMastery,
  initialBktState,
  masteredFraction,
  updateBkt,
} from '../scheduling/bkt';
import { optimiseParameters, shouldOptimise } from '../scheduling/optimizer';
import { composeSession } from './composer';
import { checkAnswer } from './answerCheck';
import * as repo from '../data/repositories';
import { loadContentIfNeeded } from '../data/contentLoader';

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

export interface MasterySnapshot {
  bySkill: Map<SkillId, number>;
  byDomain: Map<DomainId, number>;
  masteredFraction: number;
}

/**
 * Current mastery, per skill and rolled up per domain.
 *
 * Displayed mastery is BKT's belief discounted by FSRS retrievability, so a
 * skill learned in October and untouched since reads honestly rather than
 * staying frozen at whatever it peaked at.
 */
export async function computeMastery(
  student: Student,
  phase: ProgramPhase
): Promise<MasterySnapshot> {
  const scheduler = createScheduler({ desiredRetention: budgetFor(phase).desiredRetention });
  const [bktStates, fsrsBySkill] = await Promise.all([
    repo.getBktStates(student.id),
    repo.skillRetrievabilityInputs(student.id),
  ]);

  const now = new Date();
  const bySkill = new Map<SkillId, number>();
  const forFraction: { state: ReturnType<typeof initialBktState>; retrievability: number }[] = [];

  for (const skill of ALL_SKILLS) {
    const bkt = bktStates.get(skill.id);
    if (!bkt) {
      bySkill.set(skill.id, 0);
      continue;
    }

    const states = fsrsBySkill.get(skill.id) ?? [];
    const meanRetrievability =
      states.length === 0
        ? 0
        : states.reduce((sum, s) => sum + retrievability(scheduler, s, now), 0) / states.length;

    bySkill.set(skill.id, displayedMastery(bkt, meanRetrievability));
    forFraction.push({ state: bkt, retrievability: meanRetrievability });
  }

  const byDomain = new Map<DomainId, number>();
  for (const domain of ALL_DOMAINS) {
    const values = domain.skills.map((s) => bySkill.get(s.id) ?? 0);
    byDomain.set(
      domain.id,
      values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
    );
  }

  return {
    bySkill,
    byDomain,
    masteredFraction: masteredFraction(forFraction, TOTAL_SKILL_COUNT),
  };
}

// ---------------------------------------------------------------------------
// Today's session
// ---------------------------------------------------------------------------

export interface TodaySession {
  session: Session;
  items: Item[];
  phase: ProgramPhase;
  phaseReason: string;
  notes: ReturnType<typeof composeSession>['notes'];
}

/**
 * The one call the home screen makes.
 *
 * Reuses an already-composed session for today rather than recomposing, so
 * closing and reopening the app mid-session does not reshuffle the questions
 * out from under the student.
 */
export async function getOrCreateTodaySession(
  studentId: string,
  today: LocalDate = toLocalDate()
): Promise<TodaySession> {
  await loadContentIfNeeded();

  const student = await repo.getStudent(studentId);
  if (!student) throw new Error(`No student with id ${studentId}`);

  const existing = await repo.getSessionForDate(studentId, today);
  const preliminaryPhase = decidePhase(student, 0, today);
  const mastery = await computeMastery(student, existing?.phase ?? preliminaryPhase.phase);
  const decision = decidePhase(student, mastery.masteredFraction, today);

  if (existing) {
    const items = await repo.getItems(existing.blocks.flatMap((b) => b.itemIds));
    return {
      session: existing,
      items,
      phase: existing.phase,
      phaseReason: decision.reason,
      notes: {
        missedDays: existing.missedDaysBefore,
        minutesShiftedToReview: 0,
        dueCount: 0,
        errorQueueSize: 0,
        newSkillTarget: null,
        underfilledBlocks: [],
      },
    };
  }

  const [allItems, fsrsStates, eloStates, errorQueue, practisedDates] = await Promise.all([
    repo.getAllItems(),
    repo.getFsrsStates(studentId),
    repo.getEloStates(studentId),
    repo.getErrorQueue(studentId),
    repo.getCompletedDates(studentId),
  ]);

  const composed = composeSession({
    studentId,
    today,
    phase: decision.phase,
    now: new Date(),
    items: allItems,
    fsrsStates,
    eloStates,
    masteryBySkill: mastery.bySkill,
    errorQueue,
    practisedDates,
    programStartDate: student.programStartDate,
  });

  await repo.saveSession(composed.session);
  const items = await repo.getItems(composed.session.blocks.flatMap((b) => b.itemIds));

  return {
    session: composed.session,
    items,
    phase: decision.phase,
    phaseReason: decision.reason,
    notes: composed.notes,
  };
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export interface AnswerOutcome {
  correct: boolean;
  /** Shown only after the answer is committed (T-08). */
  rationale: string;
  /** When this item is scheduled to come back. */
  nextDue: string;
}

/**
 * Record one answer and advance every model that depends on it.
 *
 * Order matters: the FSRS snapshot must be captured before the state advances,
 * because it records the model's prediction *at the moment of test* — the only
 * version that is any use for calibration or for the T-17 optimiser.
 */
export async function recordAnswer(params: {
  student: Student;
  session: Session;
  item: Item;
  response: string;
  responseTimeMs: number;
  blockKind: BlockKind;
  phase: ProgramPhase;
  now?: Date;
}): Promise<AnswerOutcome> {
  const now = params.now ?? new Date();
  const { correct } = checkAnswer(params.item, params.response);
  const grade = deriveGrade(correct, params.responseTimeMs, params.item.estimatedSeconds);

  const scheduler = createScheduler({
    desiredRetention: budgetFor(params.phase).desiredRetention,
    weights: (await repo.getFsrsParams(params.student.id))?.weights,
  });

  const fsrsStates = await repo.getFsrsStates(params.student.id);
  const currentFsrs =
    fsrsStates.get(params.item.id) ?? emptyState(params.student.id, params.item.id, now);

  const { next, snapshot } = review(scheduler, currentFsrs, grade, now);
  await repo.saveFsrsState(next);

  const primarySkill = params.item.skills[0]!;

  const eloStates = await repo.getEloStates(params.student.id);
  const currentElo = eloStates.get(primarySkill) ?? initialEloState(params.student.id, primarySkill, now);
  const eloUpdate = updateElo(currentElo, params.item.difficulty, correct, now);
  await repo.saveEloState(eloUpdate.next);

  const bktStates = await repo.getBktStates(params.student.id);
  const currentBkt = bktStates.get(primarySkill) ?? initialBktState(params.student.id, primarySkill, now);
  await repo.saveBktState(updateBkt(currentBkt, correct, now));

  const attempt: Attempt = {
    id: repo.newId(),
    studentId: params.student.id,
    itemId: params.item.id,
    sessionId: params.session.id,
    blockKind: params.blockKind,
    answeredAt: now.toISOString(),
    response: params.response,
    correct,
    responseTimeMs: params.responseTimeMs,
    grade,
    stabilityBefore: snapshot.stabilityBefore,
    difficultyBefore: snapshot.difficultyBefore,
    retrievabilityBefore: snapshot.retrievabilityBefore,
    elapsedDays: snapshot.elapsedDays,
    eloBefore: eloUpdate.before,
    synced: false,
  };
  await repo.saveAttempt(attempt);

  return { correct, rationale: params.item.rationale, nextDue: next.due };
}

export async function startSession(session: Session, now = new Date()): Promise<Session> {
  const updated = { ...session, startedAt: session.startedAt ?? now.toISOString() };
  await repo.saveSession(updated);
  return updated;
}

export async function completeSession(
  session: Session,
  actualSeconds: number,
  now = new Date()
): Promise<Session> {
  const updated = {
    ...session,
    completedAt: now.toISOString(),
    actualSeconds,
    synced: false,
  };
  await repo.saveSession(updated);

  // Snapshot mastery for the week. Mastery is computed live from BKT and
  // retrievability, so today's value is unrecoverable once it moves — without
  // this, week-over-week trend has nothing to compare against and the parent's
  // movement column would be permanently zero.
  try {
    const student = await repo.getStudent(session.studentId);
    if (student) {
      const snapshot = await computeMastery(student, session.phase);
      await repo.saveMasterySnapshot(
        session.studentId,
        startOfWeek(session.date),
        snapshot.byDomain
      );
    }
  } catch {
    // Never let bookkeeping fail a completed session — the student is done.
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Background maintenance
// ---------------------------------------------------------------------------

export interface MaintenanceReport {
  optimiserRan: boolean;
  optimiserAdopted: boolean;
  optimiserReason: string | null;
}

/**
 * T-17 — Re-fit FSRS parameters when enough new history has accumulated.
 *
 * Runs off the critical path. If the fit fails to beat the published defaults
 * on held-out data the result is discarded, which is a normal outcome rather
 * than an error — with one student, the population prior is often genuinely
 * better than anything fitted.
 */
export async function runScheduledMaintenance(student: Student): Promise<MaintenanceReport> {
  const [reviewCount, existing] = await Promise.all([
    repo.getAttemptCount(student.id),
    repo.getFsrsParams(student.id),
  ]);

  if (!shouldOptimise(reviewCount, existing?.optimisedAt ?? null)) {
    return { optimiserRan: false, optimiserAdopted: false, optimiserReason: null };
  }

  const history = await repo.getReviewHistory(student.id);
  const phase = decidePhase(student, 0).phase;
  const result = optimiseParameters(history, budgetFor(phase).desiredRetention);

  if (result.adopted) {
    await repo.saveFsrsParams(
      student.id,
      result.weights,
      result.reviewCount,
      result.trainLogLoss,
      result.baselineLogLoss
    );
  }

  return {
    optimiserRan: true,
    optimiserAdopted: result.adopted,
    optimiserReason: result.reason,
  };
}

export { getSkill };
