/**
 * Load the bundled item bank into SQLite.
 *
 * The content ships inside the app, but it lives in SQLite so the composer can
 * select items with real queries — joins against due dates, exclusions for
 * already-seen items, domain balancing — rather than filtering arrays in JS on
 * every session build.
 *
 * Idempotent and version-gated: a reload only happens when CONTENT_VERSION
 * changes, so ordinary launches skip it entirely.
 */

import { CONTENT_VERSION, ITEMS, PASSAGES } from '../../content';
import type { Item, Passage } from '../domain/types';
import { getDb, getMeta, META_KEYS, setMeta } from './db';

export async function isContentLoaded(): Promise<boolean> {
  return (await getMeta(META_KEYS.contentVersion)) === CONTENT_VERSION;
}

/**
 * Write the bank into SQLite if the bundled version differs from what's stored.
 *
 * Uses upserts rather than delete-and-reinsert so that `fsrs_state` and
 * `attempts` rows, which reference item ids, survive a content update. An item
 * whose wording is corrected keeps the student's whole review history.
 */
export async function loadContentIfNeeded(force = false): Promise<{ loaded: boolean; itemCount: number }> {
  if (!force && (await isContentLoaded())) {
    return { loaded: false, itemCount: ITEMS.length };
  }

  const db = await getDb();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const passage of PASSAGES as Passage[]) {
      await txn.runAsync(
        `INSERT INTO passages (id, title, body, body_b, source_json, source_b_json, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           body = excluded.body,
           body_b = excluded.body_b,
           source_json = excluded.source_json,
           source_b_json = excluded.source_b_json,
           word_count = excluded.word_count`,
        passage.id,
        passage.title,
        passage.body,
        passage.bodyB ?? null,
        JSON.stringify(passage.source),
        passage.sourceB ? JSON.stringify(passage.sourceB) : null,
        passage.wordCount
      );
    }

    for (const item of ITEMS as Item[]) {
      await txn.runAsync(
        `INSERT INTO items (
           id, section, domain, item_type, difficulty, stimulus, stimulus_b, stem,
           choices_json, answer_json, rationale, passage_id, figure_json,
           source_json, estimated_seconds, version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           section = excluded.section,
           domain = excluded.domain,
           item_type = excluded.item_type,
           difficulty = excluded.difficulty,
           stimulus = excluded.stimulus,
           stimulus_b = excluded.stimulus_b,
           stem = excluded.stem,
           choices_json = excluded.choices_json,
           answer_json = excluded.answer_json,
           rationale = excluded.rationale,
           passage_id = excluded.passage_id,
           figure_json = excluded.figure_json,
           source_json = excluded.source_json,
           estimated_seconds = excluded.estimated_seconds,
           version = excluded.version`,
        item.id,
        item.section,
        item.domain,
        item.itemType,
        item.difficulty,
        item.stimulus ?? null,
        item.stimulusB ?? null,
        item.stem,
        item.choices ? JSON.stringify(item.choices) : null,
        JSON.stringify(item.answer),
        item.rationale,
        item.passageId ?? null,
        item.figure ? JSON.stringify(item.figure) : null,
        JSON.stringify(item.source),
        item.estimatedSeconds,
        item.version
      );

      await txn.runAsync('DELETE FROM item_skills WHERE item_id = ?', item.id);
      for (const [index, skillId] of item.skills.entries()) {
        await txn.runAsync(
          'INSERT INTO item_skills (item_id, skill_id, ordinal, is_primary) VALUES (?, ?, ?, ?)',
          item.id,
          skillId,
          index,
          index === 0 ? 1 : 0
        );
      }
    }
  });

  await setMeta(META_KEYS.contentVersion, CONTENT_VERSION);
  return { loaded: true, itemCount: ITEMS.length };
}

export { CONTENT_VERSION };
