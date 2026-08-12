import { describe, expect, it } from 'vitest';
import {
  PERCENTILE_DISCLAIMER,
  percentileBand,
  percentileFor,
  scoreForPercentile,
} from './percentiles';

describe('percentile context (PRD §4.1 gap)', () => {
  it('increases monotonically with score', () => {
    let previous = -1;
    for (let score = 400; score <= 1600; score += 10) {
      const percentile = percentileFor(score);
      expect(percentile, `score ${score}`).toBeGreaterThanOrEqual(previous);
      previous = percentile;
    }
  });

  it('stays inside 1-99 across the whole scale', () => {
    for (let score = 400; score <= 1600; score += 50) {
      expect(percentileFor(score)).toBeGreaterThanOrEqual(1);
      expect(percentileFor(score)).toBeLessThanOrEqual(99);
    }
  });

  it('places a mid-scale score near the middle of the distribution', () => {
    // ~1100 is close to the national median.
    expect(percentileFor(1100)).toBeGreaterThan(40);
    expect(percentileFor(1100)).toBeLessThan(60);
  });

  it('clamps scores outside the reportable range', () => {
    expect(percentileFor(200)).toBe(percentileFor(400));
    expect(percentileFor(2000)).toBe(percentileFor(1600));
  });

  it('reports a band rather than a point, mirroring the score band', () => {
    const band = percentileBand(1200, 60);
    expect(band.low).toBeLessThan(band.high);
    expect(band.label).toMatch(/percentile/);
    expect(band.label).toContain('–');
    expect(band.disclaimer).toBe(PERCENTILE_DISCLAIMER);
  });

  it('collapses to a single percentile only when the band genuinely does', () => {
    const band = percentileBand(1600, 20);
    expect(band.low).toBe(band.high);
    expect(band.label).not.toContain('–');
  });

  it('interprets bands in plain language without overclaiming', () => {
    expect(percentileBand(1500, 40).interpretation).toMatch(/nine in ten/);
    expect(percentileBand(1150, 40).interpretation).toMatch(/median/);
    expect(percentileBand(700, 40).interpretation).toMatch(/starting point/);
  });

  it('inverts to a target score', () => {
    const score = scoreForPercentile(75);
    expect(score).toBeGreaterThan(1200);
    expect(score).toBeLessThan(1350);
    // Round-trips back to approximately the requested percentile.
    expect(Math.abs(percentileFor(score) - 75)).toBeLessThanOrEqual(3);
  });

  it('reports scores in 10-point increments', () => {
    for (const target of [10, 25, 50, 75, 90, 99]) {
      expect(scoreForPercentile(target) % 10).toBe(0);
    }
  });
});
