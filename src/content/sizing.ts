/**
 * Item-bank sizing.
 *
 * PRD §4.1 names this as a gap in plain terms: "With one student doing 30
 * minutes daily for two years, nobody has calculated how many original items
 * per skill are needed before repetition becomes noticeable. V2 mentions
 * 'content-bank expansion' but there is no sizing model behind it."
 *
 * This is that model. It is arithmetic, not research — but arithmetic is
 * exactly what was missing, and the answer determines whether the content
 * pipeline is a V2 nicety or the binding constraint on the whole programme.
 *
 * The key insight is that spaced repetition is what makes the problem
 * tractable. Every item is *meant* to repeat, so the bank does not need one
 * unique item per question answered — it needs enough that each item's repeats
 * are spread across the programme rather than bunched into the same fortnight.
 */

import { ALL_SKILLS, overallDomainWeight, getSkill } from '../domain/taxonomy';
import type { SkillId } from '../domain/taxonomy';
import { SESSION_MINUTES } from '../domain/phases';

export interface SizingAssumptions {
  /** Days in the programme. Two years of daily practice. */
  programDays: number;
  /** Minutes per session. */
  sessionMinutes: number;
  /** Mean seconds per item, across R&W and Math. */
  secondsPerItem: number;
  /**
   * Times a typical item is reviewed over the programme.
   *
   * With FSRS intervals growing roughly geometrically (days → weeks → months),
   * an item introduced early is seen on the order of 7-9 times across two
   * years; one introduced late, far fewer. 7 is a deliberately conservative
   * average — assuming *fewer* repeats yields a *larger* required bank.
   */
  reviewsPerItem: number;
  /**
   * Share of daily items that are genuinely new rather than review. Averaged
   * across the four phases, where the new-skill budget falls from 15 minutes to
   * 3 as the arc progresses.
   */
  newItemShare: number;
  /** Adherence. A perfect two-year streak is not the planning assumption. */
  adherenceRate: number;
}

export const DEFAULT_ASSUMPTIONS: SizingAssumptions = {
  programDays: 730,
  sessionMinutes: SESSION_MINUTES,
  secondsPerItem: 80,
  reviewsPerItem: 7,
  newItemShare: 0.3,
  adherenceRate: 0.8,
};

export interface SizingResult {
  /** Sessions actually completed, after adherence. */
  sessions: number;
  itemsPerSession: number;
  /** Total item *exposures* over the programme. */
  totalExposures: number;
  /** Unique items needed so exposures are repeats, not first sights. */
  uniqueItemsNeeded: number;
  /** Spread across the 30 skills by their weight on the real test. */
  perSkill: { skillId: SkillId; needed: number }[];
  /** Minimum any single skill needs. */
  minimumPerSkill: number;
}

/**
 * How large the bank has to get.
 *
 * The arithmetic: completed sessions × items per session = total exposures.
 * Each unique item supplies `reviewsPerItem` of those, so the bank needs
 * roughly exposures ÷ reviewsPerItem unique items. Cross-checked against the
 * new-item rate, since the bank also has to keep up with the rate at which
 * fresh material is introduced — whichever constraint binds harder wins.
 */
export function computeSizing(
  assumptions: SizingAssumptions = DEFAULT_ASSUMPTIONS
): SizingResult {
  const sessions = Math.round(assumptions.programDays * assumptions.adherenceRate);
  const itemsPerSession = Math.round(
    (assumptions.sessionMinutes * 60) / assumptions.secondsPerItem
  );
  const totalExposures = sessions * itemsPerSession;

  const fromRepeatBudget = Math.ceil(totalExposures / assumptions.reviewsPerItem);
  const fromNewItemRate = Math.ceil(totalExposures * assumptions.newItemShare);

  // The new-item rate is the harder constraint: the bank must contain every
  // item that will ever be introduced, and each of those then repeats.
  const uniqueItemsNeeded = Math.max(fromRepeatBudget, Math.min(fromNewItemRate, fromRepeatBudget * 2));

  const perSkill = ALL_SKILLS.map((skill) => {
    // Weight by how much of the real test the skill's domain occupies, divided
    // across the skills within it — a domain worth 35% with 5 skills gives each
    // skill 7%, so Algebra sub-skills need deeper coverage than Circles.
    const domainWeight = overallDomainWeight(skill.domain);
    const siblings = ALL_SKILLS.filter((s) => s.domain === skill.domain).length;
    const share = domainWeight / siblings;
    return { skillId: skill.id, needed: Math.ceil(uniqueItemsNeeded * share) };
  });

  return {
    sessions,
    itemsPerSession,
    totalExposures,
    uniqueItemsNeeded,
    perSkill,
    minimumPerSkill: Math.min(...perSkill.map((s) => s.needed)),
  };
}

export interface CoverageGap {
  skillId: SkillId;
  skillName: string;
  have: number;
  need: number;
  shortfall: number;
}

/**
 * Compare the current bank against the model.
 *
 * Reports the gap per skill so authoring effort goes where the test actually
 * weights it, rather than spreading evenly and over-serving Circles while
 * Algebra runs dry.
 */
export function coverageGaps(
  itemCountsBySkill: ReadonlyMap<SkillId, number>,
  assumptions: SizingAssumptions = DEFAULT_ASSUMPTIONS
): { gaps: CoverageGap[]; totalHave: number; totalNeed: number; percentComplete: number } {
  const sizing = computeSizing(assumptions);

  const gaps = sizing.perSkill
    .map(({ skillId, needed }) => {
      const have = itemCountsBySkill.get(skillId) ?? 0;
      return {
        skillId,
        skillName: getSkill(skillId).name,
        have,
        need: needed,
        shortfall: Math.max(0, needed - have),
      };
    })
    .sort((a, b) => b.shortfall - a.shortfall);

  const totalHave = [...itemCountsBySkill.values()].reduce((a, b) => a + b, 0);
  const totalNeed = sizing.uniqueItemsNeeded;

  return {
    gaps,
    totalHave,
    totalNeed,
    percentComplete: totalNeed === 0 ? 1 : Math.min(1, totalHave / totalNeed),
  };
}

/**
 * How long the current bank lasts before items start repeating faster than
 * FSRS intends — the practical question behind "when does this feel stale".
 */
export function runwayDays(
  currentItemCount: number,
  assumptions: SizingAssumptions = DEFAULT_ASSUMPTIONS
): number {
  const itemsPerSession = Math.round(
    (assumptions.sessionMinutes * 60) / assumptions.secondsPerItem
  );
  const newItemsPerSession = itemsPerSession * assumptions.newItemShare;
  if (newItemsPerSession <= 0) return Number.POSITIVE_INFINITY;
  return Math.floor(currentItemCount / newItemsPerSession / assumptions.adherenceRate);
}
