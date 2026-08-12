# Content: the bank, its licensing, and how much more is needed

## The honest headline

**The item bank is the binding constraint on this programme, and it is not close to done.**

| | |
|---|---|
| Items today | 271 |
| Two-year requirement (modelled) | ~3,838 |
| Runway of the current bank | ~49 days of genuinely new material |

Every one of the 30 skills clears the launch bar of 6+ items across 2+ difficulty labels, so the
app works today and the student can start immediately. But PRD §4.1 was right to call out the
missing sizing model, and now that it exists the answer is uncomfortable: the bank needs to grow
by roughly an order of magnitude. Treat content authoring as an ongoing weekly activity, not a
V2 milestone.

## Growing the bank

```bash
export ANTHROPIC_API_KEY=sk-ant-...

npm run content:generate                             # gap report, no API calls
npm run content:generate -- --plan --count 30        # fill the three biggest gaps
npm run content:generate -- --skill circles --count 20
npm run content:generate -- --skill boundaries --difficulty hard --count 15
npm run content:generate -- --skill transitions --dry-run   # inspect the prompt only
```

Generated items land in `content/review/`, **never** straight into the bank. Read them, delete
anything wrong, then:

```bash
npm run content:promote -- --check   # report what would happen
npm run content:promote              # move into content/generated/
npm test                             # re-validate the whole bank
```

Rough cost at current prices: on the order of \$40–120 to generate the remaining ~3,600 items.

### Why review is not optional

The validator proves an item is *well-formed*. It cannot prove the question is *right*. While
hand-authoring the second tranche I produced two defects the schema happily accepted: a
full-width Unicode digit inside a stem, and a system-of-equations item whose stated answer did
not match its own working. Both would have shipped. A wrong answer key is the worst defect this
app can have — it teaches the wrong thing and corrupts the scheduling model at the same time.

So read every generated item. In particular, re-solve every Math item. The generator prompt
(`scripts/itemPrompt.ts`) tells the model to solve each problem twice; that reduces the rate, it
does not eliminate it.

When review turns up a *recurring* flaw, fix `scripts/itemPrompt.ts` rather than the individual
items. That file is the item-writing style guide, and editing it is what makes the next batch
better.

## The sizing model

`src/content/sizing.ts`, with the numbers pinned by tests so this document cannot drift.

```
730 days × 80% adherence                   = 584 sessions
30 minutes ÷ 80 seconds per item           = 23 items per session
584 × 23                                   = 13,432 item exposures
```

Spaced repetition means those exposures are mostly repeats, so the bank does not need 13,432
items. Two constraints compete:

- **Repeat budget** — at ~7 reviews per item over two years, 13,432 ÷ 7 ≈ 1,919 items.
- **New-item rate** — about 30% of daily items are new material, so ~4,030 distinct items get
  introduced across the programme.

The new-item rate binds harder, giving a target near **3,838 items**. Allocation is weighted by
each skill's share of the real test, so Algebra sub-skills need deeper coverage than Circles.

`coverageGaps()` reports the shortfall per skill, sorted worst-first, so authoring effort goes
where the test actually weights it.

## Licensing rules

From PRD Part 1 §2. These are enforced by `src/content/schema.ts`, not just documented.

| Kind | Permitted use | Enforced requirement |
|---|---|---|
| `original` | Written for this app | — |
| `public_domain` | Out-of-copyright source text | Must name the work |
| `cc_by_4_0` | Adapted from openly licensed curricula | Title, URL, displayable credit line, **and** a note of what was changed |
| `official_as_delivered` | Official practice PDFs, used in original form | **Rejected on bank items.** Legal on a test record, never on an authored item |

That last row is the one worth understanding. College Board practice material may be used "as
delivered" — re-typesetting it into this question bank is exactly what the rule forbids, so the
validator fails the build if an item claims that provenance.

Explicitly never used: Bluebook application content, undocumented Question Bank endpoints, any
paid course material, and state assessment items whose licensing could not be verified
individually.

Attribution is displayed in-app on the Content Sources screen, generated from each item's own
provenance record — CC BY requires attribution wherever material is redistributed, and a database
column no user can see does not satisfy that.

## Authoring an item

Add to the relevant file in `content/items/`, then run `npm test`. The validator checks:

- Primary skill's domain matches the item's declared domain (a mismatch would silently corrupt
  both the Elo update and domain balancing)
- MCQ items have exactly four choices with unique text, and the answer is one of them
- SPR items are Math-only, with an array of accepted equivalent forms
- Reading & Writing items carry a stimulus or a passage — never neither, never both
- Cross-text-connections items have two texts
- `$…$` math delimiters are balanced, and every LaTeX command is inside the renderer's subset
- Licensing provenance is complete for its kind
- No near-duplicate questions, keyed on stimulus + stem

A separate test answers every SPR item with its own key, which catches an unparseable answer key
that would otherwise mark the student wrong forever.

### Difficulty labels are load-bearing

`easy` / `medium` / `hard` are not decoration. They are the frozen input to the Elo model
(`DIFFICULTY_LOGIT`), because item difficulty cannot be calibrated from one student's data.
A mislabelled item corrupts the ability estimate for its whole skill. Label by how a
mid-preparation student would find it, not by how it reads to an adult.

### Estimated seconds are load-bearing too

The composer budgets blocks in minutes and fills them using `estimatedSeconds`. Systematically
underestimating makes every session run long, which quietly breaks the thirty-minute promise the
entire design rests on. R&W items average ~71s on the real test, Math ~95s.

## Content freshness

PRD §1.4 warns that domain weights and test specifics should be re-verified against College Board
periodically, and §4.1 notes that nothing in the backlog made that happen.

`src/content/freshness.ts` turns it into a scheduled obligation the app raises itself, on two
triggers: a routine 120-day interval, and the run-up to a real administration — when a stale
weighting would do the most damage. Settings shows the status and the checklist of what to
verify. After checking, bump `TAXONOMY_VERIFIED_ON` in `src/domain/taxonomy.ts`.

It is a reminder, not a scraper. The check is a human reading the current specification; the
app's job is to make sure that never quietly lapses.
