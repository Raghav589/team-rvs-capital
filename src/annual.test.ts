import { describe, expect, it } from 'vitest';
import { ANNUAL_DEFAULTS, annualCase, fiveYears, kiranaEstimate } from './annual';

describe('annual base case on Valmo', () => {
  const b = annualCase();

  it('applies the RTO rate to shipped orders, on Valmo’s share', () => {
    expect(b.rtoRate).toBeCloseTo(0.17, 9);
    expect(b.rto).toBeCloseTo(286.8 * 0.8 * 0.5 * 0.17, 6);
    expect(b.pool).toBeCloseTo(b.rto * 0.85 * 0.7, 6);
  });

  it('the lines add up to the net', () => {
    expect(Object.values(b.lines).reduce((t, v) => t + v, 0)).toBeCloseTo(b.net, 6);
  });

  it('the offered parcels match the per-parcel plan for an average order', () => {
    const fromPlan = b.pool * (b.plan.meesho.buyBefore - b.plan.meesho.today) + b.lines.notIncremental;
    expect(fromPlan).toBeCloseTo(b.net, 6);
  });

  it('counting more resales as new orders raises the result', () => {
    const at = (incremental: number) => annualCase(undefined, { ...ANNUAL_DEFAULTS, incremental }).net;
    expect(at(0)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(at(1));
  });

  it('all Meesho shipments is exactly twice Valmo’s half', () => {
    expect(annualCase(undefined, { ...ANNUAL_DEFAULTS, valmoShare: 1 }).net).toBeCloseTo(2 * b.net, 6);
  });

  it('reports delivery, returns and resale separately; only the cap test touches delivery', () => {
    const o = b.outcomes;
    expect(o.deliveredNewPct).toBe(o.deliveredTodayPct);
    expect(o.deliveredWithCapPct).toBeLessThan(o.deliveredTodayPct);
    const c = b.capTest;
    expect(c.lostDeliveries).toBeCloseTo(c.capped / 0.8 * 0.2 * 0.5, 9);
    expect(c.net).toBeCloseTo(c.fewerAttempts + c.lostSales, 9);
    expect(o.returnedPctOfRto + o.resoldPctOfRto + o.bulkPctOfRto).toBeCloseTo(1, 9);
  });

  it('five years scale the full-scale year by growth and rollout', () => {
    const f = fiveYears(100);
    expect(f.net[4]).toBeCloseTo(100 * 1.15 ** 5, 6);
    expect(f.total).toBeCloseTo(f.net.reduce((t, v) => t + v, 0), 9);
  });

  it('a combined downside is worse than any single stress', () => {
    const down = annualCase(undefined, { ...ANNUAL_DEFAULTS, eligible: 0.75 }, { shoppersPerDay: 16, reach: 0.7, conversion: 0.02 }, { widenSlow: 0.7, extraCost: 4 }).net;
    expect(down).toBeLessThan(annualCase(undefined, { ...ANNUAL_DEFAULTS, eligible: 0.75 }).net);
    expect(down).toBeLessThan(b.net);
  });

  it('a kirana’s pickups are its shelf collections plus same-day flash-sale pickups', () => {
    const e = kiranaEstimate(5);
    expect(e.pickupsPerDay).toBeCloseTo(e.heldPickupsPerDay + e.flashPickupsPerDay, 9);
    expect(e.heldPickupsPerDay).toBeLessThan(e.holdsPerDay);
    expect(kiranaEstimate(1).monthly).toBeLessThan(e.monthly); // a tiny shelf takes only what fits
  });
});
