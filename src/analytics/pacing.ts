/**
 * Pacing and performance analytics — the reporting paid subscriptions
 * advertise most heavily, and the one place this app was sitting on data it
 * never showed anyone.
 *
 * Response time has been recorded on every attempt since T-05, because the FSRS
 * grade is derived from it. It was never surfaced. Pacing is one of the two
 * things that actually decides a Digital SAT score — you can know the material
 * and still run out of module — so leaving it unreported was a real gap.
 *
 * The honesty rules from PRD §2.6 apply here as much as to scores: no metric is
 * reported below the sample size that makes it meaningful, and "not enough data
 * yet" is a valid, visible answer.
 */

import type { Difficulty, ItemType } from '../domain/types';
import type { DomainId, SectionId, SkillId } from '../domain/taxonomy';
import { getSection } from '../domain/taxonomy';

/** One attempt, flattened with the item facts the analysis needs. */
export interface AttemptSample {
  itemId: string;
  section: SectionId;
  domain: DomainId;
  skill: SkillId;
  difficulty: Difficulty;
  itemType: ItemType;
  correct: boolean;
  responseTimeMs: number;
  answeredAt: string;
}

/** Below this, a bucket is reported as "not enough data" rather than a number. */
export const MIN_SAMPLE = 8;

/**
 * Seconds per question implied by the real test: 64 minutes for 54 R&W
 * questions, 70 for 44 Math. Not a target to hit exactly — it is the average
 * available, and hard questions are meant to run long.
 */
export function benchmarkSeconds(section: SectionId): number {
  const spec = getSection(section);
  return (spec.minutes * 60) / spec.questionCount;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface PacingBucket {
  label: string;
  attempts: number;
  /** Median seconds per question. Median, not mean — one interruption where
   *  the student put the phone down would wreck a mean. */
  medianSeconds: number;
  benchmarkSeconds: number;
  accuracy: number;
  /** Enough data to say anything. */
  reliable: boolean;
}

export type PacingVerdict =
  | 'on_pace'
  | 'too_slow'
  | 'rushing'
  | 'insufficient_data';

export interface PacingReport {
  overall: PacingBucket;
  bySection: PacingBucket[];
  byDifficulty: PacingBucket[];
  verdict: PacingVerdict;
  /** One sentence the student can act on. */
  message: string;
}

function bucket(label: string, samples: AttemptSample[], section?: SectionId): PacingBucket {
  const times = samples.map((s) => s.responseTimeMs / 1000);
  const correct = samples.filter((s) => s.correct).length;

  // With mixed sections, weight the benchmark by how many of each appeared.
  const benchmark =
    section !== undefined
      ? benchmarkSeconds(section)
      : samples.length === 0
        ? 0
        : samples.reduce((sum, s) => sum + benchmarkSeconds(s.section), 0) / samples.length;

  return {
    label,
    attempts: samples.length,
    medianSeconds: Math.round(median(times)),
    benchmarkSeconds: Math.round(benchmark),
    accuracy: samples.length === 0 ? 0 : correct / samples.length,
    reliable: samples.length >= MIN_SAMPLE,
  };
}

/**
 * Judge pacing.
 *
 * "Rushing" is the interesting case and the reason accuracy is part of the
 * verdict: finishing early is only a problem if it comes with errors. A student
 * who is fast *and* accurate is not rushing, they are just good, and telling
 * them to slow down would be wrong.
 */
export function verdictFor(bucketToJudge: PacingBucket): PacingVerdict {
  if (!bucketToJudge.reliable) return 'insufficient_data';

  const ratio = bucketToJudge.medianSeconds / (bucketToJudge.benchmarkSeconds || 1);
  if (ratio > 1.25) return 'too_slow';
  if (ratio < 0.65 && bucketToJudge.accuracy < 0.7) return 'rushing';
  return 'on_pace';
}

const MESSAGES: Record<PacingVerdict, (b: PacingBucket) => string> = {
  insufficient_data: (b) =>
    `${b.attempts} of ${MIN_SAMPLE} answers needed before pacing means anything.`,
  on_pace: (b) =>
    `About ${b.medianSeconds}s per question against roughly ${b.benchmarkSeconds}s available. That works.`,
  too_slow: (b) =>
    `About ${b.medianSeconds}s per question, against roughly ${b.benchmarkSeconds}s available. On a real module that runs out of time before the end.`,
  rushing: (b) =>
    `Fast at about ${b.medianSeconds}s per question, but only ${Math.round(b.accuracy * 100)}% correct. The time saved is costing marks.`,
};

export function buildPacingReport(samples: AttemptSample[]): PacingReport {
  const overall = bucket('Overall', samples);
  const verdict = verdictFor(overall);

  const bySection = (['rw', 'math'] as SectionId[])
    .map((section) =>
      bucket(
        getSection(section).name,
        samples.filter((s) => s.section === section),
        section
      )
    )
    .filter((b) => b.attempts > 0);

  const byDifficulty = (['easy', 'medium', 'hard'] as Difficulty[])
    .map((difficulty) =>
      bucket(
        difficulty[0]!.toUpperCase() + difficulty.slice(1),
        samples.filter((s) => s.difficulty === difficulty)
      )
    )
    .filter((b) => b.attempts > 0);

  return {
    overall,
    bySection,
    byDifficulty,
    verdict,
    message: MESSAGES[verdict](overall),
  };
}

// ---------------------------------------------------------------------------
// Accuracy breakdowns
// ---------------------------------------------------------------------------

export interface AccuracyRow {
  key: string;
  label: string;
  correct: number;
  total: number;
  accuracy: number;
  reliable: boolean;
}

function accuracyRows<T extends string>(
  samples: AttemptSample[],
  keyOf: (s: AttemptSample) => T,
  labelOf: (key: T) => string
): AccuracyRow[] {
  const groups = new Map<T, AttemptSample[]>();
  for (const sample of samples) {
    const key = keyOf(sample);
    const list = groups.get(key) ?? [];
    list.push(sample);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const correct = group.filter((s) => s.correct).length;
      return {
        key,
        label: labelOf(key),
        correct,
        total: group.length,
        accuracy: correct / group.length,
        reliable: group.length >= MIN_SAMPLE,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

/**
 * Accuracy by difficulty band.
 *
 * The shape matters more than the levels. Accuracy that barely falls from easy
 * to hard usually means the difficulty labels are wrong, not that the student
 * is uniformly strong — and since those labels are a frozen input to the Elo
 * model, that is worth noticing.
 */
export function accuracyByDifficulty(samples: AttemptSample[]): AccuracyRow[] {
  return accuracyRows(
    samples,
    (s) => s.difficulty,
    (key) => key[0]!.toUpperCase() + key.slice(1)
  );
}

/** Multiple choice vs student-produced response — different failure modes. */
export function accuracyByItemType(samples: AttemptSample[]): AccuracyRow[] {
  return accuracyRows(
    samples,
    (s) => s.itemType,
    (key) => (key === 'mcq' ? 'Multiple choice' : 'Student-produced response')
  );
}

export function accuracyBySkill(
  samples: AttemptSample[],
  labelOf: (skill: SkillId) => string
): AccuracyRow[] {
  return accuracyRows(samples, (s) => s.skill, labelOf as (k: string) => string);
}

/**
 * Skills worth working on next: weakest first, but only those with enough
 * attempts to be sure, and only those actually below par.
 */
export function weakestSkills(
  samples: AttemptSample[],
  labelOf: (skill: SkillId) => string,
  limit = 5
): AccuracyRow[] {
  return accuracyBySkill(samples, labelOf)
    .filter((row) => row.reliable && row.accuracy < 0.7)
    .slice(0, limit);
}
