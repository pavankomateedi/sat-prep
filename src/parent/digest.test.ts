import { describe, expect, it } from 'vitest';
import { missingDigestWeeks, pendingDigestWeek } from './summary';

describe('weekly digest scheduling (T-20)', () => {
  const programStart = '2026-09-01';

  it('owes a digest for the week that just ended', () => {
    // 2026-09-21 is a Monday; the completed week began 2026-09-14.
    expect(pendingDigestWeek('2026-09-21', new Set(), programStart)).toBe('2026-09-14');
  });

  it('is idempotent — no second digest once one exists for that week', () => {
    const generated = new Set(['2026-09-14']);
    expect(pendingDigestWeek('2026-09-21', generated, programStart)).toBeNull();
    // Still nothing owed later in the same week, so a task that fires daily
    // does not produce a digest a day.
    expect(pendingDigestWeek('2026-09-24', generated, programStart)).toBeNull();
  });

  it('still produces exactly one digest when the device was offline for days', () => {
    // Catching up on a Thursday must not generate a second copy.
    const first = pendingDigestWeek('2026-09-24', new Set(), programStart);
    expect(first).toBe('2026-09-14');
    expect(pendingDigestWeek('2026-09-24', new Set([first!]), programStart)).toBeNull();
  });

  it('does not reach back before the programme started', () => {
    expect(pendingDigestWeek('2026-09-02', new Set(), programStart)).toBeNull();
  });

  it('lists every missed week after a long gap, newest first and bounded', () => {
    const missing = missingDigestWeeks('2026-11-16', new Set(), programStart);
    expect(missing.length).toBeGreaterThan(1);
    expect(missing[0]).toBe('2026-11-09');
    // Newest first.
    expect([...missing].sort().reverse()).toEqual(missing);
    // Never earlier than the programme start week.
    for (const week of missing) expect(week >= '2026-08-31').toBe(true);
  });

  it('honours the backfill limit so a long absence cannot flood the parent', () => {
    const missing = missingDigestWeeks('2027-06-01', new Set(), programStart, 4);
    expect(missing).toHaveLength(4);
  });

  it('skips weeks that already have a digest when backfilling', () => {
    const generated = new Set(['2026-11-02']);
    const missing = missingDigestWeeks('2026-11-16', generated, programStart);
    expect(missing).not.toContain('2026-11-02');
    expect(missing).toContain('2026-11-09');
  });
});
