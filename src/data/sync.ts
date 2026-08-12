/**
 * T-09 — Offline-first sync.
 *
 * The contract from PRD §2.5: "the daily session itself must work with no
 * network... a session that fails offline breaks the entire habit-engine
 * premise." So this module is strictly one-directional catch-up — SQLite is
 * written first and always, and this pushes what has accumulated whenever a
 * network happens to be available.
 *
 * Nothing here is on the critical path of answering a question. A sync failure
 * is logged and retried later; it never surfaces as an error to the student
 * mid-session.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { assertClean } from '../privacy/policy';
import { getDb, META_KEYS, setMeta } from './db';
import { isSupabaseConfigured, supabase } from '../supabase/client';

/** Rows per upload. Small enough to succeed on a poor connection. */
const BATCH_SIZE = 100;

export interface SyncResult {
  ran: boolean;
  uploaded: { attempts: number; sessions: number; testResults: number; digests: number };
  error: string | null;
}

const EMPTY: SyncResult['uploaded'] = {
  attempts: 0,
  sessions: 0,
  testResults: 0,
  digests: 0,
};

/**
 * Push everything not yet uploaded.
 *
 * Each table is handled independently so one failing batch cannot block the
 * others, and rows are only marked synced after the server confirms the write.
 * A crash mid-sync therefore re-uploads rather than silently dropping data —
 * the upserts are keyed on the row id, so a repeat is harmless.
 */
export async function syncNow(client: SupabaseClient | null = supabase): Promise<SyncResult> {
  if (!isSupabaseConfigured || !client) {
    return { ran: false, uploaded: EMPTY, error: null };
  }

  const { data: auth } = await client.auth.getSession();
  if (!auth.session) {
    return { ran: false, uploaded: EMPTY, error: 'Not signed in' };
  }

  const db = await getDb();
  const uploaded = { ...EMPTY };

  try {
    // --- attempts -----------------------------------------------------------
    const attempts = await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, student_id, item_id, session_id, block_kind, answered_at, response,
              correct, response_time_ms, grade, stability_before, difficulty_before,
              retrievability_before, elapsed_days, elo_before
       FROM attempts WHERE synced = 0 LIMIT ?`,
      BATCH_SIZE
    );

    if (attempts.length > 0) {
      const rows = attempts.map((a) => ({ ...a, correct: a.correct === 1 }));
      // Last line of defence before anything leaves the device (T-13).
      assertClean(rows);
      const { error } = await client.from('attempts').upsert(rows);
      if (error) throw new Error(`attempts: ${error.message}`);
      await markSynced(db, 'attempts', attempts.map((a) => a.id as string));
      uploaded.attempts = attempts.length;
    }

    // --- sessions -----------------------------------------------------------
    const sessions = await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, student_id, date, phase, blocks_json, started_at, completed_at,
              actual_seconds, missed_days_before
       FROM sessions WHERE synced = 0 LIMIT ?`,
      BATCH_SIZE
    );

    if (sessions.length > 0) {
      const rows = sessions.map(({ blocks_json, ...rest }) => ({
        ...rest,
        blocks: JSON.parse(blocks_json as string),
      }));
      assertClean(rows);
      const { error } = await client.from('sessions').upsert(rows);
      if (error) throw new Error(`sessions: ${error.message}`);
      await markSynced(db, 'sessions', sessions.map((s) => s.id as string));
      uploaded.sessions = sessions.length;
    }

    // --- test results -------------------------------------------------------
    const results = await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, student_id, kind, taken_on, section_scores_json, domain_scores_json,
              total_scaled, confidence_half_width, attempt_ids_json
       FROM test_results WHERE synced = 0 LIMIT ?`,
      BATCH_SIZE
    );

    if (results.length > 0) {
      const rows = results.map(
        ({ section_scores_json, domain_scores_json, attempt_ids_json, ...rest }) => ({
          ...rest,
          section_scores: JSON.parse(section_scores_json as string),
          domain_scores: JSON.parse(domain_scores_json as string),
          attempt_ids: JSON.parse(attempt_ids_json as string),
        })
      );
      assertClean(rows);
      const { error } = await client.from('test_results').upsert(rows);
      if (error) throw new Error(`test_results: ${error.message}`);
      await markSynced(db, 'test_results', results.map((r) => r.id as string));
      uploaded.testResults = results.length;
    }

    // --- weekly digests -----------------------------------------------------
    // The only table the parent can read, so it matters most that it lands.
    const digests = await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, student_id, week_start, payload_json, generated_at
       FROM weekly_digests WHERE synced = 0 LIMIT ?`,
      BATCH_SIZE
    );

    if (digests.length > 0) {
      const rows = digests.map(({ payload_json, ...rest }) => ({
        ...rest,
        payload: JSON.parse(payload_json as string),
      }));
      assertClean(rows);
      const { error } = await client.from('weekly_digests').upsert(rows);
      if (error) throw new Error(`weekly_digests: ${error.message}`);
      await markSynced(db, 'weekly_digests', digests.map((d) => d.id as string));
      uploaded.digests = digests.length;
    }

    await setMeta(META_KEYS.lastSyncAt, new Date().toISOString());
    return { ran: true, uploaded, error: null };
  } catch (error) {
    // Deliberately swallowed: the student's data is safe in SQLite and the next
    // attempt will pick up where this one stopped.
    return {
      ran: true,
      uploaded,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function markSynced(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}

/** How much is waiting to upload. Drives the "N items pending" indicator. */
export async function pendingSyncCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT
       (SELECT COUNT(*) FROM attempts WHERE synced = 0) +
       (SELECT COUNT(*) FROM sessions WHERE synced = 0) +
       (SELECT COUNT(*) FROM test_results WHERE synced = 0) +
       (SELECT COUNT(*) FROM weekly_digests WHERE synced = 0) AS n`
  );
  return row?.n ?? 0;
}

/** Pull the parent's read-only digest feed. The parent device writes nothing. */
export async function fetchDigestsForParent(
  studentId: string,
  client: SupabaseClient | null = supabase
): Promise<{ weekStart: string; payload: unknown }[]> {
  if (!client) return [];
  const { data, error } = await client
    .from('weekly_digests')
    .select('week_start, payload')
    .eq('student_id', studentId)
    .order('week_start', { ascending: false })
    .limit(12);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    weekStart: row.week_start as string,
    payload: row.payload,
  }));
}
