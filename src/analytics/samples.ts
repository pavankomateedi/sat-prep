/**
 * Join attempts to item facts, producing the flat rows the analytics work on.
 *
 * Attempts store an item id and nothing about the item, because duplicating
 * domain/difficulty onto every attempt would go stale the moment an item is
 * corrected. The join happens here instead, in SQL, so the analytics stay
 * consistent with the current bank.
 */

import type { AttemptSample } from './pacing';
import type { Difficulty, ItemType } from '../domain/types';
import type { DomainId, SectionId, SkillId } from '../domain/taxonomy';
import { getDb } from '../data/db';

/**
 * All of this student's attempts, with the item facts attached.
 *
 * `limit` caps how far back it reaches. Over two years this table grows to tens
 * of thousands of rows, and pacing from eighteen months ago says nothing useful
 * about pacing now — recent behaviour is the whole point.
 */
export async function buildAttemptSamples(
  studentId: string,
  limit = 1500
): Promise<AttemptSample[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<{
    item_id: string;
    section: string;
    domain: string;
    skill_id: string | null;
    difficulty: string;
    item_type: string;
    correct: number;
    response_time_ms: number;
    answered_at: string;
  }>(
    `SELECT a.item_id,
            i.section,
            i.domain,
            (SELECT s.skill_id FROM item_skills s
              WHERE s.item_id = i.id AND s.is_primary = 1 LIMIT 1) AS skill_id,
            i.difficulty,
            i.item_type,
            a.correct,
            a.response_time_ms,
            a.answered_at
     FROM attempts a
     JOIN items i ON i.id = a.item_id
     WHERE a.student_id = ?
     ORDER BY a.answered_at DESC
     LIMIT ?`,
    studentId,
    limit
  );

  return rows
    .filter((row) => row.skill_id !== null)
    .map((row) => ({
      itemId: row.item_id,
      section: row.section as SectionId,
      domain: row.domain as DomainId,
      skill: row.skill_id as SkillId,
      difficulty: row.difficulty as Difficulty,
      itemType: row.item_type as ItemType,
      correct: row.correct === 1,
      responseTimeMs: row.response_time_ms,
      answeredAt: row.answered_at,
    }));
}
