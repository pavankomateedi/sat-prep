/**
 * Repository layer — every read and write the app makes against SQLite.
 *
 * Kept as plain functions over the shared handle rather than classes: there is
 * one database and one student, and an abstraction with a single implementation
 * is just indirection.
 *
 * All writes set `synced = 0`. The sync worker (sync.ts) flips that after a
 * successful upload, which is what makes the offline path the default rather
 * than a fallback.
 */

import * as Crypto from 'expo-crypto';
import type {
  Attempt,
  BktState,
  EloState,
  FsrsState,
  FullLengthTestResult,
  Item,
  Session,
  Student,
  WeeklySummary,
} from '../domain/types';
import type { SkillId } from '../domain/taxonomy';
import type { LocalDate } from '../lib/dates';
import { getDb } from './db';
import type { ErrorQueueEntry } from '../session/composer';

export function newId(): string {
  return Crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  section: string;
  domain: string;
  item_type: string;
  difficulty: string;
  stimulus: string | null;
  stimulus_b: string | null;
  stem: string;
  choices_json: string | null;
  answer_json: string;
  rationale: string;
  passage_id: string | null;
  figure_json: string | null;
  source_json: string;
  estimated_seconds: number;
  version: number;
  skills?: string;
}

function toItem(row: ItemRow, skills: string[]): Item {
  return {
    id: row.id,
    section: row.section as Item['section'],
    domain: row.domain as Item['domain'],
    skills: skills as SkillId[],
    itemType: row.item_type as Item['itemType'],
    difficulty: row.difficulty as Item['difficulty'],
    ...(row.stimulus ? { stimulus: row.stimulus } : {}),
    ...(row.stimulus_b ? { stimulusB: row.stimulus_b } : {}),
    stem: row.stem,
    ...(row.choices_json ? { choices: JSON.parse(row.choices_json) } : {}),
    answer: JSON.parse(row.answer_json),
    rationale: row.rationale,
    ...(row.passage_id ? { passageId: row.passage_id } : {}),
    ...(row.figure_json ? { figure: JSON.parse(row.figure_json) } : {}),
    source: JSON.parse(row.source_json),
    estimatedSeconds: row.estimated_seconds,
    version: row.version,
  };
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function upsertStudent(student: Student): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO students (id, display_name, grade_level, program_start_date, target_test_date)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       grade_level = excluded.grade_level,
       program_start_date = excluded.program_start_date,
       target_test_date = excluded.target_test_date`,
    student.id,
    student.displayName,
    student.gradeLevel,
    student.programStartDate,
    student.targetTestDate
  );
}

export async function getStudent(id: string): Promise<Student | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    display_name: string;
    grade_level: number;
    program_start_date: string;
    target_test_date: string;
  }>('SELECT * FROM students WHERE id = ?', id);

  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    gradeLevel: row.grade_level,
    programStartDate: row.program_start_date,
    targetTestDate: row.target_test_date,
  };
}

export async function getFirstStudent(): Promise<Student | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM students LIMIT 1');
  return row ? getStudent(row.id) : null;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function getAllItems(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT i.*, (
       SELECT group_concat(s.skill_id, ',')
       FROM (SELECT skill_id FROM item_skills WHERE item_id = i.id ORDER BY ordinal) s
     ) AS skills
     FROM items i`
  );
  return rows.map((row) => toItem(row, (row.skills ?? '').split(',').filter(Boolean)));
}

export async function getItems(ids: readonly string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT i.*, (
       SELECT group_concat(s.skill_id, ',')
       FROM (SELECT skill_id FROM item_skills WHERE item_id = i.id ORDER BY ordinal) s
     ) AS skills
     FROM items i WHERE i.id IN (${placeholders})`,
    ...ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Preserve the caller's ordering — sessions depend on presentation order.
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is ItemRow => r !== undefined)
    .map((row) => toItem(row, (row.skills ?? '').split(',').filter(Boolean)));
}

export async function itemCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM items');
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// FSRS state
// ---------------------------------------------------------------------------

interface FsrsRow {
  student_id: string;
  item_id: string;
  stability: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  reps: number;
  lapses: number;
  state: number;
  scheduled_days: number;
  elapsed_days: number;
  learning_steps: number;
}

function toFsrsState(row: FsrsRow): FsrsState {
  return {
    studentId: row.student_id,
    itemId: row.item_id,
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due,
    lastReview: row.last_review,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    scheduledDays: row.scheduled_days,
    elapsedDays: row.elapsed_days,
    learningSteps: row.learning_steps,
  };
}

export async function getFsrsStates(studentId: string): Promise<Map<string, FsrsState>> {
  const db = await getDb();
  const rows = await db.getAllAsync<FsrsRow>(
    'SELECT * FROM fsrs_state WHERE student_id = ?',
    studentId
  );
  return new Map(rows.map((r) => [r.item_id, toFsrsState(r)]));
}

export async function saveFsrsState(state: FsrsState): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO fsrs_state (
       student_id, item_id, stability, difficulty, due, last_review,
       reps, lapses, state, scheduled_days, elapsed_days, learning_steps
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id, item_id) DO UPDATE SET
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       due = excluded.due,
       last_review = excluded.last_review,
       reps = excluded.reps,
       lapses = excluded.lapses,
       state = excluded.state,
       scheduled_days = excluded.scheduled_days,
       elapsed_days = excluded.elapsed_days,
       learning_steps = excluded.learning_steps`,
    state.studentId,
    state.itemId,
    state.stability,
    state.difficulty,
    state.due,
    state.lastReview,
    state.reps,
    state.lapses,
    state.state,
    state.scheduledDays,
    state.elapsedDays,
    state.learningSteps
  );
}

/** Mean retrievability across a skill's items — feeds the mastery display. */
export async function skillRetrievabilityInputs(
  studentId: string
): Promise<Map<SkillId, FsrsState[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync<FsrsRow & { skill_id: string }>(
    `SELECT f.*, s.skill_id
     FROM fsrs_state f
     JOIN item_skills s ON s.item_id = f.item_id AND s.is_primary = 1
     WHERE f.student_id = ?`,
    studentId
  );

  const out = new Map<SkillId, FsrsState[]>();
  for (const row of rows) {
    const key = row.skill_id as SkillId;
    const list = out.get(key) ?? [];
    list.push(toFsrsState(row));
    out.set(key, list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Elo and BKT
// ---------------------------------------------------------------------------

export async function getEloStates(studentId: string): Promise<Map<SkillId, EloState>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    student_id: string;
    skill_id: string;
    ability: number;
    attempts: number;
    updated_at: string;
  }>('SELECT * FROM elo_state WHERE student_id = ?', studentId);

  return new Map(
    rows.map((r) => [
      r.skill_id as SkillId,
      {
        studentId: r.student_id,
        skillId: r.skill_id as SkillId,
        ability: r.ability,
        attempts: r.attempts,
        updatedAt: r.updated_at,
      },
    ])
  );
}

export async function saveEloState(state: EloState): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO elo_state (student_id, skill_id, ability, attempts, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(student_id, skill_id) DO UPDATE SET
       ability = excluded.ability,
       attempts = excluded.attempts,
       updated_at = excluded.updated_at`,
    state.studentId,
    state.skillId,
    state.ability,
    state.attempts,
    state.updatedAt
  );
}

export async function getBktStates(studentId: string): Promise<Map<SkillId, BktState>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    student_id: string;
    skill_id: string;
    p_known: number;
    attempts: number;
    updated_at: string;
  }>('SELECT * FROM bkt_state WHERE student_id = ?', studentId);

  return new Map(
    rows.map((r) => [
      r.skill_id as SkillId,
      {
        studentId: r.student_id,
        skillId: r.skill_id as SkillId,
        pKnown: r.p_known,
        attempts: r.attempts,
        updatedAt: r.updated_at,
      },
    ])
  );
}

export async function saveBktState(state: BktState): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO bkt_state (student_id, skill_id, p_known, attempts, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(student_id, skill_id) DO UPDATE SET
       p_known = excluded.p_known,
       attempts = excluded.attempts,
       updated_at = excluded.updated_at`,
    state.studentId,
    state.skillId,
    state.pKnown,
    state.attempts,
    state.updatedAt
  );
}

// ---------------------------------------------------------------------------
// FSRS parameters (T-17)
// ---------------------------------------------------------------------------

export async function getFsrsParams(
  studentId: string
): Promise<{ weights: number[]; optimisedAt: string; reviewCount: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    params_json: string;
    optimised_at: string;
    review_count: number;
  }>('SELECT * FROM fsrs_params WHERE student_id = ?', studentId);

  if (!row) return null;
  return {
    weights: JSON.parse(row.params_json),
    optimisedAt: row.optimised_at,
    reviewCount: row.review_count,
  };
}

export async function saveFsrsParams(
  studentId: string,
  weights: readonly number[],
  reviewCount: number,
  trainLogLoss: number,
  baselineLogLoss: number
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO fsrs_params (student_id, params_json, optimised_at, review_count, train_log_loss, baseline_log_loss)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
       params_json = excluded.params_json,
       optimised_at = excluded.optimised_at,
       review_count = excluded.review_count,
       train_log_loss = excluded.train_log_loss,
       baseline_log_loss = excluded.baseline_log_loss`,
    studentId,
    JSON.stringify([...weights]),
    new Date().toISOString(),
    reviewCount,
    trainLogLoss,
    baselineLogLoss
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function saveSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sessions (
       id, student_id, date, phase, blocks_json, started_at, completed_at,
       actual_seconds, missed_days_before, synced
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(student_id, date) DO UPDATE SET
       phase = excluded.phase,
       blocks_json = excluded.blocks_json,
       started_at = excluded.started_at,
       completed_at = excluded.completed_at,
       actual_seconds = excluded.actual_seconds,
       missed_days_before = excluded.missed_days_before,
       synced = 0`,
    session.id,
    session.studentId,
    session.date,
    session.phase,
    JSON.stringify(session.blocks),
    session.startedAt,
    session.completedAt,
    session.actualSeconds,
    session.missedDaysBefore
  );
}

interface SessionRow {
  id: string;
  student_id: string;
  date: string;
  phase: string;
  blocks_json: string;
  started_at: string | null;
  completed_at: string | null;
  actual_seconds: number;
  missed_days_before: number;
  synced: number;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.date,
    phase: row.phase as Session['phase'],
    blocks: JSON.parse(row.blocks_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    actualSeconds: row.actual_seconds,
    missedDaysBefore: row.missed_days_before,
    synced: row.synced === 1,
  };
}

export async function getSessionForDate(
  studentId: string,
  date: LocalDate
): Promise<Session | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    'SELECT * FROM sessions WHERE student_id = ? AND date = ?',
    studentId,
    date
  );
  return row ? toSession(row) : null;
}

export async function getCompletedDates(studentId: string): Promise<Set<LocalDate>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT date FROM sessions WHERE student_id = ? AND completed_at IS NOT NULL',
    studentId
  );
  return new Set(rows.map((r) => r.date));
}

export async function getMinutesByDate(studentId: string): Promise<Map<LocalDate, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string; actual_seconds: number }>(
    'SELECT date, actual_seconds FROM sessions WHERE student_id = ? AND completed_at IS NOT NULL',
    studentId
  );
  return new Map(rows.map((r) => [r.date, Math.round(r.actual_seconds / 60)]));
}

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

export async function saveAttempt(attempt: Attempt): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO attempts (
       id, student_id, item_id, session_id, block_kind, answered_at, response,
       correct, response_time_ms, grade, stability_before, difficulty_before,
       retrievability_before, elapsed_days, elo_before, synced
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    attempt.id,
    attempt.studentId,
    attempt.itemId,
    attempt.sessionId,
    attempt.blockKind,
    attempt.answeredAt,
    attempt.response,
    attempt.correct ? 1 : 0,
    attempt.responseTimeMs,
    attempt.grade,
    attempt.stabilityBefore,
    attempt.difficultyBefore,
    attempt.retrievabilityBefore,
    attempt.elapsedDays,
    attempt.eloBefore
  );
}

/** Review history for the optimiser (T-17), oldest first. */
export async function getReviewHistory(studentId: string): Promise<
  { itemId: string; answeredAt: string; grade: Attempt['grade']; correct: boolean }[]
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    item_id: string;
    answered_at: string;
    grade: string;
    correct: number;
  }>(
    'SELECT item_id, answered_at, grade, correct FROM attempts WHERE student_id = ? ORDER BY answered_at ASC',
    studentId
  );
  return rows.map((r) => ({
    itemId: r.item_id,
    answeredAt: r.answered_at,
    grade: r.grade as Attempt['grade'],
    correct: r.correct === 1,
  }));
}

export async function getAttemptCount(studentId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM attempts WHERE student_id = ?',
    studentId
  );
  return row?.n ?? 0;
}

/** Predicted-vs-actual pairs for the calibration report. */
export async function getCalibrationInputs(
  studentId: string
): Promise<{ retrievabilityBefore: number | null; correct: boolean }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ retrievability_before: number | null; correct: number }>(
    'SELECT retrievability_before, correct FROM attempts WHERE student_id = ?',
    studentId
  );
  return rows.map((r) => ({
    retrievabilityBefore: r.retrievability_before,
    correct: r.correct === 1,
  }));
}

/**
 * T-08 — Items whose most recent attempt was incorrect.
 *
 * The window function picks the latest attempt per item; an item the student
 * has since got right drops out of the queue automatically, which is what makes
 * the error log self-clearing rather than an ever-growing list of past sins.
 */
export async function getErrorQueue(studentId: string): Promise<ErrorQueueEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    item_id: string;
    answered_at: string;
    wrong_count: number;
  }>(
    `WITH ranked AS (
       SELECT item_id, answered_at, correct,
              ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY answered_at DESC) AS rn
       FROM attempts WHERE student_id = ?
     )
     SELECT r.item_id,
            r.answered_at,
            (SELECT COUNT(*) FROM attempts a
              WHERE a.student_id = ? AND a.item_id = r.item_id AND a.correct = 0) AS wrong_count
     FROM ranked r
     WHERE r.rn = 1 AND r.correct = 0`,
    studentId,
    studentId
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    lastWrongAt: r.answered_at,
    wrongCount: r.wrong_count,
  }));
}

// ---------------------------------------------------------------------------
// Test results
// ---------------------------------------------------------------------------

export async function saveTestResult(result: FullLengthTestResult): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO test_results (
       id, student_id, kind, taken_on, section_scores_json, domain_scores_json,
       total_scaled, confidence_half_width, attempt_ids_json, synced
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    result.id,
    result.studentId,
    result.kind,
    result.takenOn,
    JSON.stringify(result.sectionScores),
    JSON.stringify(result.domainScores),
    result.totalScaled,
    result.confidenceHalfWidth,
    JSON.stringify(result.attemptIds)
  );
}

export async function getTestResults(studentId: string): Promise<FullLengthTestResult[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    student_id: string;
    kind: string;
    taken_on: string;
    section_scores_json: string;
    domain_scores_json: string;
    total_scaled: number;
    confidence_half_width: number;
    attempt_ids_json: string;
    synced: number;
  }>('SELECT * FROM test_results WHERE student_id = ? ORDER BY taken_on DESC', studentId);

  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    kind: r.kind as FullLengthTestResult['kind'],
    takenOn: r.taken_on,
    sectionScores: JSON.parse(r.section_scores_json),
    domainScores: JSON.parse(r.domain_scores_json),
    totalScaled: r.total_scaled,
    confidenceHalfWidth: r.confidence_half_width,
    attemptIds: JSON.parse(r.attempt_ids_json),
    synced: r.synced === 1,
  }));
}

export async function getLatestTestResult(
  studentId: string
): Promise<FullLengthTestResult | null> {
  const results = await getTestResults(studentId);
  return results[0] ?? null;
}

// ---------------------------------------------------------------------------
// Weekly digests (T-20)
// ---------------------------------------------------------------------------

export async function saveDigest(summary: WeeklySummary): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO weekly_digests (id, student_id, week_start, payload_json, generated_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(student_id, week_start) DO UPDATE SET
       payload_json = excluded.payload_json,
       generated_at = excluded.generated_at,
       synced = 0`,
    newId(),
    summary.studentId,
    summary.weekStart,
    JSON.stringify(summary),
    summary.generatedAt
  );
}

export async function getDigests(studentId: string, limit = 12): Promise<WeeklySummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload_json: string }>(
    'SELECT payload_json FROM weekly_digests WHERE student_id = ? ORDER BY week_start DESC LIMIT ?',
    studentId,
    limit
  );
  return rows.map((r) => JSON.parse(r.payload_json) as WeeklySummary);
}

// ---------------------------------------------------------------------------
// Mastery snapshots
// ---------------------------------------------------------------------------

/**
 * Record this week's mastery, one row per domain.
 *
 * Idempotent per week: re-running overwrites, so the snapshot reflects the most
 * recent state within the week rather than whichever moment happened to trigger
 * first.
 */
export async function saveMasterySnapshot(
  studentId: string,
  weekStart: LocalDate,
  masteryByDomain: ReadonlyMap<string, number>
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [domain, mastery] of masteryByDomain) {
      await txn.runAsync(
        `INSERT INTO mastery_snapshots (student_id, week_start, domain, mastery, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(student_id, week_start, domain) DO UPDATE SET
           mastery = excluded.mastery,
           created_at = excluded.created_at`,
        studentId,
        weekStart,
        domain,
        mastery,
        now
      );
    }
  });
}

export async function getMasterySnapshot(
  studentId: string,
  weekStart: LocalDate
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ domain: string; mastery: number }>(
    'SELECT domain, mastery FROM mastery_snapshots WHERE student_id = ? AND week_start = ?',
    studentId,
    weekStart
  );
  return new Map(rows.map((r) => [r.domain, r.mastery]));
}

/** Snapshots for a trend chart, oldest first. */
export async function getMasteryHistory(
  studentId: string,
  limitWeeks = 26
): Promise<{ weekStart: LocalDate; byDomain: Map<string, number> }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ week_start: string; domain: string; mastery: number }>(
    `SELECT week_start, domain, mastery FROM mastery_snapshots
     WHERE student_id = ?
       AND week_start IN (
         SELECT DISTINCT week_start FROM mastery_snapshots
         WHERE student_id = ? ORDER BY week_start DESC LIMIT ?
       )
     ORDER BY week_start ASC`,
    studentId,
    studentId,
    limitWeeks
  );

  const byWeek = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const week = byWeek.get(row.week_start) ?? new Map<string, number>();
    week.set(row.domain, row.mastery);
    byWeek.set(row.week_start, week);
  }

  return [...byWeek.entries()].map(([weekStart, byDomain]) => ({ weekStart, byDomain }));
}

// ---------------------------------------------------------------------------
// Per-student settings
// ---------------------------------------------------------------------------

export async function getSettings<T>(studentId: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ settings_json: string }>(
    'SELECT settings_json FROM student_settings WHERE student_id = ?',
    studentId
  );
  if (!row) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(row.settings_json) as object) } as T;
  } catch {
    return fallback;
  }
}

export async function saveSettings(studentId: string, settings: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO student_settings (student_id, settings_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
       settings_json = excluded.settings_json,
       updated_at = excluded.updated_at`,
    studentId,
    JSON.stringify(settings),
    new Date().toISOString()
  );
}

/** Observed pacing for the V2 budget tuner. */
export async function getObservedPacing(studentId: string): Promise<{
  sessions: number;
  meanActualSeconds: number;
  errorRetryFailureRate: number;
}> {
  const db = await getDb();

  const pacing = await db.getFirstAsync<{ n: number; mean_seconds: number }>(
    `SELECT COUNT(*) AS n, AVG(actual_seconds) AS mean_seconds
     FROM sessions WHERE student_id = ? AND completed_at IS NOT NULL AND actual_seconds > 0`,
    studentId
  );

  const retries = await db.getFirstAsync<{ total: number; failed: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS failed
     FROM attempts WHERE student_id = ? AND block_kind = 'error_review'`,
    studentId
  );

  return {
    sessions: pacing?.n ?? 0,
    meanActualSeconds: pacing?.mean_seconds ?? 0,
    errorRetryFailureRate:
      retries && retries.total > 0 ? (retries.failed ?? 0) / retries.total : 0,
  };
}

export async function getGeneratedDigestWeeks(studentId: string): Promise<Set<LocalDate>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ week_start: string }>(
    'SELECT week_start FROM weekly_digests WHERE student_id = ?',
    studentId
  );
  return new Set(rows.map((r) => r.week_start));
}
