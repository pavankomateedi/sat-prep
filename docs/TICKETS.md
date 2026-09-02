# Ticket status

Live status of the backlog in `docs/PRD.md` Part 3, plus everything built beyond it.

The PRD is a historical record of what was planned. This file records what exists, where it
lives, and where the build knowingly departs from the plan.

Last updated: 2 September 2026 · 258 tests passing · 274 questions in the bank

---

## MVP + V1 backlog (T-01 → T-21)

All twenty-one tickets are implemented.

| ID | Title | Epic | Status | Implementation |
| --- | --- | --- | --- | --- |
| T-01 | Skill-tag taxonomy | E2 | done | `src/domain/taxonomy.ts` |
| T-02 | R&W item set | E2 | **partial** | `content/items/rw-*.json` — see Content below |
| T-03 | Math item set | E2 | **partial** | `content/items/math-*.json` — see Content below |
| T-04 | Item/Passage/SkillTag data model | E2 | done | `src/domain/types.ts`, `src/data/migrations.ts` |
| T-05 | FSRS-6 scheduling | E3 | done | `src/scheduling/fsrs.ts` |
| T-06 | 4-block session composer | E1 | done | `src/session/composer.ts` |
| T-07 | Session runner UI | E1 | done | `app/session.tsx`, `src/ui/MathText.tsx` |
| T-08 | Error-review block | E1 | done | `src/session/composer.ts`, `src/data/repositories.ts` |
| T-09 | Offline-first storage + sync | E6 | done | `src/data/db.ts`, `src/data/sync.ts` |
| T-10 | Single-family auth | E6 | done | `src/auth/auth.ts`, `supabase/migrations/0001_init.sql` |
| T-11 | Diagnostic assessment | E4 | done | `src/assessment/`, `app/assessment.tsx` |
| T-12 | Parent weekly summary | E5 | done | `src/parent/summary.ts`, `app/parent.tsx` |
| T-13 | Data-minimisation gate | E7 | done | `src/privacy/policy.ts` |
| T-14 | Phase A–D minute budgets | E1 | done | `src/domain/phases.ts` |
| T-15 | Elo ability tracker | E3 | done | `src/scheduling/elo.ts` |
| T-16 | BKT mastery display | E3 | done | `src/scheduling/bkt.ts` |
| T-17 | Per-student FSRS optimisation | E3 | done | `src/scheduling/optimizer.ts` |
| T-18 | Full-length timed test mode | E4 | done | `src/assessment/testBuilder.ts` |
| T-19 | Missed-day replanning | E1 | done | `src/session/composer.ts` |
| T-20 | Automated parent digest | E5 | done | `src/parent/summary.ts` |
| T-21 | Content-source attribution | E2 | done | `src/content/schema.ts`, `app/attributions.tsx` |

---

## Built beyond the PRD

### Gaps the PRD flagged in §4.1 as never ticketed

| What | Why it mattered | Where |
| --- | --- | --- |
| Content-freshness process | §1.4 said to re-verify the test spec; nothing made it happen | `src/content/freshness.ts` |
| Score confidence bands | §2.6 forbade a bare point estimate but nothing implemented the range | `src/assessment/scoring.ts` |
| Item-bank sizing model | Nobody had calculated how many questions two years needs | `src/content/sizing.ts` |
| National percentile context | The trend line had no external anchor | `src/assessment/percentiles.ts` |
| Test-day & registration logistics | A real part of the family's job to be done | `src/notifications/schedule.ts`, `app/testday.tsx` |
| Conversational tutor | Competitors lead with it; optional and off by default | `src/tutor/tutor.ts` |

### Bluebook test-taking parity

The PRD non-goaled this in §2.1 ("not attempting item-level Bluebook simulation fidelity").
**Reversed deliberately**: that was right for daily practice and wrong for full-length tests,
where the interface *is* the thing being rehearsed.

| What | Where |
| --- | --- |
| Answer eliminator, mark for review, question navigator, review screen | `src/assessment/moduleState.ts`, `src/ui/TestTools.tsx` |
| Formula reference sheet, plus what it does *not* provide | `src/domain/referenceSheet.ts` |
| Passage highlighting | `src/ui/TestTools.tsx` |
| Calculator — Desmos online, built-in grapher offline | `src/calculator/expression.ts`, `src/ui/Calculator.tsx` |
| Timer with hide toggle | `app/assessment.tsx` |

### Analytics and practice

| What | Where |
| --- | --- |
| Pacing vs the seconds the real test allows | `src/analytics/pacing.ts` |
| Accuracy by difficulty and item type, weak-skill recommendations | `src/analytics/pacing.ts` |
| Timed drills by skill | `src/session/drills.ts`, `app/drills.tsx` |
| Weekly mastery snapshots (makes parent trends real) | `src/data/migrations.ts` v2 |
| Per-student minute-budget tuning (V2 from §2.8) | `src/domain/budgetTuning.ts` |

### Deliberate departures from the PRD

| PRD says | Build does | Why |
| --- | --- | --- |
| §2.1 no Bluebook fidelity | Full test-tool parity | Correct for daily practice, wrong for timed tests |
| §2.8 no push notifications | One silent daily reminder | Over two years, one quiet cue is the highest-leverage adherence tool. Constrained by §2.6: one a day, no streak language, cleared once practised |
| §2.5 KaTeX for math | Native renderer | KaTeX needs a WebView per expression — slow in lists, breaks offline, unreadable by screen readers. The bank uses 15 LaTeX commands; a test keeps it inside that subset |
| Header "2026–2028" vs "spring 11th grade" | Spring 2028 | The two statements are ~9 months apart. Resolved in favour of the stated window |
| §1.2 / T-18: practice tests enforce real section/module timing | +5 min per module (`PRACTICE_TIME_BUFFER_MINUTES` in `src/assessment/testBuilder.ts`) | These are practice tests for a student still learning the material, not the proctored exam — the clock shouldn't punish him before the skill is there. Pacing analytics (`src/analytics/pacing.ts`) still reads the real, unbuffered `section.minutes`, so the "how do you pace against the actual test" signal stays honest even while the practice clock is generous |

---

## Open

### Blocking the goal

**Content.** T-02 and T-03 are marked partial for a reason.

| | Questions | Runway |
| --- | --- | --- |
| Now | 274 | ~49 days |
| 6 months | ~1,000 | 180 days |
| Full 2 years | ~3,838 | 730 days |

Every skill clears the launch bar (6+ items, 2+ difficulties), so the app works — but it runs
out of *new* material in about seven weeks. The generator (`scripts/generate-items.ts`) exists
and has never been run; it needs `ANTHROPIC_API_KEY`. Roughly \$15–30 for six months of content.

This is the only item standing between a working app and a two-year course.

### Decisions made

- **Test attempts are now persisted** (`recordTestAttempt` in `src/session/service.ts`, called
  from `app/assessment.tsx`'s `score()`). Decided in favour, per PRD §2.4's own framing of a
  checkpoint as "valuable for recalibrating the daily mix" — and `testBuilder.ts` already
  prefers items unseen in daily practice, so this is mostly fresh signal, not double-counted.
  Feeds the same FSRS/Elo/BKT models and the error-review queue a daily-session answer would.
  `sessionId`/`blockKind` are null, per the `Attempt` schema's own documented case for this.
- **Per-question timing in tests is now persisted** alongside the attempt (`responseTimeMs`,
  sourced from `moduleState.ts`'s existing `timeSpentMs` tracking, previously computed and
  thrown away). Now reaches `src/analytics/pacing.ts`, the one place pacing matters most.

### Awaiting the real world

- **All five PSAT/SAT dates are estimates** (`src/domain/program.ts`, flagged `estimated: true`
  and labelled as such in the UI). College Board publishes ~18 months ahead.
- **Taxonomy re-verification** due ~28 November 2026. Settings raises it.

### Never validated

- **No student has completed a session.** Every claim rests on 254 tests and clean builds.
  The PRD's own riskiest assumption — will a fixed 4-block structure hold a teenager for two
  years — is answerable only by him using it for a fortnight.
- **Not installed on a phone.** The daily habit needs the app on the device with the reminder on.

---

## Structurally out of scope

From PRD §4.2, and unchanged: no human tutor, no officially licensed College Board digital
items, no score guarantee. No amount of building closes these.
