import { describe, expect, it } from 'vitest';
import { computeSizing, coverageGaps, DEFAULT_ASSUMPTIONS, runwayDays } from './sizing';
import { checkFreshness, FRESHNESS_CHECKLIST } from './freshness';
import { ITEMS } from '../../content';
import { ALL_SKILLS, type SkillId } from '../domain/taxonomy';
import { addDays, toLocalDate } from '../lib/dates';

describe('item-bank sizing (PRD §4.1 gap)', () => {
  it('produces a defensible target from the daily-session arithmetic', () => {
    const sizing = computeSizing();

    // 730 days at 80% adherence.
    expect(sizing.sessions).toBe(584);
    // 30 minutes at 80 seconds per item.
    expect(sizing.itemsPerSession).toBe(23);
    expect(sizing.totalExposures).toBe(584 * 23);

    // The bank must be far smaller than total exposures — that is what spaced
    // repetition buys — but still substantial.
    expect(sizing.uniqueItemsNeeded).toBeLessThan(sizing.totalExposures);
    expect(sizing.uniqueItemsNeeded).toBeGreaterThan(1000);

    // Pinned so docs/CONTENT.md cannot drift away from the model it quotes.
    expect(sizing.totalExposures).toBe(13_432);
    expect(sizing.uniqueItemsNeeded).toBe(3_838);
  });

  it('pins the runway of the shipped bank', () => {
    // The headline finding, and the reason the generator pipeline exists: even
    // after a second authoring pass the bank covers only a couple of months of
    // genuinely new material. Content expansion is a dependency, not a V2
    // nicety. Update these pins whenever the bank grows — docs/CONTENT.md
    // quotes them.
    expect(ITEMS.length).toBe(274);
    expect(runwayDays(ITEMS.length)).toBe(49);
  });

  it('needs a larger bank when items repeat less often', () => {
    const fewRepeats = computeSizing({ ...DEFAULT_ASSUMPTIONS, reviewsPerItem: 4 });
    const manyRepeats = computeSizing({ ...DEFAULT_ASSUMPTIONS, reviewsPerItem: 12 });
    expect(fewRepeats.uniqueItemsNeeded).toBeGreaterThan(manyRepeats.uniqueItemsNeeded);
  });

  it('allocates more items to heavily-weighted skills', () => {
    const sizing = computeSizing();
    const needBySkill = new Map(sizing.perSkill.map((s) => [s.skillId, s.needed]));

    // Algebra is 35% of Math; Circles is one of four skills in a 15% domain.
    expect(needBySkill.get('linear_functions')!).toBeGreaterThan(needBySkill.get('circles')!);
    // Every skill still gets a real allocation.
    expect(sizing.minimumPerSkill).toBeGreaterThan(0);
  });

  it('reports the current bank as an early-but-usable fraction of the target', () => {
    const counts = new Map<SkillId, number>();
    for (const skill of ALL_SKILLS) {
      counts.set(skill.id, ITEMS.filter((i) => i.skills[0] === skill.id).length);
    }

    const { totalHave, totalNeed, percentComplete, gaps } = coverageGaps(counts);
    expect(totalHave).toBe(ITEMS.length);
    expect(totalNeed).toBeGreaterThan(totalHave);
    expect(percentComplete).toBeGreaterThan(0);
    expect(percentComplete).toBeLessThan(1);

    // Sorted worst-first so authoring effort has an obvious target.
    expect(gaps[0]!.shortfall).toBeGreaterThanOrEqual(gaps[gaps.length - 1]!.shortfall);
  });

  it('estimates how many days the current bank lasts', () => {
    const days = runwayDays(ITEMS.length);
    // The seed bank should carry the student for a meaningful stretch, but
    // nothing like the full two years — which is exactly the finding that
    // makes content expansion a real dependency rather than a V2 nicety.
    expect(days).toBeGreaterThan(20);
    expect(days).toBeLessThan(730);
  });
});

describe('content freshness (PRD §4.1 gap)', () => {
  const verified = '2026-07-31';

  it('is fresh immediately after verification', () => {
    const status = checkFreshness('2026-08-01', [], verified);
    expect(status.stale).toBe(false);
    expect(status.daysSinceVerified).toBe(1);
  });

  it('goes stale after the routine interval', () => {
    const status = checkFreshness(addDays(verified, 130), [], verified);
    expect(status.stale).toBe(true);
    expect(status.reason).toMatch(/has not been checked/);
  });

  it('goes stale early when a real test is approaching', () => {
    // Only 40 days since verification, but a test is three weeks away.
    const status = checkFreshness(addDays(verified, 40), [addDays(verified, 60)], verified);
    expect(status.stale).toBe(true);
    expect(status.reason).toMatch(/real test is/);
  });

  it('ignores test dates that have already passed', () => {
    const status = checkFreshness(addDays(verified, 40), [addDays(verified, -10)], verified);
    expect(status.stale).toBe(false);
  });

  it('tells the checker what to actually look at', () => {
    expect(FRESHNESS_CHECKLIST.length).toBeGreaterThan(3);
    expect(FRESHNESS_CHECKLIST.join(' ')).toMatch(/weights/i);
    expect(FRESHNESS_CHECKLIST.join(' ')).toMatch(/[Tt]iming/);
  });

  it('defaults to today without blowing up', () => {
    expect(() => checkFreshness(toLocalDate())).not.toThrow();
  });
});
