import { describe, expect, it } from 'vitest';
import { decideTier } from './model';
import { HUBS, KIRANAS, PINCODES, RIDERS, SELLERS, buildWorld, reasonInfo } from './seed';

describe('seed world', () => {
  const w = buildWorld();

  it('is deterministic', () => {
    expect(JSON.stringify(buildWorld())).toBe(JSON.stringify(w));
  });

  it('has the spec’s cast', () => {
    expect(w.parcels.length).toBeGreaterThanOrEqual(37);
    expect(w.parcels.length).toBeLessThanOrEqual(42);
    expect(RIDERS.length).toBe(6);
    expect(HUBS.length).toBe(3);
    expect(KIRANAS.filter((k) => k.kind === 'kirana').length).toBe(8);
    expect(KIRANAS.filter((k) => k.kind === 'depot').length).toBe(3);
    expect(KIRANAS.filter((k) => k.kind === 'depot').every((d) => d.partnerId)).toBe(true);
    expect(w.buyers.length).toBe(20);
    expect(PINCODES.length).toBe(4);
    expect(SELLERS.length).toBe(6);
  });

  it('Keshav starts Tier 1, Harshita Tier 2, and there is a Tier 3 buyer', () => {
    const tier = (id: string) => {
      const b = w.buyers.find((x) => x.id === id)!;
      return decideTier(b.customerCausedRtos, b.orders, b.trustMesh).tier;
    };
    expect(tier('B01')).toBe(1);
    expect(tier('B02')).toBe(2);
    expect(tier('B08')).toBe(3);
  });

  it('most buyers are Tier 1, a few Tier 2, at least one Tier 3', () => {
    const tiers = w.buyers.map((b) => decideTier(b.customerCausedRtos, b.orders, b.trustMesh).tier);
    const n = (t: number) => tiers.filter((x) => x === t).length;
    expect(n(1)).toBeGreaterThanOrEqual(12);
    expect(n(2)).toBeGreaterThanOrEqual(2);
    expect(n(3)).toBeGreaterThanOrEqual(1);
  });

  it('Archit has a far drop over 10 km', () => {
    const route = w.parcels.filter((p) => p.riderId === 'R1' && p.status === 'out_for_delivery');
    expect(route.length).toBe(8);
    expect(route.some((p) => p.distanceKm > 10)).toBe(true);
  });

  it('historical tags land near the deck cause split and flag one partner outlier', () => {
    const fails = w.logs.filter((l) => l.reason);
    const share = (c: string) => fails.filter((l) => reasonInfo(l.reason!).cause === c).length / fails.length;
    expect(share('commitment')).toBeGreaterThan(0.55);
    expect(share('commitment')).toBeLessThan(0.8);
    const partnerRate = (pid: string) => {
      const logs = w.logs.filter((l) => l.partnerId === pid);
      return logs.filter((l) => l.reason && reasonInfo(l.reason).blame === 'partner').length / logs.length;
    };
    const mean = (partnerRate('P1') + partnerRate('P2') + partnerRate('P3')) / 3;
    // Engine flags a partner as an outlier above 1.5× the network mean.
    expect(partnerRate('P3')).toBeGreaterThan(mean * 1.5);
    expect(partnerRate('P1')).toBeLessThan(mean * 1.5);
    expect(partnerRate('P2')).toBeLessThan(mean * 1.5);
  });
});
