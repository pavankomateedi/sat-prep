# SAT Prep: Research Report, Product Plan & Ticket Backlog

> **Source document, committed for reference.** This is the research report and product plan the
> app was built from, reproduced as delivered on 31 July 2026. The only edit is the title, which
> carried a personal name.
>
> It is a **historical record, not a live spec.** Where the build knowingly departs from it —
> Bluebook test-tool fidelity (§2.1), push notifications (§2.8) — see `docs/TICKETS.md`, which
> tracks what was actually built and why.

*Prepared for a single-user, long-horizon (2026–2028) Digital SAT prep app. Target user: one student entering 9th grade in Fall 2026, aiming for the spring 11th-grade SAT, with PSAT 8/9 and PSAT/NMSQT as interim checkpoints. Core design constraint: one 30-minute session per day, every day, cycling through all Digital SAT domains over roughly two years.*

This document distinguishes **verified fact** (sourced and linked), **reasoned inference** (a defensible interpretation of verified facts), and **assumption** (a design choice made in the absence of direct evidence). Where current Digital SAT specifics are genuinely uncertain or subject to change, that uncertainty is flagged explicitly rather than papered over.

---

# Part 1 — Research Report

## 1. Digital SAT (Bluebook) Format, Scoring & Taxonomy (as of 2026)

### 1.1 Section structure and timing

The Digital SAT is delivered on College Board's Bluebook application and consists of two sections — Reading and Writing, then Math — each split into two modules, for four modules total ([College Board Digital SAT Suite Technical Manual](https://research.collegeboard.org/media/pdf/Digital%20SAT%20Suite%20of%20Assessments%20Technical%20Manual-FINAL.pdf)). This is **verified fact**.

| Section | Modules | Questions administered | Operational (scored) items | Time |
|---|---|---|---|---|
| Reading & Writing | 2 | 54 (27 per module) | fewer than 54 (some are unscored pretest/field-test items embedded per module) | 64 minutes |
| Math | 2 | 44 (22 per module) | fewer than 44, same pretest mechanism | 70 minutes |
| **Total** | 4 | 98 | 90 operational | 134 minutes |

Sources: [College Board Digital SAT Suite Technical Manual](https://research.collegeboard.org/media/pdf/Digital%20SAT%20Suite%20of%20Assessments%20Technical%20Manual-FINAL.pdf).

There is no penalty for guessing — students should answer every question ([College Board SAT Suite documentation](https://satsuite.collegeboard.org/digital/what-to-expect)). The full test scale runs 400–1600 composite, with each section scored 200–800 in 10-point increments.

### 1.2 The two-stage module-adaptive model

The Digital SAT is **module-adaptive, not item-adaptive**: adaptivity operates at the level of the second module within each section, not question-by-question within a module. This is a common misconception worth flagging explicitly, since most competitors' marketing (and casual descriptions of "adaptive SAT") imply item-level adaptivity that does not exist here.

Mechanically, per section: every student sees the same first module (module 1), which is a fixed, moderate-difficulty routing module. Based on module-1 performance, College Board's multistage testing (MST) engine routes the student to one of two second-module forms — a harder or an easier module 2 — calibrated via Item Response Theory (IRT) so that scores from different module-2 paths are placed on the same underlying scale ([College Board Digital SAT Suite Technical Manual](https://research.collegeboard.org/media/pdf/Digital%20SAT%20Suite%20of%20Assessments%20Technical%20Manual-FINAL.pdf)). This is **verified fact**. There is no re-routing within a module and no question-by-question difficulty adjustment.

Practical implication for a prep app: a student's practice-item difficulty exposure should mirror this "module, then branch" structure rather than simulating fine-grained per-question adaptivity, if the goal is to build accurate intuition for how the real test behaves.

### 1.3 Question types and domain taxonomy

**Reading & Writing** — four domains, tested across both R&W modules, with approximate weight ranges:

| Domain | Approx. weight | What it covers |
|---|---|---|
| Craft and Structure | ~28% | Words in context, text structure/purpose, cross-text connections |
| Information and Ideas | ~26% | Central ideas/details, inferences, command of evidence (textual and quantitative) |
| Standard English Conventions | ~26% | Boundaries (sentence structure, punctuation), form/structure/sense (agreement, usage) |
| Expression of Ideas | ~20% | Rhetorical synthesis, transitions |

**Math** — four domains, tested across both Math modules, with approximate weight ranges:

| Domain | Approx. weight | What it covers |
|---|---|---|
| Algebra | ~35% | Linear equations/inequalities/systems (1 and 2 variables), linear functions |
| Advanced Math | ~35% | Nonlinear equations/functions, systems with nonlinear equations, nonlinear function behavior |
| Problem-Solving and Data Analysis | ~15% | Ratios/rates/proportions/percentages, one/two-variable data, probability, statistical inference |
| Geometry and Trigonometry | ~15% | Area/volume, lines/angles/triangles, right triangles/trig, circles |

Weights and full skill-level breakdowns are published in College Board's official domain documentation. This taxonomy is the correct backbone for the app's skill-tagging schema (see Part 2, §2.5). Every R&W question includes an on-screen passage or paired passages; Math allows an embedded Desmos graphing calculator on all questions.

### 1.4 What has changed recently — flag explicitly

The Digital SAT (Bluebook, adaptive, shorter, calculator-allowed throughout) fully replaced the paper SAT for all College Board–administered SAT and PSAT tests starting with the 2023–2024 school year, and this is now the stable format. **As of this research, no structural change to the module count, timing, or section order is confirmed for the 2026–2028 window** — but College Board periodically revises specific skill weightings and released-item libraries, and policy specifics (e.g., which practice tests are current, Question Bank contents) should be re-checked against [satsuite.collegeboard.org](https://satsuite.collegeboard.org/) close to build time and again before each PSAT/SAT administration the student sits. This is a genuine **known-unknown**: treat any weight or timing figure in this report as "current as researched, subject to verification at build time."

---

## 2. Legitimate, Licensable Content Sources

The app must be built entirely on content that is either owned, openly licensed, or explicitly permitted for the intended (non-commercial, single-user, personal) use. No source in this plan requires bypassing a login wall, scraping paid content, or extracting Bluebook's proctored exam content.

| Source | Coverage | License / terms | API / export | Gaps |
|---|---|---|---|---|
| College Board official paper practice tests (8 full-length PDF bundles) | Full-length, official, answer-keyed | Free PDF download; personal/non-commercial practice use permitted | No API; manual PDF | Fixed set (8 tests); no granular skill tagging out of the box; images/typesetting need re-extraction work |
| College Board Educator/Question Bank (public-facing question bank) | Large released item bank across all domains, filterable by domain/skill | Publicly viewable, no login required for basic access; PDF export supported | No documented public API | Question Bank's underlying JSON endpoints are undocumented and explicitly excluded from this plan — using them programmatically without permission risks ToS violation |
| Khan Academy's official SAT partnership content | Full R&W + Math coverage, video lessons + practice, linked from College Board | Free to a human user via khanacademy.org; content itself is Khan Academy's own copyrighted material | No public export API suitable for redistribution inside a third-party app | Cannot legally re-host or bulk-ingest Khan's items into this app; can link out to Khan Academy for supplementary lessons |
| CC BY 4.0 openly licensed math curricula (e.g., Illustrative Mathematics, Open Up Resources, EngageNY-derived, Utah Math Curriculum-derived) | Algebra I/II, Geometry, some data-analysis content — strong overlap with SAT Math domains | CC BY 4.0 — free to copy, remix, and adapt with attribution, including for a personal or eventually commercial app | Static files (usually docx/PDF/JSON depending on source) — ingestible into the app's own item bank | Not written to mirror SAT question *format* (multiple choice, student-produced response) — items need to be rewritten/reformatted into SAT-style stems, which is legally fine under CC BY but is real authoring work |
| Public-domain text (Project Gutenberg, U.S. government publications, pre-1929 or explicitly public-domain works) | Reading passages for Craft & Structure / Information & Ideas practice | Public domain — no restriction | Bulk download available | Text needs original question-writing; does not by itself supply "questions," only passage material |
| State-released assessment items (use with caution) | Some states release ELA/Math items from their own assessments | Varies by state; **NYSED Regents ELA passages are explicitly third-party copyrighted and are excluded from this plan** | Varies | Licensing is inconsistent state-to-state; each state source needs individual verification before use — do not treat "state-released" as a blanket-safe category |

**Explicitly excluded from this plan** (per the user's rule against scraping paywalled/login-gated content): Bluebook application content extraction of any kind; the undocumented Question Bank JSON/API endpoints; any UWorld, Princeton Review, Khan Academy, or Varsity Tutors paid-tier content; NYSED Regents ELA passages.

**Recommended content strategy** (this is the plan's own synthesis, not a single cited source): build the app's core item bank from (a) CC BY 4.0 math curricula reformatted into SAT-style stems, (b) original passages sourced from public-domain text paired with originally-authored R&W questions written to match the domain taxonomy in §1.3, and (c) College Board's own official paper practice PDFs used "as delivered" (not extracted/reformatted) for periodic full-length practice tests, per §2.5 below. If the family later wants official released digital items inside the app itself, College Board's Copyright and Trademark Permission Request Form is the correct, sanctioned channel to request that — this has not been pursued as part of this research and should be treated as a future option, not a current plan dependency.

---

## 3. Competitive Teardown

Eight products were reviewed: Varsity Tutors/Nerdy, Khan Academy (official SAT partner), UWorld, Princeton Review, Bloom Prep for Bluebook SAT, Acely (by Juni Learning), LearnQ.ai, and R.test.ai. ("Bloom Institute" in the original brief was ambiguous and is resolved here to **Bloom Prep for Bluebook SAT**, an iOS app by EdTechAI Apps LLC — this resolution is noted explicitly since no company literally named "Bloom Institute" offers SAT prep.)

| Product | Session/daily design | Adaptivity | Mastery/progress model | Motivation mechanics | Parent visibility | Pricing |
|---|---|---|---|---|---|---|
| Varsity Tutors/Nerdy | Tutor-led; sessions are hour blocks, not a daily-minutes product | Human-tutor-directed, not algorithmic | Tutor-reported progress notes | Human accountability via tutor relationship | Parent portal with session summaries | $1,104–$2,916 for 12/24/36-hour blocks |
| Khan Academy (official SAT partner) | Self-paced; no enforced daily length | Course-mastery-gated unit progression + some item difficulty adjustment | Unit mastery percentages | Streaks and badges present | Minimal (no dedicated parent view) | Free (Khanmigo AI tutor add-on ~$4/mo) |
| UWorld | Question-bank browsing, self-paced; no fixed session length | Filter-based (by domain/difficulty), not algorithmic sequencing | Raw performance stats, no memory-decay model | None notable | None notable | $299 course / $99 QBank-only |
| Princeton Review | Course-based, scheduled classes or self-paced modules | Course-level branching, not per-item adaptive | Score reports, diagnostic-based | None notable | Course-level parent updates in higher tiers | $299–$3,150 depending on tier |
| Bloom Prep for Bluebook SAT | Daily-practice framed, mobile-first | Some difficulty adjustment; marketing claims "personalized," mechanism undisclosed | Streaks + score trend | Streaks, daily reminders | Not prominent | $19.99/mo, $79.99/2mo, $59.99/yr — note the per-unit price *increases* for the mid-length commitment, an apparent pricing-architecture inversion |
| Acely (Juni Learning) | AI-tutor daily practice framed | AI-driven question selection, mechanism undisclosed | Progress dashboard | Streaks | Some parent visibility (Juni's parent-facing infrastructure) | $49–$149/mo |
| LearnQ.ai | Daily practice + AI tutor framed | AI-driven, undisclosed mechanism | Progress dashboard | Streaks, gamified elements | Limited | $50–$200/mo (tier-dependent) |
| R.test.ai | AI-driven adaptive practice | Claimed adaptive, mechanism undisclosed | Progress dashboard | Present but details unclear | Unclear | Not publicly published |

### What the good ones do that the bad ones don't

1. **Daily minutes as a product input, not an afterthought.** Only the daily-practice-framed apps (Bloom, Acely, LearnQ.ai) treat "how many minutes today" as a first-class design variable; the course/tutor products (Varsity Tutors, Princeton Review, UWorld) are built around hour-blocks or self-paced browsing, which is structurally incompatible with a fixed 30-minute daily habit.
2. **Re-planning on adherence, not just accuracy.** None of the reviewed products clearly re-plans its schedule when the student *misses* days — they mostly assume perfect adherence and only adapt to right/wrong answers. A habit-engine app for one real, imperfectly-consistent teenager needs to explicitly replan around missed days, not just wrong answers.
3. **Honest uncertainty vs. false precision.** Products showing a single "predicted score" number (several of the AI-tutor apps) overstate precision given the small number of items any one student actually answers; better design shows a range or confidence band.
4. **Real adaptivity (misconception- or psychometric-model-driven) vs. a difficulty toggle.** UWorld's "filter by difficulty" is a manual toggle, not adaptivity. The AI-tutor apps claim more but disclose no mechanism, so it is not verifiable — treat their claims skeptically, not as a benchmark to match blindly.
5. **Investment in the mistake-review loop over question-count bragging.** Most marketing pages emphasize total question-bank size ("10,000+ questions!") rather than what happens after a student gets something wrong — the review/error-log loop is under-invested across the category, which is exactly the loop the learning-science evidence (§4) says matters most.
6. **Small daily unit size matched to the promised time commitment.** Bloom and Acely are the closest structural analogs to this app's 30-minute constraint; the tutor/course products are not comparable formats at all.
7. **Streaks are conspicuously present in the free/casual tier (Khan Academy, Bloom) and less emphasized in the higher-priced, more "serious" tiers** — worth noting when designing motivation mechanics (see Part 2, §2.6) so the app doesn't default to streak mechanics that read as juvenile for an 11th grader, or skip them entirely and lose a proven low-cost motivator.
8. **Parent visibility is inconsistent and mostly an afterthought** even in paid products — none of the reviewed apps builds a genuinely good parent-viewer experience; this is a clear differentiation opportunity for a single-family app since the "parent" here is the one user paying for and championing the product.
9. **Pricing architecture should reward commitment, not punish it.** Both Bloom and Acely have upfront/monthly pricing where per-unit cost does not monotonically decrease with longer commitment — a structural pricing mistake irrelevant to a personal-use app, but worth avoiding if this app is ever offered to others.

---

## 4. Evidence Base: What Learning Science Actually Says

This section covers four practices commonly proposed for SAT prep in the 14–17 age range, rated by strength of evidence — from peer-reviewed sources, not blog posts.

### 4.1 Retrieval practice — **STRONG evidence**

Three independent meta-analyses converge on retrieval practice (testing oneself on material, rather than passively re-reading it) producing a moderate-to-large effect on retention, with effect sizes clustering around g ≈ 0.50–0.61 across the literature. Effects are, if anything, *larger* in secondary-school-age populations than in adults in some analyses (one meta-analysis found g = 0.83 specifically in secondary-school samples). This is the single best-supported technique in the entire learning-science literature for this age group and should be the backbone of the app's daily design (see Part 2, §2.2).

### 4.2 Spaced repetition — **STRONG evidence for the underlying principle; specific optimal-interval numbers are more contested**

The foundational finding — spacing study sessions apart beats cramming the same material together, for long-term retention — is one of the most replicated results in cognitive psychology. Cepeda et al.'s influential 2008 meta-analysis mapped out a "ridgeline" relationship between the gap between study sessions and the interval until the material needs to be retained: the *optimal absolute gap* between reviews grows as the desired retention interval grows, but that optimal gap shrinks *as a percentage* of the retention interval. Practically: this justifies an algorithmic (not fixed-interval) spacing scheduler — see the FSRS recommendation in Part 2, §2.3 — rather than a naive fixed "review every 3 days" rule.

### 4.3 Interleaving vs. blocked practice — **STRONG evidence for SAT Math; weak/negative evidence for vocabulary-style R&W material**

Interleaving (mixing problem types within a practice session, rather than blocking all of one type together) shows a real, moderate positive effect for mathematics-style problem-solving — g ≈ 0.34 in relevant meta-analytic evidence — which maps well onto SAT Math's Algebra/Advanced Math/Problem-Solving/Geometry domains. Critically, the evidence for interleaving is *not* uniformly positive: for vocabulary- and word-list-style learning, at least one line of evidence found a **negative** effect of interleaving (g ≈ −0.39), meaning blocked practice was actually better for that specific material type. This has a direct, non-obvious design implication: the app should interleave Math domains within a session, but should **not** blindly interleave R&W vocabulary-in-context items the same way — those may benefit from more blocked practice in early skill-building, with interleaving introduced later for mixed-review sessions.

### 4.4 Error-log / mistake-review loops — **WEAK evidence base; no dedicated meta-analysis exists**

There is no meta-analysis directly testing "keeping an error log and reviewing it" as a discrete technique — the widespread advice to maintain one is a reasonable extrapolation from retrieval practice and spacing (a mistake, revisited later and re-attempted, is itself an act of spaced retrieval practice) rather than a separately validated intervention. This report treats the error-review loop as **justified as a delivery vehicle for the three validated techniques above**, not as a fourth independently-proven technique in its own right. This is an important honesty flag: don't oversell the error log's evidentiary basis in user-facing product copy.

### 4.5 Realistic score-gain expectations and diminishing returns

Two figures are commonly cited for SAT score gains from practice, and they should not be treated as equally credible:

- The often-repeated **"115 points" Khan Academy figure** is an **uncontrolled, correlational** before/after delta among self-selected students who used Khan Academy's SAT tools for 20+ hours — it is not a controlled estimate and likely overstates true causal gain (selection effects: motivated, higher-baseline-effort students both practice more *and* improve more, independent of the practice itself).
- A better-controlled estimate, from Weatherholtz et al. (2020), found gains in the range of **21–39 points per 6–8 hours of practice** — this is the more defensible baseline figure and is the one this plan uses in all score-gain framing (see Part 2, §2.2 messaging guidance).
- Diminishing returns are real and can be approximated with a fitted quadratic model, gain(h) ≈ 3.94h − 0.06h², which plateaus around a ~65-point total gain near 33 hours of cumulative practice in the data that produced the fit. **This model is right-censored at roughly 30 hours of observed practice and cannot be responsibly extrapolated out to the 300+ cumulative hours this app's 2-year, 30-min/day design implies** — meaning nobody has actually measured whether gains keep accruing, plateau earlier, or plateau later at that scale. This is a genuine evidence gap, not a solved question.
- Separately, Chang et al. (2025) found that taking full-length practice tests carries its own gain, independent of item-level practice: roughly 25.7 points after 1 full-length test, 45.5 after 2, and 61.4 after 3+, with larger effects for lower-scoring students. This directly supports the periodic full-length assessment strategy in Part 2, §2.4.

**Two-year stratified expectation** (this app's own extrapolation, clearly labeled as **inference, not direct evidence**, since no study has run a 2-year, 300+ hour intervention of this kind): students starting from a lower baseline score band should reasonably expect materially larger point gains than students already near the top of the scale, consistent with the general "larger gains for lower starting scores" pattern that shows up in both the item-practice and full-length-test literatures above. A single point estimate for a specific 2-year gain (e.g., "expect +150 points") would overstate the precision this evidence actually supports and is deliberately not given here — the honest, evidence-consistent message for parent-facing copy is: *meaningful, above-baseline gains are well supported for the first 6–8-hour blocks of good practice; extrapolating that same rate linearly across 300+ hours is not something the research has actually tested,* and the app's own score-tracking data on this one student will, over time, become the best evidence available for that student's specific gain curve.

---

# Part 2 — Product & Technical Plan

## 2.1 Product Spec

### Vision
A private, single-family Digital SAT prep app that turns "30 minutes a day, every day, for about two years" into the entire strategy — not a supplementary feature. Depth of coverage and mastery come from consistency and a well-designed daily loop, not from marathon sessions or last-minute cramming.

### User stories — student
- As the student, I want today's 30-minute session pre-built and waiting when I open the app, so I never have to decide what to work on.
- As the student, I want the app to warm me up with something I've seen before, so I don't start cold every day.
- As the student, I want new material introduced in small enough chunks that I don't feel overwhelmed in a 30-minute window.
- As the student, I want mistakes I made days or weeks ago to resurface for another try, so I actually learn from them instead of just seeing the correction once.
- As the student, I want to see my own trend over time (not just today's score) so a single bad day doesn't feel like the whole story.
- As the student, I want the option to skip gamified elements (streaks, badges) that feel juvenile, without losing the substance of the practice.
- As the student, I want to occasionally take a full, timed, realistic practice test that feels like the actual Bluebook experience.

### User stories — parent viewer
- As the parent, I want a weekly summary of adherence (days practiced) and trend (score/domain movement), not raw question-by-question data, so I can stay informed without hovering.
- As the parent, I want to know when the student has missed several days in a row, so I can check in before it becomes a pattern.
- As the parent, I want a clear signal ahead of each PSAT/SAT administration about which domains are strongest and weakest, so we can talk about expectations realistically.
- As the parent, I want confidence that the app is not collecting or exposing more of my child's personal data than necessary (see §2.7).
- As the parent, I do **not** want a feed of every single question the student got wrong — that level of detail belongs to the student, not a surveillance dashboard.

### Non-goals (all phases)
- Not a tutor-replacement or live-instruction product.
- Not a multi-student or multi-tenant product in its initial design (single-family use only — see architecture tradeoffs in §2.5).
- Not attempting item-level Bluebook simulation fidelity beyond what's needed for realistic full-length practice tests.
- Not promising a specific point-score gain in any user-facing copy (see Part 1, §4.5 messaging discipline).

## 2.2 The 30-Minute Session Model

Every session follows the same four-block skeleton, so the *structure* is predictable even as the *content* changes daily. The exact per-block minute budget shifts across the two-year arc as the balance of goals shifts from broad skill-building to targeted, test-realistic practice.

| Block | Purpose | Learning-science basis |
|---|---|---|
| Warm-up review | Spaced re-exposure to previously-seen items due for review today | Spaced repetition (§4.2), retrieval practice (§4.1) |
| New-skill practice | Introduce/build a specific skill not yet mastered | Scaffolded skill acquisition; sets up future spaced review |
| Mixed set | Interleaved practice across multiple domains (Math) / blocked-then-mixed practice (R&W, per §4.3's asymmetric finding) | Interleaving (§4.3) |
| Error review | Re-attempt of past incorrect items, with rationale shown after the retry | Retrieval practice applied to the student's own error history (§4.4) |

### Minute budgets by phase of the 2-year arc

| Phase (approx. timeframe) | Warm-up review | New-skill practice | Mixed set | Error review |
|---|---|---|---|---|
| Phase A — Foundation (9th grade, ~first 6–9 months) | 5 min | 15 min | 5 min | 5 min |
| Phase B — Breadth (rest of 9th grade → early 10th) | 7 min | 10 min | 8 min | 5 min |
| Phase C — Consolidation (10th grade → PSAT/NMSQT window) | 8 min | 5 min | 10 min | 7 min |
| Phase D — Test-ready (11th grade, final ~4–6 months before target test) | 5 min | 3 min | 12 min | 10 min |

Rationale: early phases weight toward new-skill acquisition because there is more unmastered material; later phases weight toward mixed, test-realistic practice and error review, consistent with the shift from "building skills" to "maintaining and stress-testing skills" that the diminishing-returns evidence in Part 1, §4.5 implies is the more efficient use of time once foundational skills are in place. This minute-budget schedule is **reasoned inference** — no study specifies exact minute allocations for a 30-minute daily SAT session, so these numbers are a starting design, meant to be tuned against the student's own actual mastery data over time (an explicit V1 feature — see roadmap, §2.8).

## 2.3 Mastery and Scheduling Algorithm

### Recommendation: a two-layer hybrid — FSRS-6 for scheduling + frozen-difficulty Elo/logistic ability tracking + fixed-parameter BKT for mastery display

**Why not a single off-the-shelf algorithm:** the three classic candidates each solve a different problem, and none alone covers all three needs (when to re-show an item, how hard is this item relative to this student, and how "mastered" is this skill overall) for a single-user app with no cohort data to calibrate against.

| Approach | What it's good at | Why it's insufficient alone here |
|---|---|---|
| SM-2 (classic Anki-style spaced repetition) | Simple, proven scheduling | Its calibration is measurably worse than FSRS — even a zero-parameter FSRS model beats SM-2 by roughly 3x on calibration accuracy against real review-log data, per the [SRS Benchmark](https://github.com/open-spaced-repetition/srs-benchmark) project (727M+ reviews, 10,000+ users) |
| Full IRT / Elo item-difficulty calibration from scratch | Rigorous difficulty estimation | Item Response Theory needs roughly 100–200 students' worth of response data to calibrate item difficulty reliably ([Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf)) — this app has exactly one student, so it cannot calibrate difficulty from its own usage data |
| Fitted, per-student Bayesian Knowledge Tracing (BKT) | Skill-mastery probability estimates | With n=1, fitting BKT's parameters directly produces identifiability and degeneracy problems — the model can't reliably distinguish its own parameters from noise on a single learner's data ([Baker, Corbett & Aleven 2008](https://link.springer.com/10.1007/978-3-540-69132-7_44)) |

**The recommended hybrid resolves each gap:**

1. **FSRS-6** handles *when* to re-show a given item/card. It needs only this one student's own review history (grades and interval lengths), not a cohort, per [Anki's official FSRS FAQ](https://faqs.ankiweb.net/frequently-asked-questions-about-fsrs.html) — this is exactly the single-user constraint this app has. Use College Board's own published parameter defaults at launch (no cohort needed to start), run the first per-student optimization once ~100 reviews have accumulated, and re-optimize monthly thereafter as the student's own review history grows. Desired retention target: 0.85–0.90 during Phases A–C, rising to 0.92–0.95 in Phase D as the actual test date approaches (tighter retention target = more frequent review, appropriate closer to test day). Grading uses the standard 4-point scale (Again/Hard/Good/Easy).
2. **Difficulty is authored, not calibrated from scratch, and tracked with a frozen-difficulty Elo/logistic ability model.** Because true per-item IRT calibration isn't feasible with one student, item difficulty is assigned at authoring time (e.g., "this item targets a mid-difficulty Algebra skill") rather than fitted. Once difficulty is fixed, a simple Elo-style ability tracker per skill domain converges to a stable ability estimate in roughly 10 answered items, which is fast enough to be useful within a single 2-year program.
3. **Skill mastery is displayed via a fixed-parameter (not fitted) BKT model, decayed by FSRS's own retrievability estimate.** Using published/reasonable fixed BKT parameters (rather than fitting them to this one student, which §2.3's table above shows is unreliable) avoids the degeneracy problem while still giving the student and parent an intuitive "mastery %" readout per skill, one that also decays realistically over time via the same retrievability signal FSRS is already tracking.

### Data model implication
The scheduling/mastery layer needs, per item-attempt: item ID, timestamp, response, correctness, response time, the FSRS stability/difficulty/retrievability state at time of review, the grade given (Again/Hard/Good/Easy), the skill tag(s) the item maps to, and the running Elo ability estimate per skill at time of attempt. Full ERD in §2.5.

## 2.4 Diagnostic and Periodic Full-Length Assessment Strategy

- **Initial diagnostic** at program start (early 9th grade): a full-length or half-length realistic Digital SAT-format practice test, built from official College Board paper practice PDF content delivered "as is" (per the content-source discipline in Part 1, §2), to set an honest starting baseline across all eight domains (four R&W, four Math).
- **Periodic full-length checkpoints**, timed to precede each real interim assessment: before PSAT 8/9, before PSAT/NMSQT, and at a small number of additional milestones through the 2-year arc — not more often than roughly once per academic term, since the evidence in Part 1, §4.5 (Chang et al. 2025) shows meaningful gains from full-length practice tests specifically, but taking them too frequently both burns the limited pool of official practice material and works against the "30 minutes a day, not a cram tool" design philosophy.
- **Full-length tests are the one context where the daily 30-minute cap is intentionally suspended** — they should be scheduled as their own calendar event (roughly 2+ hours), clearly distinguished in the UI from a normal daily session, with the day's normal session either skipped or replaced entirely by the test.
- Each full-length checkpoint should feed directly back into the FSRS/Elo/BKT layer as a large batch of fresh, high-signal attempt data — this is one of the few moments where the app gets a broad, simultaneous read across all domains at once, valuable for recalibrating the daily mix (§2.2 minute budgets) going forward.

## 2.5 Data Model, Content Schema & Architecture

### Entity-relationship model (ERD-level)

```
Student (1) ──< Session (1) ──< SessionBlock (1) ──< Attempt (M) >── Item (1)
Item (M) >── SkillTag (M)         [items map to one or more skill tags]
Item (1) ──< Passage (0..1)        [R&W items reference a shared passage]
Attempt (1) ── FSRSState (1)       [current scheduling state per item per student]
Attempt (1) ── EloState snapshot    [ability estimate per skill at time of attempt]
Student (1) ──< FullLengthTestResult (M)
ParentViewer (1) ──< Student (1)    [read-only relationship, no write access]
```

Key entities and fields:

- **Student**: id, grade level, target test date, program start date. No name/PII fields required beyond what's needed for the single-family account (see §2.7 on data minimization).
- **Item**: id, domain, skill tag(s), item type (MCQ / student-produced response), stem, answer key, rationale text, authored difficulty label, associated passage ID (R&W) or math-rendering payload (Math, e.g. LaTeX/MathML), source attribution (which of the Part 1 §2 content sources it derives from, for licensing traceability).
- **Passage**: id, source text attribution (public domain / CC BY / official-as-delivered), text body, associated item IDs.
- **SkillTag**: id, domain (one of the eight from Part 1 §1.3), skill name, parent domain weight.
- **Attempt**: id, student id, item id, timestamp, selected response, correctness, response time, self-graded FSRS grade, FSRS state snapshot (stability, difficulty, retrievability at time of review), Elo ability snapshot.
- **FSRSState**: per (student, item) pair — current stability, difficulty, due date, review count, lapse count.
- **Session / SessionBlock**: id, date, planned minute budget per block (§2.2), actual items served, actual time spent.
- **FullLengthTestResult**: id, student id, date, per-domain raw and scaled scores, total scaled score, item-level attempt linkage.
- **ParentViewer**: id, linked student id, read-only access scope (weekly summary + domain trend only, per the parent user stories in §2.1 — explicitly excludes item-level error-log visibility).

### Architecture and stack recommendation (solo developer, AI-coding-assisted)

Given a solo developer building with AI coding assistance, single-family scale, and a strong preference for low ongoing cost and low operational burden:

| Layer | Recommendation | Tradeoff notes |
|---|---|---|
| Frontend | Single cross-platform codebase (e.g., React Native or Flutter) targeting iOS primarily, given the family's stated iPhone/iOS platform preference, with a responsive web fallback | Cross-platform frameworks cost some native polish but massively reduce solo-maintenance burden versus separate native codebases |
| Backend | Lightweight serverless functions (e.g., on a managed platform) rather than a persistent server, given the tiny, spiky (once-a-day-per-user) traffic pattern | Serverless cold-starts are a non-issue at this traffic volume; avoids paying for an always-on server for one user |
| Database | Managed Postgres (or SQLite-per-device with periodic sync, if fully offline-first is prioritized) | Postgres gives clean relational modeling for the ERD above; SQLite-first trades some sync complexity for zero backend dependency, worth considering if offline reliability is the top priority |
| Auth | Simple email/passwordless or platform-native (Sign in with Apple) single-family login; no third-party social-data sharing | Given this is a minor's account, minimizing third-party auth data sharing is a deliberate privacy choice, not just a convenience one |
| Offline handling | Local-first session data with background sync when connectivity returns; the daily session itself must work with no network (school Wi-Fi restrictions, commute, etc.) | This is a hard requirement given the "every day, 30 minutes" design goal — a session that fails offline breaks the entire habit-engine premise |
| Math rendering | Client-side LaTeX/MathML rendering library (e.g., KaTeX) | Well-trodden, fast, works offline once assets are cached |
| Hosting/cost estimate at this scale | Single-digit dollars per month (managed DB + serverless function invocations + object storage for content) — this is a one-user app; even generous headroom stays in low-cost hobby-tier pricing on virtually any current managed-cloud provider | The dominant cost driver, if any, will be content-authoring time, not infrastructure |

This architecture section is **reasoned recommendation**, not sourced research — it reflects standard, low-risk choices for a solo-developer, single-tenant, AI-assisted build rather than a benchmarked comparison.

## 2.6 Motivation Design That Avoids Gamification Burnout

Per the competitive teardown (Part 1 §3, point 7), streak mechanics are common in the casual/free tier and less prominent in "serious" paid products — worth deliberately choosing rather than defaulting into.

- **Make streak mechanics optional and low-stakes**, not the primary motivator: a quiet, visible "consistency" indicator (e.g., a simple week-view of days practiced) rather than a loud streak counter that punishes a single missed day with total reset — an 11th grader is a more resistant audience to juvenile gamification than the middle-school-skewed audience most streak mechanics are designed for.
- **Make progress visible in a way that's actually true to the evidence** — trend lines and domain-level movement over time, not a single "predicted score" number overstating precision (per the "honest uncertainty vs. false precision" pattern flagged in the teardown, §3 point 3).
- **Design explicitly for missed-day recovery**, not just missed-day guilt: when a day is missed, the next session's plan should visibly and simply absorb the gap (e.g., folding the missed day's due reviews into the next session rather than piling up an intimidating backlog) — this directly operationalizes teardown insight #2 (re-plan on adherence, not just accuracy).
- **Avoid streak-based extrinsic rewards (badges, points, leaderboards)** that research on burnout in sustained-effort contexts generally flags as prone to diminishing intrinsic motivation over long horizons — appropriate caution given this is explicitly a 2-year program, not a 6-week challenge. (This is **reasoned inference** from general motivation-design principles, not a study specific to this population — no study in Part 1 §4 directly tested gamification-and-burnout in SAT-prep-specific teens.)

## 2.7 Privacy

**Regulatory scope determination:**

- **COPPA does not apply**: COPPA's operator obligations trigger for services directed at children *under 13*, or with actual knowledge of under-13 users, combined with a *commercial* data-collection purpose ([16 CFR §312.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312/section-312.2)). The student here is 14+ (entering 9th grade) for the entire program duration, and this is explicitly a personal, non-commercial, single-family app. Both conditions for non-applicability are met.
- **FERPA does not apply**: FERPA governs *educational institutions and agencies* receiving federal funding, not personal software built by a parent ([studentprivacy.ed.gov](https://studentprivacy.ed.gov/ferpa)). This app is neither.

**Despite non-applicability, this is still a minor's personal data, and the app should self-impose COPPA/FERPA-adjacent discipline as good practice, not because it's legally required:**

| Collect | Do NOT collect |
|---|---|
| Item ID, timestamp, correctness, response time | Full name (a first-name-only or nickname display is sufficient) |
| Derived memory/mastery state (FSRS/Elo/BKT internals) | Home address, phone number |
| Skill tags attempted | Social Security Number or any government ID |
| Ability estimates per skill | Email address beyond what's strictly needed for the single-family login |
| Session-level adherence (days practiced, minutes spent) | Photos, audio, or video of the student |
| Target test date, grade level | Precise geolocation |
| — | Persistent third-party advertising identifiers |
| — | Biometric data |

**Practical data-minimization defaults**: no third-party analytics SDKs that fingerprint or advertise against a minor's usage; no data sale or sharing with any third party under any circumstance; parent-viewer access limited to the aggregate weekly-summary scope defined in §2.1's parent user stories, explicitly excluding raw item-level error logs (a student's specific wrong answers are the student's own learning data, not a surveillance feed for the parent).

## 2.8 Phased Roadmap

| Phase | Scope | Explicit non-goals |
|---|---|---|
| **MVP** | Single-student account; core 4-block 30-min session engine (§2.2, Phase A minute budget only); FSRS-6 scheduling with published defaults (no per-student optimization yet); authored item bank seeded from CC BY math content + original R&W passages, covering all 8 domains at a basic level; offline-capable daily session; simple parent weekly-summary view; one initial full diagnostic assessment | No adaptive minute-budget phase-shifting (Phase A only); no Elo/BKT layer yet (deferred to V1); no full-length timed practice-test mode beyond the initial diagnostic; no push notifications/reminders |
| **V1** | Full 4-phase minute-budget schedule (§2.2 A–D) with phase transitions driven by elapsed time + mastery signal; frozen-difficulty Elo ability tracking per skill; fixed-parameter BKT mastery display; per-student FSRS optimization once ~100 reviews accrue, then monthly re-optimization; full-length timed practice-test mode (College Board paper PDFs delivered as-is) scheduled around PSAT 8/9 and PSAT/NMSQT; parent weekly-summary automation (scheduled digest, not just on-demand view); missed-day replanning logic | No multi-student/multi-tenant support; no social/leaderboard features (explicitly excluded per §2.6); no official College Board digital item licensing (would require pursuing the Copyright/Trademark Permission Request Form — out of scope unless separately pursued) |
| **V2** | Content-bank expansion via authored item pipeline (more originally-written items per skill, reducing repetition risk over a 2-year horizon); refined per-student minute-budget tuning using the student's own accumulated mastery data (moving beyond the Phase A–D defaults, per the "tune against real data" note in §2.2); richer parent trend visualizations ahead of the actual target SAT administration; expanded full-length test cadence options near test date (Phase D) | Still explicitly not pursuing multi-tenant/commercial productization as an MVP/V1/V2 goal — that would be a distinct, later decision requiring its own licensing and architecture review, not an incremental extension of this plan |

---

# Part 3 — Ticket Backlog (MVP + V1)

## Epics

| Epic | One-line goal |
|---|---|
| E1 — Session Engine | Build the 4-block, 30-minute daily session composer and runner |
| E2 — Content & Item Bank | Author, tag, and store the initial licensed/authored item bank across all 8 domains |
| E3 — Scheduling & Mastery | Implement FSRS-6 scheduling (MVP), then Elo ability tracking + fixed-parameter BKT mastery display (V1) |
| E4 — Assessment | Diagnostic and full-length practice test delivery and scoring |
| E5 — Parent Viewer | Read-only weekly-summary experience for the parent account |
| E6 — Platform & Offline | Auth, offline-first sync, cross-platform app shell |
| E7 — Privacy & Data Minimization | Enforce the collect/do-not-collect policy from §2.7 end-to-end |

## Tickets

| ID | Title | Epic | User story | Acceptance criteria (Given/When/Then) | Technical notes | Dependencies | Points | Priority |
|---|---|---|---|---|---|---|---|---|
| T-01 | Define skill-tag taxonomy from SAT domain list | E2 | As the content author, I want a canonical skill-tag list mapped to the 8 official domains so every item can be consistently tagged | Given the 8 domains from Part 1 §1.3, When the taxonomy is finalized, Then every domain has a documented list of child skill tags with no overlaps | Source: College Board domain documentation (Part 1 §1.3) | None | 3 | P0 |
| T-02 | Author initial R&W passage + item set (all 4 R&W domains) | E2 | As the student, I want enough R&W items at launch to cover a full first pass of all 4 domains | Given public-domain source text and the skill taxonomy (T-01), When items are authored, Then each of the 4 R&W domains has at least N items across at least 2 difficulty labels | Public-domain text sourcing per Part 1 §2 | T-01 | 8 | P0 |
| T-03 | Author/adapt initial Math item set (all 4 Math domains) | E2 | As the student, I want enough Math items at launch to cover a full first pass of all 4 domains | Given CC BY 4.0 math curricula and the skill taxonomy (T-01), When items are adapted into SAT-style stems, Then each of the 4 Math domains has at least N items across at least 2 difficulty labels | CC BY 4.0 attribution must be preserved per item (source field in Item entity, §2.5) | T-01 | 8 | P0 |
| T-04 | Build Item/Passage/SkillTag data model & storage | E2 | As the developer, I need the content schema implemented so items can be queried by domain/skill/difficulty | Given the ERD in §2.5, When the schema is deployed, Then Item, Passage, and SkillTag tables/collections exist with the documented fields and relationships | Postgres (or SQLite) per §2.5 | None | 5 | P0 |
| T-05 | Implement FSRS-6 scheduling engine (published defaults) | E3 | As the student, I want items I've seen before to resurface at the right time so I retain what I've learned | Given a student has attempted an item, When the FSRS-6 algorithm runs with published default parameters, Then the item's next due date, stability, and difficulty are computed and stored per the FSRSState entity (§2.5) | Reference: [SRS Benchmark](https://github.com/open-spaced-repetition/srs-benchmark), [Anki FSRS FAQ](https://faqs.ankiweb.net/frequently-asked-questions-about-fsrs.html) | T-04 | 8 | P0 |
| T-06 | Build 4-block session composer (Phase A minute budget) | E1 | As the student, I want a fully composed 30-minute session (warm-up, new-skill, mixed, error review) ready when I open the app | Given today's due-reviews (from FSRS) and remaining unmastered skills, When the session composer runs, Then a session is generated matching the Phase A minute budget from §2.2, with items drawn appropriately per block | Depends on FSRS due-dates and item bank availability | T-03, T-05 | 8 | P0 |
| T-07 | Build session runner UI (item display, response capture, math rendering) | E1 | As the student, I want to actually answer questions in-app, including math notation, and get immediate grading feedback | Given a composed session (T-06), When the student answers each item, Then correctness is recorded, an FSRS grade is captured, and math items render correctly via KaTeX | Client-side LaTeX rendering per §2.5 | T-06 | 8 | P0 |
| T-08 | Implement error-review block logic | E1 | As the student, I want past mistakes to reappear for another try with the rationale shown after my retry | Given a past incorrect Attempt, When it becomes due for error review, Then it is included in the error-review block, and the rationale text is shown only after the retry is submitted | Rationale field on Item entity (§2.5) | T-04, T-06 | 5 | P0 |
| T-09 | Implement offline-first local session storage + background sync | E6 | As the student, I want to complete my session with no internet connection and have it sync later | Given no network connectivity, When a session is completed offline, Then all attempt data is stored locally and syncs to the backend once connectivity returns, with no data loss | Local-first storage per §2.5 architecture | T-07 | 8 | P0 |
| T-10 | Implement single-family auth (student + parent viewer roles) | E6 | As the parent, I want my own read-only login separate from my child's account | Given two account roles (student, parent viewer), When each logs in, Then the student has full session access and the parent has only the read-only weekly-summary scope defined in §2.1/§2.7 | Sign in with Apple or passwordless email per §2.5 | None | 5 | P0 |
| T-11 | Build initial full diagnostic assessment delivery (MVP) | E4 | As the student, I want to take one realistic full-length practice test at program start to establish a baseline | Given College Board paper practice PDF content delivered as-is, When the student completes the diagnostic, Then per-domain and total scaled scores are computed and stored per the FullLengthTestResult entity (§2.5) | Content per Part 1 §2 (official PDFs, non-commercial use) | T-04 | 8 | P0 |
| T-12 | Build parent weekly-summary view (on-demand, MVP) | E5 | As the parent, I want to view adherence and domain trend on demand | Given a parent-viewer login (T-10), When the parent opens the summary view, Then days-practiced and per-domain trend are shown, with no item-level error data exposed | Enforce read-only scope per §2.7 | T-10 | 5 | P0 |
| T-13 | Enforce data-minimization checklist across all data flows | E7 | As the parent, I want assurance the app collects nothing beyond the documented fields | Given the collect/do-not-collect table in §2.7, When any new data flow is added, Then it is checked against the table before merging, with no PII fields (name beyond nickname, address, phone, SSN, photos, geolocation, ad IDs, biometrics) collected anywhere | Applies as an ongoing gate on every future ticket, not a one-time task | T-04, T-10 | 3 | P0 |
| T-14 | Implement 4-phase minute-budget schedule (Phase A–D transitions) | E1 | As the student, I want the session mix to shift over the 2-year arc as described in §2.2 | Given elapsed program time and accumulated mastery signal, When a phase transition threshold is reached, Then the session composer switches to the next phase's minute budget (Phase A→B→C→D per §2.2's table) | Depends on mastery signal from E3 V1 tickets | T-06, T-16 | 8 | P1 |
| T-15 | Implement frozen-difficulty Elo ability tracker per skill | E3 | As the developer, I need a per-skill ability estimate that converges quickly on a single student's data | Given authored item difficulty labels (not fitted) and a stream of attempts, When Elo updates run after each attempt, Then a per-skill ability estimate is stored and updates within ~10 answered items per skill | Per Pelánek 2016 methodology (Part 2 §2.3) | T-04, T-05 | 8 | P1 |
| T-16 | Implement fixed-parameter BKT mastery display | E3 | As the student and parent, I want an intuitive mastery percentage per skill | Given fixed (not fitted) BKT parameters and the FSRS retrievability signal, When mastery is computed, Then a per-skill mastery percentage is displayed and decays over time consistent with retrievability | Avoids n=1 fitting degeneracy per Baker/Corbett/Aleven 2008 (Part 2 §2.3) | T-15 | 5 | P1 |
| T-17 | Implement per-student FSRS optimization (post ~100 reviews) + monthly re-optimization | E3 | As the student, I want the scheduler to get more accurate to my own memory patterns over time | Given at least 100 recorded reviews, When optimization runs, Then per-student FSRS parameters replace published defaults, and re-optimization is scheduled monthly thereafter | Depends on sufficient review volume | T-05 | 5 | P1 |
| T-18 | Build full-length timed practice-test mode (V1, PSAT-aligned scheduling) | E4 | As the student, I want a realistic, fully timed full-length practice test ahead of each PSAT administration | Given the module timing from Part 1 §1.1, When a full-length test is scheduled ahead of PSAT 8/9 or PSAT/NMSQT, Then the test enforces real section/module timing and produces a FullLengthTestResult | Extends T-11 with timing enforcement and scheduling logic | T-11 | 8 | P1 |
| T-19 | Implement missed-day replanning logic | E1 | As the student, I want a missed day to be absorbed smoothly into the next session's plan, not pile up as a backlog | Given one or more missed days, When the next session is composed, Then overdue reviews are folded into the session composer's due-review pool without an intimidating unbounded backlog | Directly implements Part 2 §2.6 design principle | T-06 | 5 | P1 |
| T-20 | Automate scheduled parent weekly-summary digest | E5 | As the parent, I want the weekly summary delivered automatically, not just available on demand | Given the on-demand summary view (T-12), When a week elapses, Then a digest is automatically generated and made available/delivered to the parent viewer | Extends T-12 | T-12 | 3 | P1 |
| T-21 | Build content-source attribution tracking per item | E2 | As the developer, I need every item's licensing source traceable for compliance | Given the Item entity's source-attribution field (§2.5), When an item is authored or adapted, Then its originating source (CC BY curriculum, public-domain text, official PDF-as-delivered) is recorded and auditable | Supports Part 1 §2 licensing discipline | T-04 | 3 | P1 |

## Suggested sprint sequence (assuming ~1–2 week sprints, solo developer with AI coding assistance)

1. **Sprint 1** — T-01, T-04, T-10 (taxonomy, data model, auth foundation)
2. **Sprint 2** — T-02, T-03 (initial content authoring — the highest-effort, least automatable work)
3. **Sprint 3** — T-05, T-21 (FSRS engine + attribution tracking)
4. **Sprint 4** — T-06, T-08 (session composer + error-review logic)
5. **Sprint 5** — T-07, T-09 (session runner UI + offline-first sync)
6. **Sprint 6** — T-11, T-12, T-13 (diagnostic assessment, parent view, privacy gate) — **MVP complete**
7. **Sprint 7** — T-15, T-16 (Elo + BKT mastery layer)
8. **Sprint 8** — T-17, T-19 (FSRS optimization + missed-day replanning)
9. **Sprint 9** — T-14, T-18 (phase transitions + full-length timed test mode)
10. **Sprint 10** — T-20 (parent digest automation) — **V1 complete**

---

# Part 4 — Competitive Positioning & Gap Analysis

## 4.1 What's missing from the current plan

The plan already has a technical spine (session engine, FSRS scheduling, item bank, privacy layer), but several pieces are either explicitly deferred to V2+ or not on the roadmap at all. This is the plan's own synthesis, drawing on the competitive teardown in Part 1 §3 and the roadmap in Part 2 §2.8 — not a new round of sourced research.

**Deferred but already planned (V2+):** deeper per-student personalization of the minute-budget schedule, expanded content pipeline, richer parent visualizations (Part 2 §2.8).

**Not on the roadmap anywhere — real gaps:**

- **No content-freshness process.** Part 1 §1.4 flagged that domain weights and Question Bank contents should be re-verified against [satsuite.collegeboard.org](https://satsuite.collegeboard.org/practice/khan-academy) close to build time and before each PSAT/SAT sitting — but no ticket operationalizes this as a recurring check. Right now it is a caveat, not a task.
- **No national-norm context.** The app tracks the student's own trend line but never contextualizes it against College Board's published percentile tables, so "you're improving" has no external anchor.
- **No predicted-score confidence band.** The motivation-design philosophy in Part 2 §2.6 explicitly rejects a false-precision single-number score, but no ticket builds the "range, not point estimate" UI — it is a stated principle without an implementation.
- **No item-bank exhaustion math.** With one student doing 30 minutes daily for two years, nobody has calculated how many original items per skill are needed before repetition becomes noticeable. V2 mentions "content-bank expansion" (Part 2 §2.8) but there is no sizing model behind it.
- **No conversational/explanatory AI-tutor layer.** The plan gives rationale text after a retry (Part 3, T-08) but nothing like a chat-based "explain this differently" layer, which several AI-tutor-framed competitors lead with.
- **No registration or test-day logistics support** (PSAT/SAT registration reminders, score-reporting-to-colleges guidance) — out of scope currently, though it is a real part of the family's actual job to be done around the test.
- **No accessibility/accommodations simulation** — not addressed either way; worth a deliberate yes/no decision rather than silence, especially if extended time is ever relevant for the student.

None of these are fatal — they are honest gaps in a personal-use MVP, not evidence the plan is broken.

## 4.2 How it stacks up against the competition

| Product | Core model | Cost | Structural strength | What this app doesn't have |
|---|---|---|---|---|
| [Varsity Tutors / Nerdy](https://www.varsitytutors.com/tutoring-prices-rates-cost) | Human tutor, hour-block sessions | $1,104–$2,916 per 12/24/36-hr block ([Nerdy tuition plans](https://www.varsitytutors.com/membership/tuition-plans)) | A real human holding the student accountable — the single biggest gap this app cannot close | Human accountability, live Q&A, adult judgment on stuck problems |
| [Khan Academy](https://satsuite.collegeboard.org/practice/khan-academy) | Free, self-paced, official College Board partner | Free (Khanmigo add-on ~$4/mo, [pricing](https://www.khanmigo.ai/pricing)) | Officially licensed digital SAT content — legally, this app can never match that | Access to real, official released digital items at scale |
| [UWorld](https://collegeprep.uworld.com/sat/) | Question-bank browsing, filter-based | $99 QBank / $299 course | Large, professionally authored, difficulty-calibrated item bank | A team of paid item writers; this app's items are authored by one parent |
| [Princeton Review](https://www.princetonreview.com/college/sat-tutoring-course?test_type=SAT) | Courses/tutoring, scored score guarantee | $299–$3,150 | Brand trust plus a formal [score guarantee](https://www.princetonreview.com/legal/guarantee) | Any guarantee, support infrastructure, or brand proof |
| [Bloom Prep for Bluebook SAT](https://apps.apple.com/us/app/bloom-prep-for-bluebook-sat/id6759626013) | Daily-practice, mobile-first | $19.99/mo–$59.99/yr | Closest structural analog (daily minutes as a first-class variable) | Nothing structural — this app's daily-habit design, error-log rigor, and honest-uncertainty framing are all stronger than Bloom's |
| [Acely](https://acely.com/pricing) / [LearnQ.ai](https://www.learnq.ai/pricing) | AI-tutor daily practice | $49–$200/mo | Marketed AI personalization | Undisclosed mechanism — weaker, not stronger, than this app's transparent FSRS/Elo/BKT stack |
| [R.test.ai](https://www.rtest.ai/exam/DSAT) | AI-driven adaptive practice | Unpublished | Names its psychometric method explicitly | Verifiable evidence beyond marketing claims |

**Where it genuinely wins:** cost (effectively $0 vs. hundreds-to-thousands of dollars), a daily-habit design purpose-built for a fixed 30-minute constraint (most competitors are hour-blocks or unbounded browsing), a transparent and citation-grounded adaptive-learning stack instead of an undisclosed "AI personalization" black box, a genuinely good parent-viewer experience (every competitor treats this as an afterthought per Part 1 §3, point 8), and privacy-by-design for a minor's data that none of the commercial products bother with (Part 2 §2.7).

**Where it structurally loses, and always will as designed:** no human accountability layer (Nerdy's core value proposition), no professionally calibrated item bank at UWorld/Princeton Review scale, no officially licensed digital SAT content (Khan Academy's unique advantage), and no guarantee or brand-trust signal.

## 4.3 The real answer

As a personal tool built for one student, this app does not need to "beat" these products commercially — it needs to serve the student better than paying for one of them would, and on cost, daily-habit fit, honesty about uncertainty, and parent visibility, it likely does. If the ambition ever shifts toward offering this to other families, the gaps in §4.1 above — especially the missing content-freshness process, percentile context, score-confidence UI, item-bank sizing model, and above all the missing human-accountability layer and any kind of guarantee — are exactly what would need to be solved before it could be pitched as a real alternative to Nerdy, Princeton Review, or Bloom Prep rather than a cheaper, more thoughtful DIY substitute for them.

---

# Closing: Five Riskiest Assumptions & Cheap Tests

1. **Assumption**: A single, fixed 4-block session structure (warm-up/new-skill/mixed/error-review) will hold a 14–17-year-old's engagement daily for two years without feeling repetitive.
   **Cheap test**: Run the MVP session structure manually (even with a spreadsheet-driven mock session before any app exists) for 2–3 weeks and get direct qualitative feedback from the student on which block feels stale first — costs a few hours, not a build cycle.

2. **Assumption**: The Phase A–D minute-budget schedule (§2.2) is a reasonable default sequence, since no study specifies exact minute allocations for this format.
   **Cheap test**: Instrument the MVP to log per-block completion and self-reported difficulty from day one, then compare actual mastery-signal growth against the assumed phase-transition thresholds before hard-coding Phase B/C/D transitions in V1 — the data needed to validate or revise this assumption is a byproduct of just running MVP, not a separate research project.

3. **Assumption**: FSRS-6 with published defaults will perform acceptably for a single student before enough review history (~100 reviews) exists to run per-student optimization.
   **Cheap test**: Track predicted-vs-actual recall accuracy from day one (does the student actually remember items FSRS predicts they should, and vice versa) — a simple calibration check that costs nothing extra since the attempt data is already being logged for T-05.

4. **Assumption**: Content authored from CC BY curricula and public-domain text, reformatted into SAT-style stems, will feel sufficiently realistic and test-representative to the student, versus official released items.
   **Cheap test**: After the first authored batch (T-02/T-03), have the student attempt a short mixed set of authored items alongside a short set of official College Board practice items (from the licensed PDF bundles) without labeling which is which, and compare subjective difficulty/realism feedback — a single side-by-side session, not a formal study.

5. **Assumption**: The 21–39-point-per-6–8-hours baseline (Weatherholtz et al. 2020) is a reasonable proxy for what this specific student, in this specific 30-min/day format, will experience — despite no study testing a 300+ hour, 2-year intervention of this design.
   **Cheap test**: Treat the program's own full-length checkpoint results (§2.4 — initial diagnostic, then PSAT 8/9, then PSAT/NMSQT) as the real experiment: plot this student's actual score trajectory against the fitted quadratic diminishing-returns curve from Part 1, §4.5 after each checkpoint, and openly revise expectations (up or down) based on that student's own emerging data rather than continuing to lean on a citation that was never designed to cover this use case — essentially, use the app's own diagnostic cadence (already planned for MVP) as the validation mechanism at zero extra cost.
