import { describe, expect, it } from 'vitest';
import {
  assertClean,
  PrivacyViolationError,
  screen,
  screenParentPayload,
} from './policy';
import { buildWeeklySummary, renderSummary } from '../parent/summary';
import { MIGRATIONS } from '../data/migrations';
import { FORBIDDEN_FIELDS } from './policy';

describe('data-minimisation screen (T-13)', () => {
  it('passes a normal attempt payload', () => {
    expect(
      screen({
        id: 'a1',
        itemId: 'm-lin1-001',
        answeredAt: '2026-09-15T07:00:00Z',
        correct: true,
        responseTimeMs: 41_000,
        grade: 'good',
      })
    ).toEqual([]);
  });

  it('rejects forbidden field names anywhere in the payload', () => {
    const violations = screen({ student: { displayName: 'V', phoneNumber: '5558675309' } });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.path).toBe('student.phoneNumber');
    expect(violations[0]!.kind).toBe('forbidden_field');
  });

  it('rejects forbidden values hiding in permitted fields', () => {
    // The subtle case: the column is legitimate, the content is not.
    const violations = screen({ displayName: 'student@example.com' });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toBe('forbidden_value');
    expect(violations[0]!.detail).toMatch(/email/);
  });

  it('detects phone numbers, SSNs, and street addresses in free text', () => {
    expect(screen({ note: 'call 555-867-5309' })[0]?.detail).toMatch(/phone/);
    expect(screen({ note: '123-45-6789' })[0]?.detail).toMatch(/Social Security/);
    expect(screen({ note: '42 Maple Street' })[0]?.detail).toMatch(/street address/);
  });

  it('permits an account identifier only on the auth payload', () => {
    const payload = { email: 'parent@example.com' };
    expect(screen(payload)).not.toEqual([]);
    expect(screen(payload, { allowAuthIdentifier: true })).toEqual([]);
  });

  it('throws with an actionable message when asserting a dirty payload', () => {
    expect(() => assertClean({ latitude: 51.5, longitude: -0.1 })).toThrow(
      PrivacyViolationError
    );
    try {
      assertClean({ ssn: '123-45-6789' });
    } catch (error) {
      expect((error as Error).message).toMatch(/PRD §2.7/);
    }
  });

  it('survives cyclic structures without hanging', () => {
    const cyclic: Record<string, unknown> = { name: 'ok' };
    cyclic.self = cyclic;
    expect(() => screen(cyclic)).not.toThrow();
  });
});

describe('schema-level minimisation', () => {
  it('declares no columns for forbidden data', () => {
    const sql = MIGRATIONS.map((m) => m.sql).join('\n').toLowerCase();

    // A handful of forbidden names are substrings of legitimate SQL or column
    // names, so match them as whole column-ish tokens.
    for (const field of FORBIDDEN_FIELDS) {
      const token = field.toLowerCase();
      if (token === 'address') continue; // covered by street_address / ip_address
      const pattern = new RegExp(`(^|[\\s,(])${token}\\s+(text|integer|real|blob)`, 'm');
      expect(pattern.test(sql), `schema declares a "${field}" column`).toBe(false);
    }
  });

  it('stores a nickname rather than a legal name', () => {
    const sql = MIGRATIONS.map((m) => m.sql).join('\n');
    expect(sql).toMatch(/display_name\s+TEXT NOT NULL/);
    expect(sql).not.toMatch(/legal_name/);
  });
});

describe('parent-viewer scope (T-12)', () => {
  const base = {
    studentId: 's1',
    weekOf: '2026-09-16',
    // Mon, Tue, Thu, Sun — four days spread across the week, ending practised,
    // so there is no trailing run of missed days to flag.
    practisedDates: new Set(['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-20']),
    minutesByDate: new Map([
      ['2026-09-14', 30],
      ['2026-09-15', 31],
      ['2026-09-17', 28],
      ['2026-09-20', 30],
    ]),
    masteryByDomain: new Map([
      ['algebra' as const, 0.62],
      ['circles' as never, 0.4],
    ]),
    previousMasteryByDomain: new Map([['algebra' as const, 0.55]]),
    latestResult: null,
    programStartDate: '2026-09-01',
    now: new Date('2026-09-21T09:00:00Z'),
  };

  it('reports adherence and domain movement for the week', () => {
    const summary = buildWeeklySummary(base);
    expect(summary.weekStart).toBe('2026-09-14');
    expect(summary.daysPracticed).toBe(4);
    expect(summary.daysInWeek).toBe(7);
    expect(summary.totalMinutes).toBe(119);

    const algebra = summary.domainTrends.find((t) => t.domain === 'algebra')!;
    expect(algebra.masteryPercent).toBe(62);
    expect(algebra.deltaFromPreviousWeek).toBe(7);
  });

  it('covers all eight domains even when some have no data yet', () => {
    const summary = buildWeeklySummary(base);
    expect(summary.domainTrends).toHaveLength(8);
  });

  it('raises an adherence alert after a run of missed days', () => {
    const quiet = buildWeeklySummary({
      ...base,
      practisedDates: new Set(['2026-09-14']),
      minutesByDate: new Map([['2026-09-14', 30]]),
    });
    expect(quiet.currentMissedStreak).toBeGreaterThanOrEqual(3);
    expect(quiet.adherenceAlert).toMatch(/check-in/);
  });

  it('stays silent when adherence is fine', () => {
    expect(buildWeeklySummary(base).adherenceAlert).toBeNull();
  });

  it('exposes nothing outside the agreed parent scope', () => {
    const summary = buildWeeklySummary(base);
    expect(screenParentPayload(summary as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('rejects any attempt to add item-level data to the parent payload', () => {
    const leaky = {
      ...buildWeeklySummary(base),
      wrongAnswers: [{ itemId: 'm-lin1-001', response: 'C' }],
    };
    const violations = screenParentPayload(leaky as unknown as Record<string, unknown>);
    expect(violations.some((v) => v.path === 'wrongAnswers')).toBe(true);
  });

  it('renders the score as a range, never a bare point estimate', () => {
    const withScore = buildWeeklySummary({
      ...base,
      latestResult: {
        id: 't1',
        studentId: 's1',
        kind: 'diagnostic',
        takenOn: '2026-09-10',
        sectionScores: [],
        domainScores: [],
        totalScaled: 1120,
        confidenceHalfWidth: 60,
        attemptIds: [],
        synced: false,
      },
    });

    const rendered = renderSummary(withScore);
    expect(rendered.scoreLine).toContain('1060-1180');
    expect(rendered.scoreLine).not.toMatch(/\b1120\b/);
  });

  it('names improving and struggling domains for the parent', () => {
    const rendered = renderSummary(buildWeeklySummary(base));
    expect(rendered.improving[0]!.name).toBe('Algebra');
    expect(rendered.improving[0]!.delta).toBe(7);
    expect(rendered.headline).toMatch(/4 of 7 days/);
  });
});
