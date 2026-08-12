/**
 * Local database handle.
 *
 * SQLite is the source of truth (see migrations.ts). Everything the app reads
 * and writes goes here first; Supabase sync is downstream and best-effort.
 */

import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';

export const DATABASE_NAME = 'satprep.db';

let handle: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Open the database, running migrations on first use.
 *
 * The in-flight promise is cached, not just the result: two screens mounting
 * at once would otherwise both start opening and both run migrations.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await migrate(db);
    handle = db;
    return db;
  })();

  try {
    return await opening;
  } finally {
    opening = null;
  }
}

/** Test/reset hook. Closes the handle so the next getDb() reopens cleanly. */
export async function closeDb(): Promise<void> {
  if (handle) {
    await handle.closeAsync();
    handle = null;
  }
}

// ---------------------------------------------------------------------------
// app_meta helpers
// ---------------------------------------------------------------------------

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

export const META_KEYS = {
  contentVersion: 'content_version',
  lastSyncAt: 'last_sync_at',
  lastTaxonomyCheckAt: 'last_taxonomy_check_at',
  activeStudentId: 'active_student_id',
} as const;
