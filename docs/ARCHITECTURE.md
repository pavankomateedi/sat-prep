# Architecture

## The engine/UI split

Everything under `src/` except `src/ui/` is plain TypeScript with no React Native imports. The
scheduler, composer, scoring, and privacy gate are pure functions over plain data.

This is not tidiness for its own sake. The learning model is the part of this app most likely to
be wrong and hardest to eyeball — FSRS state transitions, Elo convergence, phase thresholds,
interleaving rules. Keeping it free of RN imports means it runs under Vitest in Node in about a
second, so all 148 tests execute on every change instead of requiring a simulator.

`src/session/service.ts` is the seam. It is the only module that both touches the database and
drives the models, and it is what the screens call.

## Local-first, not offline-tolerant

PRD §2.5 makes offline a hard requirement: "a session that fails offline breaks the entire
habit-engine premise." So SQLite on the device is the **source of truth**, not a cache.

```
answer a question
      │
      ▼
  SQLite write ──────────────► always succeeds, no network involved
      │
      ▼
  synced = 0
      │
      ▼
  sync worker ───────────────► Supabase, whenever a network happens to exist
```

Every write lands locally and is marked unsynced. `syncNow()` pushes batches and flips the flag
only after the server confirms. A crash mid-sync re-uploads rather than dropping data, since
every upload is an id-keyed upsert.

Nothing in the answer path awaits the network. A sync failure is reported in Settings, never in
the middle of a session.

## The three-model stack

Each model exists because the other two cannot do its job at n=1.

| Model | Answers | Why the others can't |
|---|---|---|
| FSRS-6 | *When* should this item come back? | Needs only one student's own review log — the one thing this app has plenty of. |
| Elo | *Which* item, at what difficulty? | IRT needs 100–200 students to calibrate item difficulty. So difficulty is authored and frozen, and only ability moves. |
| BKT | *How mastered* is this skill? | Fitting BKT to one learner hits identifiability and degeneracy problems, so parameters are fixed rather than fitted. |

The models are layered, not merged. FSRS drives scheduling. Elo drives selection. BKT drives
only the display — and it is multiplied by FSRS retrievability, so mastery decays when a skill
goes untouched instead of ratcheting upward forever.

### The optimiser (T-17)

`src/scheduling/optimizer.ts` re-fits FSRS weights after ~100 reviews. Three guards, all because
overfitting is the default outcome with one student:

1. A **chronological hold-out** — never random, because reviews of the same item are correlated
   and later reviews depend on earlier scheduling decisions.
2. **Regularisation toward the published defaults**, fading as history accumulates.
3. **Adoption only on a hold-out win.** If the fit doesn't beat the defaults on data it never
   saw, it is discarded. A failed run is a normal outcome.

The forward model is `ts-fsrs` itself, replayed. That guarantees the optimiser scores the exact
scheduler the app runs, rather than a hand-rolled copy that could drift.

## Privacy as structure, not policy

PRD §2.7 concludes neither COPPA nor FERPA legally applies, then imposes their discipline anyway.
That promise is enforced in three independent layers:

1. **Schema** — there is no column for a legal name, address, phone, or location. The data cannot
   be stored because there is nowhere to put it.
2. **Runtime gate** — `assertClean()` runs on every outbound payload, checking both field names
   and value shapes (an email hiding in `displayName` is caught).
3. **RLS** — the parent role has *no policy at all* on `attempts`. A parent session returns zero
   rows, regardless of what any client requests.

The parent surface is built from `WeeklySummary` and screened before it can be stored, so
item-level data cannot reach it even by mistake.

## Math rendering

PRD §2.5 suggests KaTeX, which in React Native means a WebView per expression — one instance per
math item in a scrolling session, a bundled KaTeX asset, and text no screen reader can read.

The bank uses a closed set of 15 LaTeX commands. `src/ui/mathParser.ts` parses that subset and
`MathText.tsx` renders it as native `Text` and `View` nodes: no WebView, genuinely offline, fast
in a list, and accessible. A test asserts the whole bank stays inside the subset, so an author
cannot silently introduce a command that would render as garbage.

## Determinism

The composer and test builder take a seed and use a small explicit PRNG. A given day composes
identically on a retry, so closing the app mid-session does not reshuffle the questions. Tests
rely on the same property.

## What runs where

| Concern | Location | Notes |
|---|---|---|
| Content bank | Bundled JSON → SQLite | Loaded once per `CONTENT_VERSION`; upserts preserve review history across content edits. |
| Session state | SQLite | One row per day, unique on `(student_id, date)`. |
| FSRS/Elo/BKT state | SQLite | Recomputed nowhere; always read from disk. |
| Optimiser | On device, off the critical path | Runs after a session completes. |
| Digests | Generated on the student's device, read by the parent | The only table with a parent read policy. |
