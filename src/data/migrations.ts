/**
 * T-04 — Local SQLite schema.
 *
 * SQLite on the device is the *source of truth*, not a cache. PRD §2.5 makes
 * offline operation a hard requirement ("a session that fails offline breaks
 * the entire habit-engine premise"), so every write lands here first and
 * Supabase is a downstream sync target (T-09).
 *
 * Migrations are append-only and applied by `PRAGMA user_version`, the pattern
 * in the Expo SDK 57 SQLite docs. Never edit a shipped migration — add a new
 * one, or an existing install will skip your change.
 */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      -- Content -------------------------------------------------------------
      -- The item bank is authored offline and loaded from bundled JSON, but it
      -- lives in SQLite so the composer can select items with real queries
      -- (join against due dates, exclude already-seen, balance by domain).

      CREATE TABLE IF NOT EXISTS passages (
        id            TEXT PRIMARY KEY NOT NULL,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        body_b        TEXT,
        source_json   TEXT NOT NULL,
        source_b_json TEXT,
        word_count    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id                TEXT PRIMARY KEY NOT NULL,
        section           TEXT NOT NULL,
        domain            TEXT NOT NULL,
        item_type         TEXT NOT NULL,
        difficulty        TEXT NOT NULL,
        stimulus          TEXT,
        stimulus_b        TEXT,
        stem              TEXT NOT NULL,
        choices_json      TEXT,
        answer_json       TEXT NOT NULL,
        rationale         TEXT NOT NULL,
        passage_id        TEXT REFERENCES passages(id),
        figure_json       TEXT,
        source_json       TEXT NOT NULL,
        estimated_seconds INTEGER NOT NULL,
        version           INTEGER NOT NULL DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_items_domain ON items(domain);
      CREATE INDEX IF NOT EXISTS idx_items_section ON items(section);
      CREATE INDEX IF NOT EXISTS idx_items_passage ON items(passage_id);

      -- Normalised so "items for skill X" is an index hit rather than a scan
      -- over a JSON column.
      CREATE TABLE IF NOT EXISTS item_skills (
        item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        skill_id   TEXT NOT NULL,
        ordinal    INTEGER NOT NULL,
        is_primary INTEGER NOT NULL,
        PRIMARY KEY (item_id, skill_id)
      );

      CREATE INDEX IF NOT EXISTS idx_item_skills_skill ON item_skills(skill_id);
      CREATE INDEX IF NOT EXISTS idx_item_skills_primary
        ON item_skills(skill_id, is_primary);

      -- Accounts ------------------------------------------------------------
      -- PRD §2.7 data minimisation: display_name is a nickname. There is
      -- deliberately no column for legal name, address, phone, or geolocation,
      -- so the schema itself forbids storing them.

      CREATE TABLE IF NOT EXISTS students (
        id                 TEXT PRIMARY KEY NOT NULL,
        display_name       TEXT NOT NULL,
        grade_level        INTEGER NOT NULL,
        program_start_date TEXT NOT NULL,
        target_test_date   TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS parent_viewers (
        id                TEXT PRIMARY KEY NOT NULL,
        linked_student_id TEXT NOT NULL REFERENCES students(id),
        display_name      TEXT NOT NULL
      );

      -- Scheduling and mastery state ----------------------------------------

      CREATE TABLE IF NOT EXISTS fsrs_state (
        student_id     TEXT NOT NULL REFERENCES students(id),
        item_id        TEXT NOT NULL REFERENCES items(id),
        stability      REAL NOT NULL,
        difficulty     REAL NOT NULL,
        due            TEXT NOT NULL,
        last_review    TEXT,
        reps           INTEGER NOT NULL DEFAULT 0,
        lapses         INTEGER NOT NULL DEFAULT 0,
        state          INTEGER NOT NULL DEFAULT 0,
        scheduled_days REAL NOT NULL DEFAULT 0,
        elapsed_days   REAL NOT NULL DEFAULT 0,
        learning_steps INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (student_id, item_id)
      );

      -- The composer's hottest query: "what is due for me, soonest first".
      CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_state(student_id, due);

      CREATE TABLE IF NOT EXISTS elo_state (
        student_id TEXT NOT NULL REFERENCES students(id),
        skill_id   TEXT NOT NULL,
        ability    REAL NOT NULL DEFAULT 0,
        attempts   INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (student_id, skill_id)
      );

      CREATE TABLE IF NOT EXISTS bkt_state (
        student_id TEXT NOT NULL REFERENCES students(id),
        skill_id   TEXT NOT NULL,
        p_known    REAL NOT NULL,
        attempts   INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (student_id, skill_id)
      );

      -- Per-student FSRS parameters (T-17). Absent until the first
      -- optimisation run, at which point the scheduler stops using defaults.
      CREATE TABLE IF NOT EXISTS fsrs_params (
        student_id       TEXT PRIMARY KEY NOT NULL REFERENCES students(id),
        params_json      TEXT NOT NULL,
        optimised_at     TEXT NOT NULL,
        review_count     INTEGER NOT NULL,
        train_log_loss   REAL,
        baseline_log_loss REAL
      );

      -- Sessions and attempts ------------------------------------------------

      CREATE TABLE IF NOT EXISTS sessions (
        id                 TEXT PRIMARY KEY NOT NULL,
        student_id         TEXT NOT NULL REFERENCES students(id),
        date               TEXT NOT NULL,
        phase              TEXT NOT NULL,
        blocks_json        TEXT NOT NULL,
        started_at         TEXT,
        completed_at       TEXT,
        actual_seconds     INTEGER NOT NULL DEFAULT 0,
        missed_days_before INTEGER NOT NULL DEFAULT 0,
        synced             INTEGER NOT NULL DEFAULT 0,
        UNIQUE (student_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_student_date
        ON sessions(student_id, date);
      CREATE INDEX IF NOT EXISTS idx_sessions_unsynced
        ON sessions(synced) WHERE synced = 0;

      CREATE TABLE IF NOT EXISTS attempts (
        id                    TEXT PRIMARY KEY NOT NULL,
        student_id            TEXT NOT NULL REFERENCES students(id),
        item_id               TEXT NOT NULL REFERENCES items(id),
        session_id            TEXT REFERENCES sessions(id),
        block_kind            TEXT,
        answered_at           TEXT NOT NULL,
        response              TEXT NOT NULL,
        correct               INTEGER NOT NULL,
        response_time_ms      INTEGER NOT NULL,
        grade                 TEXT NOT NULL,
        stability_before      REAL,
        difficulty_before     REAL,
        retrievability_before REAL,
        elapsed_days          REAL NOT NULL DEFAULT 0,
        elo_before            REAL,
        synced                INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_attempts_student_time
        ON attempts(student_id, answered_at);
      CREATE INDEX IF NOT EXISTS idx_attempts_item
        ON attempts(student_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_unsynced
        ON attempts(synced) WHERE synced = 0;
      -- Powers the error-review block (T-08): recent incorrect answers.
      CREATE INDEX IF NOT EXISTS idx_attempts_incorrect
        ON attempts(student_id, correct, answered_at);

      -- Assessment -----------------------------------------------------------

      CREATE TABLE IF NOT EXISTS test_results (
        id                    TEXT PRIMARY KEY NOT NULL,
        student_id            TEXT NOT NULL REFERENCES students(id),
        kind                  TEXT NOT NULL,
        taken_on              TEXT NOT NULL,
        section_scores_json   TEXT NOT NULL,
        domain_scores_json    TEXT NOT NULL,
        total_scaled          INTEGER NOT NULL,
        confidence_half_width INTEGER NOT NULL,
        attempt_ids_json      TEXT NOT NULL,
        synced                INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_test_results_student
        ON test_results(student_id, taken_on);

      -- Parent digests (T-20). Stored so a digest is stable once generated
      -- rather than being recomputed differently on each open.
      CREATE TABLE IF NOT EXISTS weekly_digests (
        id           TEXT PRIMARY KEY NOT NULL,
        student_id   TEXT NOT NULL REFERENCES students(id),
        week_start   TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        synced       INTEGER NOT NULL DEFAULT 0,
        UNIQUE (student_id, week_start)
      );

      -- Key/value for app-level bookkeeping: loaded content version, last
      -- taxonomy freshness check, last sync, last digest run.
      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'mastery_snapshots_and_settings',
    sql: `
      -- Weekly mastery history.
      --
      -- Without this, "movement since last week" has nothing to compare
      -- against: mastery is computed live from current BKT and retrievability,
      -- so yesterday's value is unrecoverable once it changes. The parent's
      -- trend column was structurally always zero. One row per domain per week
      -- is tiny (8 rows/week, ~830 over two years) and makes the trend real.
      CREATE TABLE IF NOT EXISTS mastery_snapshots (
        student_id TEXT NOT NULL REFERENCES students(id),
        week_start TEXT NOT NULL,
        domain     TEXT NOT NULL,
        mastery    REAL NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (student_id, week_start, domain)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_student_week
        ON mastery_snapshots(student_id, week_start);

      -- Per-student settings that are not learning data: reminder time,
      -- observed pacing. Kept out of app_meta so they are scoped per student.
      CREATE TABLE IF NOT EXISTS student_settings (
        student_id TEXT PRIMARY KEY NOT NULL REFERENCES students(id),
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0
);

/**
 * Minimal surface we need from an expo-sqlite database, so the migration runner
 * can be unit-tested against a fake without importing React Native.
 */
export interface MigratableDb {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
}

/**
 * Apply any migrations newer than the database's `user_version`.
 *
 * Each migration runs inside its own transaction together with the version
 * bump, so an interrupted upgrade can't leave a half-applied schema behind.
 */
export async function migrate(db: MigratableDb): Promise<number> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.execAsync(
      `BEGIN;
       ${migration.sql}
       PRAGMA user_version = ${migration.version};
       COMMIT;`
    );
  }

  return LATEST_SCHEMA_VERSION;
}
