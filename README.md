# SAT Prep

A private, single-family Digital SAT prep app. One student, thirty minutes a day, for about
two years. Built from the research and product plan in the parent directory, covering the full
MVP and V1 backlog (T-01 through T-21).

## Quick start

```bash
npm install
npm test          # 183 tests across the engine layer
npm run typecheck # strict TypeScript, zero errors
npm start         # Metro; scan the QR code with Expo Go on the iPhone
```

## Does it need an API key?

**No.** The app is fully functional with no keys, no accounts, and no network. Every daily
session, practice test, drill, score and chart works offline, because the item bank is compiled
into the app and every model — scheduling, ability, mastery — runs on the device.

Keys only ever unlock *optional extras*, and each one is off until you add it:

| | Needs a key? | What happens without it |
| --- | --- | --- |
| Daily sessions, drills, practice tests | no | — |
| Scoring, mastery, pacing analytics | no | — |
| Calculator | no | Uses the built-in grapher instead of Desmos |
| Reference sheet, flags, eliminator, highlighting | no | — |
| Cloud backup, parent's own device | Supabase (free) | Everything stays on the phone |
| "Explain this differently" tutor | Anthropic | The button never appears |
| Generating new questions | Anthropic | You author them by hand |

The last row is the one that matters day to day, and it is worth being precise about: the
generator is a **script you run on your computer** to write new questions into the repo. It is
not part of the app and never runs on the phone. Once questions are in the bank they are
compiled in like all the others.

So: the student can use this for two years having never entered a key. What a key buys you is
a faster way to grow the question bank, and an optional second explanation when an answer does
not land.

Supabase is likewise optional and adds only backup and the parent's own login — see
`docs/SETUP.md`.

## What it does

Open it, and today's thirty minutes are already built: warm-up review, a new skill, mixed
practice, and a second attempt at things you got wrong. The mix shifts across four phases as
the test approaches. Miss a week and it quietly absorbs the backlog rather than presenting a
wall of overdue cards.

- **Scheduling** — FSRS-6, which beats SM-2 by roughly 3× on calibration and needs only this
  one student's history, not a cohort.
- **Item selection** — Elo ability tracking against *authored* difficulty, because calibrating
  difficulty properly needs 100–200 students and this app has one.
- **Mastery display** — fixed-parameter BKT decayed by FSRS retrievability, so a skill untouched
  since October reads honestly instead of staying frozen at 95%.
- **Assessment** — diagnostics and full-length tests that reproduce the real two-stage
  module-adaptive routing, scored as a range and never as a bare number.
- **Parent view** — adherence and domain trend, with item-level data structurally unreachable.

## Layout

```
app/            expo-router screens
src/
  domain/       taxonomy (T-01), entity types (T-04), phase budgets (T-14)
  scheduling/   FSRS-6 (T-05), Elo (T-15), BKT (T-16), optimiser (T-17)
  session/      composer (T-06/T-08/T-19), answer checking, service layer
  assessment/   scoring + confidence bands (T-11), test assembly (T-18)
  parent/       weekly summary (T-12), digest scheduling (T-20)
  privacy/      data-minimisation gate (T-13)
  content/      schema + licence validation (T-21), sizing, freshness
  data/         SQLite migrations, repositories, offline sync (T-09)
  ui/           theme, math renderer, shared components
content/items/  the item bank, as versioned JSON
supabase/       Postgres schema and RLS policies
docs/           architecture, content pipeline, setup
```

`src/` is deliberately free of React Native imports below `ui/`, so the entire learning engine
runs and is tested in plain Node.

## Ticket coverage

| Epic | Tickets | Status |
|---|---|---|
| E1 Session engine | T-06, T-07, T-08, T-14, T-19 | done |
| E2 Content & item bank | T-01, T-02, T-03, T-04, T-21 | done |
| E3 Scheduling & mastery | T-05, T-15, T-16, T-17 | done |
| E4 Assessment | T-11, T-18 | done |
| E5 Parent viewer | T-12, T-20 | done |
| E6 Platform & offline | T-09, T-10 | done |
| E7 Privacy | T-13 | done |

Three gaps the PRD itself flagged in §4.1 as *not on the roadmap anywhere* are also closed:
the content-freshness process (`src/content/freshness.ts`), the score-confidence band
(`src/assessment/scoring.ts`), and the item-bank sizing model (`src/content/sizing.ts`).

## Known limits

- **The item bank is a seed, not a supply.** 271 items covers every skill at the launch bar but
  amounts to roughly 49 days of genuinely new material. The sizing model puts the two-year
  requirement near 3,800 items. This is the binding constraint on the programme — run
  `npm run content:generate` to close it; see `docs/CONTENT.md`.
- **The tutor is the one online feature.** Everything else works with no network. The tutor needs
  an API key and costs money per message; the daily session is unaffected whether it is on, off,
  or failing.
- **2028 test dates are estimates.** College Board publishes administrations about 18 months
  ahead, so everything in `src/domain/program.ts` is flagged `estimated: true` until confirmed.
- **Scores are approximations.** College Board publishes no conversion tables, so the scale here
  is a documented approximation whose value is the trend, not the number.
- **Minute budgets are a starting design.** No study specifies minute-level allocations for a
  30-minute daily session; the Phase A–D table is reasoned inference meant to be tuned against
  this student's own data.
