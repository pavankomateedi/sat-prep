/**
 * T-04 — Core entity types, mirroring the ERD in PRD §2.5.
 *
 * Deliberately free of React Native imports: everything here is plain data so
 * the engine layer (scheduling, composer, scoring) can be unit-tested in Node.
 */

import type { DomainId, SectionId, SkillId } from './taxonomy';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Authored difficulty. Frozen at authoring time and never fitted from student
 * data — PRD §2.3 explains why: true IRT calibration needs 100-200 students and
 * this app has exactly one, so difficulty is an input to the Elo model, not an
 * output of it.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Difficulty as an Elo/logit offset. Centred on 0 so `medium` is the anchor. */
export const DIFFICULTY_LOGIT: Record<Difficulty, number> = {
  easy: -0.8,
  medium: 0,
  hard: 0.8,
};

export type ItemType =
  /** Multiple choice, four options, exactly one correct. */
  | 'mcq'
  /** Student-produced response — free-entry numeric answer, Math only. */
  | 'spr';

/**
 * T-21 — Licensing provenance. Every Item and Passage carries one so the whole
 * bank stays auditable against the content rules in PRD Part 1 §2.
 */
export type LicenseKind =
  /** Text out of copyright (e.g. Project Gutenberg, pre-1929, US Gov works). */
  | 'public_domain'
  /** Adapted from a CC BY 4.0 curriculum. Attribution is mandatory. */
  | 'cc_by_4_0'
  /** Written from scratch for this app. */
  | 'original'
  /**
   * College Board practice PDF used exactly as delivered, never re-typeset or
   * reformatted. Personal, non-commercial use only.
   */
  | 'official_as_delivered';

export interface SourceAttribution {
  kind: LicenseKind;
  /** Work or curriculum title. Required for everything except `original`. */
  title?: string;
  author?: string;
  /** Where it came from. Required for `cc_by_4_0`. */
  url?: string;
  licenseUrl?: string;
  /** ISO date the source was retrieved. */
  retrievedOn?: string;
  /**
   * Ready-to-display attribution line. Required for `cc_by_4_0`, which obliges
   * attribution on redistribution; rendered in the app's Attributions screen.
   */
  attributionText?: string;
  /** How the source was changed, if at all. CC BY requires noting adaptations. */
  modifications?: string;
}

export interface Passage {
  id: string;
  title: string;
  /** Plain text. R&W stems reference this by id. */
  body: string;
  /** Optional second body for paired-passage (cross-text connections) items. */
  bodyB?: string;
  source: SourceAttribution;
  /** Second source, when bodyB comes from a different work. */
  sourceB?: SourceAttribution;
  /** Approximate word count, used by the composer's time model. */
  wordCount: number;
}

export interface Choice {
  /** 'A' | 'B' | 'C' | 'D' */
  id: string;
  text: string;
}

/**
 * A table or chart rendered alongside a quantitative-evidence or data-analysis
 * item. Kept structured rather than as a bitmap so it renders offline and stays
 * accessible to screen readers.
 */
export interface ItemFigure {
  kind: 'table' | 'scatter' | 'bar' | 'line';
  caption?: string;
  /** For `table`. */
  columns?: string[];
  rows?: string[][];
  /** For chart kinds. */
  series?: { label: string; points: { x: number; y: number }[] }[];
  xLabel?: string;
  yLabel?: string;
}

export interface Item {
  id: string;
  section: SectionId;
  domain: DomainId;
  /**
   * One or more skills. The first entry is the primary skill and is what the
   * Elo/BKT layer updates; extras are secondary tags for reporting only.
   */
  skills: SkillId[];
  itemType: ItemType;
  difficulty: Difficulty;
  /**
   * The short text a Reading & Writing question is built on.
   *
   * The Digital SAT gives each R&W question its own 25-150 word text rather
   * than the long shared passages of the paper SAT, so the stimulus normally
   * belongs to the item. `passageId` is the exception, used when one longer
   * excerpt is deliberately reused across several items.
   */
  stimulus?: string;
  /** Second text for paired-passage (cross-text connections) items. */
  stimulusB?: string;
  /** The question text. May contain $...$ LaTeX spans for Math. */
  stem: string;
  /** Present for `mcq`, absent for `spr`. */
  choices?: Choice[];
  /**
   * For `mcq`, the correct Choice id. For `spr`, an array of accepted exact
   * answers (e.g. ['1/2', '0.5']) — the Digital SAT accepts equivalent forms.
   */
  answer: string | string[];
  /** Shown only after the student has committed an answer. */
  rationale: string;
  passageId?: string;
  figure?: ItemFigure;
  source: SourceAttribution;
  /**
   * Expected solve time in seconds. Drives the composer's minute budgeting —
   * PRD §2.2 budgets blocks in minutes, so the composer needs a per-item cost.
   */
  estimatedSeconds: number;
  /** Bumped when an item's content is edited, so caches can be invalidated. */
  version: number;
}

// ---------------------------------------------------------------------------
// Student and scheduling state
// ---------------------------------------------------------------------------

/**
 * PRD §2.7 data minimisation: no legal name, address, phone, email beyond
 * login, photos, or geolocation. `displayName` is a nickname only, and the
 * privacy gate (src/privacy/) enforces this shape at runtime.
 */
export interface Student {
  id: string;
  displayName: string;
  gradeLevel: number;
  /** ISO date. */
  programStartDate: string;
  /** ISO date of the target SAT administration. */
  targetTestDate: string;
}

/** The four arc phases from PRD §2.2. */
export type ProgramPhase = 'A' | 'B' | 'C' | 'D';

export type BlockKind = 'warmup' | 'new_skill' | 'mixed' | 'error_review';

/** FSRS four-point grading scale. Mirrors ts-fsrs `Rating`. */
export type FsrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface FsrsState {
  studentId: string;
  itemId: string;
  /** Days; FSRS memory-stability parameter. */
  stability: number;
  /** FSRS internal difficulty, 1-10. Distinct from the item's authored label. */
  difficulty: number;
  /** ISO timestamp when this item is next due. */
  due: string;
  /** ISO timestamp of the most recent review, null before the first. */
  lastReview: string | null;
  reps: number;
  lapses: number;
  /** ts-fsrs card state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  /** Scheduled interval in days at the last review. */
  scheduledDays: number;
  /** Days elapsed since the previous review, at the time of the last review. */
  elapsedDays: number;
  /**
   * Learning-step index for cards still in the (re)learning phase. ts-fsrs
   * tracks this to know which step a card is on; persisting it keeps
   * short-interval scheduling stable across app restarts.
   */
  learningSteps: number;
}

export interface EloState {
  studentId: string;
  skillId: SkillId;
  /** Ability in logits. 0 = matched to a `medium` item. */
  ability: number;
  /** Attempts seen for this skill; drives the decaying K-factor. */
  attempts: number;
  updatedAt: string;
}

export interface BktState {
  studentId: string;
  skillId: SkillId;
  /** P(skill is learned), before retrievability decay. */
  pKnown: number;
  attempts: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Sessions and attempts
// ---------------------------------------------------------------------------

export interface Attempt {
  id: string;
  studentId: string;
  itemId: string;
  /** Null for attempts made inside a full-length test rather than a session. */
  sessionId: string | null;
  /** Null for full-length-test attempts. */
  blockKind: BlockKind | null;
  /** ISO timestamp. */
  answeredAt: string;
  /** Raw response: Choice id for mcq, typed string for spr. */
  response: string;
  correct: boolean;
  responseTimeMs: number;
  grade: FsrsGrade;
  /** Snapshot of FSRS state at review time, for later parameter optimisation. */
  stabilityBefore: number | null;
  difficultyBefore: number | null;
  retrievabilityBefore: number | null;
  /** Days since the previous review of this item; 0 for a first exposure. */
  elapsedDays: number;
  /** Elo ability for the item's primary skill, before this attempt applied. */
  eloBefore: number | null;
  /** True once uploaded to Supabase. Drives the offline sync queue (T-09). */
  synced: boolean;
}

export interface PlannedBlock {
  kind: BlockKind;
  /** Minute budget from the phase table in PRD §2.2. */
  budgetMinutes: number;
  itemIds: string[];
}

export interface Session {
  id: string;
  studentId: string;
  /** Local calendar date, YYYY-MM-DD. One session per day. */
  date: string;
  phase: ProgramPhase;
  blocks: PlannedBlock[];
  startedAt: string | null;
  completedAt: string | null;
  /** Actual seconds spent, summed across attempts. */
  actualSeconds: number;
  /**
   * How many days had been missed before this session was composed. Feeds the
   * missed-day replanning logic (T-19) and the parent adherence summary.
   */
  missedDaysBefore: number;
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export type AssessmentKind = 'diagnostic' | 'full_length' | 'psat_8_9' | 'psat_nmsqt';

export interface SectionScore {
  section: SectionId;
  rawCorrect: number;
  rawTotal: number;
  /** 200-800, in 10-point increments. */
  scaledScore: number;
}

export interface DomainScore {
  domain: DomainId;
  correct: number;
  total: number;
}

export interface FullLengthTestResult {
  id: string;
  studentId: string;
  kind: AssessmentKind;
  /** ISO date. */
  takenOn: string;
  sectionScores: SectionScore[];
  domainScores: DomainScore[];
  /** 400-1600. */
  totalScaled: number;
  /**
   * Half-width of the reported confidence band, in composite points. PRD §2.6
   * forbids presenting a bare point estimate, so the UI always renders
   * totalScaled ± confidenceHalfWidth.
   */
  confidenceHalfWidth: number;
  attemptIds: string[];
  synced: boolean;
}

// ---------------------------------------------------------------------------
// Parent viewer
// ---------------------------------------------------------------------------

export type AccountRole = 'student' | 'parent';

export interface ParentViewer {
  id: string;
  linkedStudentId: string;
  displayName: string;
}

/**
 * Exactly what a parent is allowed to see. PRD §2.1/§2.7 are explicit that
 * item-level error data is the student's own and must never appear here, so the
 * parent surface is built from this type and nothing else.
 */
export interface WeeklySummary {
  studentId: string;
  /** ISO date of the Monday that starts the week. */
  weekStart: string;
  daysPracticed: number;
  daysInWeek: number;
  totalMinutes: number;
  currentMissedStreak: number;
  /** Per-domain mastery this week and the change from last week. */
  domainTrends: {
    domain: DomainId;
    masteryPercent: number;
    deltaFromPreviousWeek: number;
  }[];
  /** Most recent assessment, if any has been taken. */
  latestScore: {
    totalScaled: number;
    confidenceHalfWidth: number;
    takenOn: string;
  } | null;
  /** Set when the student has missed enough days to warrant a check-in. */
  adherenceAlert: string | null;
  generatedAt: string;
}
