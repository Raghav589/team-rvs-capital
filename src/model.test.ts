import { describe, expect, it } from 'vitest';
import {
  ownershipPlan,
  FAST_SELL,
  buyPlan,
  PICKUP_DEFAULTS,
  pickupVsHome,
  refusedParcel,
  DEMAND_DEFAULTS,
  buyDecision,
  estimateMargin,
  flashSellThrough,
  BUYBACK_DEFAULTS,
  buyBackQuote,
  DEFAULTS,
  causeSplit,
  compareModes,
  componentSum,
  computeModel,
  decideTier,
  holdingNeed,
  ladder,
  meeshoReply,
  partnerEstimate,
  paths,
  sellerOutlook,
  parcelEV,
  sensitivity,
  unitCosts,
  volumes,
} from './model';

const near = (actual: number, expected: number, tol: number) =>
  expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol);

const deck = computeModel(DEFAULTS, 'acquire');
const row = (key: string) => deck.rows.find((r) => r.key === key)!;

describe('deck reproduction — volumes', () => {
  it('RTO volume is 48.756 Cr, 94% COD', () => {
    const v = volumes(DEFAULTS);
    near(v.rto, 48.756, 0.0005);
    near(v.rtoCod, 45.888, 0.0005);
    near(v.rtoPrepaid, 2.868, 0.0005);
    near(v.rtoCod / v.rto, 0.94, 0.005);
  });

  it('cascade matches the deck (Cr orders)', () => {
    near(row('A').volume, 14.627, 0.001);
    near(deck.volumes.poolB, 34.129, 0.001);
    near(row('B1').volume, 13.652, 0.001);
    near(row('W1').volume, 10.239, 0.001);
    near(row('W2').volume, 5.119, 0.001);
    near(row('W3').volume, 2.56, 0.001);
    near(row('W4').volume, 1.28, 0.001);
    near(row('SALV').volume, 1.28, 0.001);
    near(deck.rows.reduce((t, r) => t + r.volume, 0), 48.756, 0.0005);
  });

  it('as a share of the B pool: 40 / 30 / 15 / 7.5 / 3.75 / 3.75', () => {
    const b = deck.volumes.poolB;
    [
      ['B1', 0.4],
      ['W1', 0.3],
      ['W2', 0.15],
      ['W3', 0.075],
      ['W4', 0.0375],
      ['SALV', 0.0375],
    ].forEach(([k, s]) => near(row(k as string).volume / b, s as number, 1e-9));
  });
});

describe('deck reproduction — unit costs (₹ per parcel)', () => {
  const u = unitCosts(DEFAULTS);
  it('network, baseline, Path A, sunk', () => {
    expect(u.networkOneWay).toBe(29);
    expect(u.baseline).toBe(121);
    near(u.avgAttempts, 2.6, 1e-9);
    near(u.pathA, 112.6, 1e-9);
    near(u.sunk, 83.6, 1e-9);
    near(u.acquisitionPrice, 233.86, 0.005);
    expect(u.fulfilment).toBe(10.5);
    near(u.storagePerWeek, 0.72, 0.005);
  });

  it('net cost per path matches the spec formulas', () => {
    near(row('A').netCost, 112.6, 0.005);
    near(row('B1').netCost, 15.21, 0.005);
    near(row('W1').netCost, 90.79, 0.005);
    near(row('W2').netCost, 118.09, 0.005);
    near(row('W3').netCost, 145.39, 0.005);
    near(row('W4').netCost, 172.68, 0.005);
    near(row('SALV').netCost, 242.33, 0.005);
  });

  it('component build-up equals the direct formula', () => {
    const d = DEFAULTS;
    const direct = {
      B1: u.sunk + u.acquisitionPrice + u.fulfilment - d.aov - d.platformRevenue,
      W3: u.sunk + u.acquisitionPrice + u.fulfilment + d.handling + d.commission + u.storagePerWeek * 3 - d.aov * 0.65 - d.platformRevenue,
      SALV: u.sunk + u.acquisitionPrice + d.handling + u.storagePerWeek * 4 - d.aov * d.salvageRate,
    };
    near(row('B1').netCost, direct.B1, 1e-9);
    near(row('W3').netCost, direct.W3, 1e-9);
    near(row('SALV').netCost, direct.SALV, 1e-9);
  });

  it('per-parcel saving vs baseline: +106 / +30 / +3 / −24 / −52 / −121', () => {
    expect(['B1', 'W1', 'W2', 'W3', 'W4', 'SALV'].map((k) => Math.round(row(k).saving))).toEqual([
      106, 30, 3, -24, -52, -121,
    ]);
  });

  it('weighted average saving per sell-off parcel ≈ ₹43.5', () => {
    near(deck.kpi.savingPerSellOff, 43.5, 0.05);
  });
});

describe('deck reproduction — annual P&L (₹ Cr)', () => {
  it('baseline ₹5,899 Cr → ₹4,292 Cr, saving ₹1,607 Cr', () => {
    near(deck.kpi.baselineLossCr, 5899, 2);
    near(deck.kpi.newLossCr, 4292, 2);
    near(deck.kpi.netImpactCr, 1607, 2);
    near(deck.kpi.baselineLossCr - deck.kpi.newLossCr, deck.kpi.netImpactCr, 1e-6);
  });

  it('per-path totals match the deck table', () => {
    const t: [string, number, number][] = [
      ['A', 1647, 123],
      ['B1', 208, 1444],
      ['W1', 930, 309],
      ['W2', 605, 15],
      ['W3', 372, -62],
      ['W4', 221, -66],
      ['SALV', 310, -155],
    ];
    t.forEach(([k, cost, saving]) => {
      near(row(k).totalCostCr, cost, 1);
      near(row(k).savingCr, saving, 1);
    });
  });

  it('result block KPIs', () => {
    near(deck.kpi.netImpactPct, 0.272, 0.0005);
    near(deck.kpi.savingPerRto, 32.97, 0.01);
    near(deck.kpi.neverSentBackCr, 34.129, 0.001);
    near(deck.kpi.neverSentBackPct, 0.7, 1e-9);
    near(deck.kpi.resoldCr, 32.849, 0.001);
    near(deck.kpi.resoldPctOfOrders, 0.115, 0.0005);
    near(deck.kpi.gmvRecoveredCr, 7590, 2);
    near(deck.kpi.unrecoveredRtoRate, 0.055, 0.0005);
    near(deck.kpi.lossPerOrder, 20.6, 0.05);
  });

  it('AOV and NMV-per-order are kept distinct', () => {
    expect(DEFAULTS.aov).toBe(265.75);
    near(deck.kpi.nmvPerOrder, 161.98, 0.01);
  });
});

describe('waterfall and revenue-vs-cost breakdown', () => {
  it('five bars: +410 / +990 / +1,272 / −1,064 / = +1,607', () => {
    const w = deck.waterfall.map((b) => b.value);
    near(w[0], 410, 1);
    near(w[1], 990, 1);
    near(w[2], 1272, 1);
    near(w[3], -1064, 1);
    near(w[4], 1607, 2);
  });

  it('bars sum exactly to the headline (identity, not coincidence)', () => {
    const w = deck.waterfall;
    near(w[0].value + w[1].value + w[2].value + w[3].value, w[4].value, 1e-9);
    near(w[4].value, deck.kpi.netImpactCr, 1e-9);
    near(w[3].end, w[4].end, 1e-9);
  });

  it('every row saving is its component sum', () => {
    deck.rows.forEach((r) => near(r.saving, componentSum(r.components), 1e-9));
  });

  it('revenue recovered splits into platform revenue and a negative resale margin', () => {
    const b = deck.breakdown;
    near(b.platformRevenueCr, 1544, 1);
    near(b.resaleMarginCr, -272, 1);
    near(b.costAvoidedCr, 1400, 1);
    near(b.costsAddedCr, 1064, 1);
    near(b.fulfilmentCr + b.handlingCr + b.commissionCr + b.storageCr, b.costsAddedCr, 1e-9);
  });

  it('without the ₹47 platform revenue, acquire nets ≈ ₹63 Cr', () => {
    near(computeModel({ ...DEFAULTS, platformRevenue: 0 }).kpi.netImpactCr, 63.5, 1);
  });
});

describe('ownership modes', () => {
  const m = compareModes(DEFAULTS);

  it('consignment: Meesho bears no resale margin; net ≈ ₹1,879 Cr', () => {
    near(m.consignment.kpi.netImpactCr, 1879, 2);
    expect(m.consignment.breakdown.resaleMarginCr).toBe(0);
    near(m.consignment.rows.find((r) => r.key === 'B1')!.netCost, 83.6 + 10.5 - 47, 1e-9);
    near(m.consignment.rows.find((r) => r.key === 'W1')!.netCost, 83.6 + 10.5 + 15 + 20 + m.consignment.unit.storagePerWeek - 47, 1e-9);
  });

  it('consignment seller payout = realised − fee', () => {
    const b1 = m.consignment.rows.find((r) => r.key === 'B1')!;
    near(b1.sellerReceives, 265.75 - 47, 1e-9);
    const a1 = m.acquire.rows.find((r) => r.key === 'W4')!;
    near(a1.sellerReceives, 233.86, 0.005);
  });

  it('HEADLINE — consignment with the ladder inside the seller floor ≈ ₹1,727 Cr', () => {
    const f = m.consignmentFloor;
    expect(f.rows.map((r) => r.key)).toEqual(['A', 'B1', 'W1', 'W2', 'W3', 'W4', 'RET']);
    near(f.kpi.netImpactCr, 1727, 2);
    near(f.rows.reduce((t, r) => t + r.volume, 0), 48.756, 0.0005);
    expect(f.rows.find((r) => r.key === 'RET')!.label).toBe('Back to seller after week 4');
  });

  it('the in-floor ladder scales with the floor: 15% → 3.75 / 7.5 / 11.25 / 15%', () => {
    expect(ladder(DEFAULTS, 'consignmentFloor').discounts).toEqual([0.0375, 0.075, 0.1125, 0.15]);
    expect(ladder({ ...DEFAULTS, sellerFloorDiscount: 0.2 }, 'consignmentFloor').discounts).toEqual([0.05, 0.1, 0.15, 0.2]);
    expect(ladder(DEFAULTS, 'acquire').discounts).toEqual([0.15, 0.25, 0.35, 0.45]);
  });

  it('a deeper floor sells faster (30% / 35% / 40% a week at 10 / 15 / 20%)', () => {
    near(ladder({ ...DEFAULTS, sellerFloorDiscount: 0.1 }, 'consignmentFloor').sellThrough, 0.3, 1e-9);
    near(ladder(DEFAULTS, 'consignmentFloor').sellThrough, 0.35, 1e-9);
    near(ladder({ ...DEFAULTS, sellerFloorDiscount: 0.2 }, 'consignmentFloor').sellThrough, 0.4, 1e-9);
  });

  it('the floor is a real trade-off: higher floor → Meesho saves more, seller gets less per sale but more sales', () => {
    const lo = sellerOutlook(DEFAULTS, 299, 0.1);
    const hi = sellerOutlook(DEFAULTS, 299, 0.2);
    expect(hi.meeshoSaving).toBeGreaterThan(lo.meeshoSaving);
    expect(hi.pSell).toBeGreaterThan(lo.pSell);
    expect(hi.payoutIfSold).toBeLessThan(lo.payoutIfSold);
    expect(hi.pBack).toBeLessThan(lo.pBack);
    near(lo.pSell + lo.pBack, 1, 1e-9);
  });

  it('floor is on the buyer’s price; the ₹47 fee is the normal per-order charge on top', () => {
    const b1 = m.consignmentFloor.rows.find((r) => r.key === 'B1')!;
    near(b1.realised, 265.75, 1e-9);
    near(b1.sellerReceives, 265.75 - 47, 1e-9);
  });

  it('a flash discount above the floor means no flash sale', () => {
    const f = computeModel({ ...DEFAULTS, flashDiscount: 0.2, sellerFloorDiscount: 0.15 }, 'consignmentFloor');
    expect(f.rows.some((r) => r.key === 'B1')).toBe(false);
  });

  it('never salvages below the floor; salvage runs only if the floor allows it', () => {
    const noSalvage = computeModel(DEFAULTS, 'consignmentFloor');
    expect(noSalvage.rows.some((r) => r.key === 'SALV')).toBe(false);
    const deep = computeModel({ ...DEFAULTS, sellerFloorDiscount: 0.7 }, 'consignmentFloor');
    expect(deep.rows.some((r) => r.key === 'SALV')).toBe(true);
    expect(deep.rows.some((r) => r.key === 'RET')).toBe(false);
  });

  it('the old “flash only, rest back” reading of a 10% floor gave ₹1,304 Cr', () => {
    const f = computeModel({ ...DEFAULTS, sellerFloorDiscount: 0.1, floorLadderSteps: [] }, 'consignmentFloor');
    expect(f.rows.map((r) => r.key)).toEqual(['A', 'B1', 'RET']);
    near(f.kpi.netImpactCr, 1304, 2);
  });

  it('all modes reconcile waterfall to headline', () => {
    Object.values(m).forEach((r) => near(r.waterfall[4].value, r.kpi.baselineLossCr - r.kpi.newLossCr, 1e-6));
  });
});

describe('sensitivity grid', () => {
  const g = sensitivity(DEFAULTS);
  it('6 clearance rows × 5 discount columns, default cell = headline', () => {
    expect(g.length).toBe(6);
    expect(g[0].length).toBe(5);
    const def = g.flat().filter((c) => c.isDefault);
    expect(def.length).toBe(1);
    near(def[0].netCr, 1607, 2);
  });

  it('corner values', () => {
    near(g[0][0].netCr, 544, 1); // 10% clearance, 0% discount
    near(g[1][4].netCr, 536, 1); // 20%, 20%
    near(g[5][0].netCr, 2316, 1); // 60%, 0%
  });

  it('saving rises with clearance and falls with discount', () => {
    for (let i = 1; i < g.length; i++) expect(g[i][0].netCr).toBeGreaterThan(g[i - 1][0].netCr);
    for (let j = 1; j < g[0].length; j++) expect(g[3][j].netCr).toBeLessThan(g[3][j - 1].netCr);
  });

  it('consignment grid: clearance × weekly sell-through, default cell = ₹1,727 Cr headline', () => {
    const c = sensitivity(DEFAULTS, 'consignmentFloor');
    const def = c.flat().filter((x) => x.isDefault);
    expect(def.length).toBe(1);
    near(def[0].netCr, 1727, 2);
    for (let j = 1; j < c[0].length; j++) expect(c[3][j].netCr).toBeGreaterThan(c[3][j - 1].netCr);
  });

  it('shipped-order basis scales the headline to ≈ ₹1,286 Cr', () => {
    near(computeModel({ ...DEFAULTS, rtoBasis: 'shipped' }).kpi.netImpactCr, 1286, 1);
  });
});

describe('per-parcel disposition', () => {
  it('at AOV, resale-track EV equals the weighted ₹43.5', () => {
    const ev = parcelEV(DEFAULTS, DEFAULTS.aov, true);
    near(ev.resaleTrackEV, 43.5, 0.05);
    expect(ev.chosen).toBe('flash');
  });

  it('seller opt-out always returns', () => {
    const ev = parcelEV(DEFAULTS, 499, false);
    expect(ev.chosen).toBe('return');
    near(ev.chosenSaving, 8.4, 1e-9);
  });

  it('path economics scale with item price', () => {
    const cheap = paths(DEFAULTS, 'acquire', 150).find((r) => r.key === 'B1')!;
    near(cheap.netCost, 83.6 + 150 * 0.88 + 10.5 - 150 - 47, 1e-9);
  });
});

describe('tiering on top of TrustMesh', () => {
  it('new customer is tiered on TrustMesh alone', () => {
    expect(decideTier(0, 1, 0.1)).toMatchObject({ tier: 1, historyTier: null, driver: 'trustmesh' });
    expect(decideTier(0, 1, 0.7).tier).toBe(3);
  });

  it('Keshav: 1 refusal in 4 orders → 25% → Tier 2', () => {
    expect(decideTier(0, 3, 0.12).tier).toBe(1);
    expect(decideTier(1, 4, 0.12)).toMatchObject({ tier: 2, driver: 'history' });
  });

  it('the stricter of history and TrustMesh wins', () => {
    expect(decideTier(0, 10, 0.45)).toMatchObject({ tier: 2, driver: 'trustmesh' });
    expect(decideTier(7, 10, 0.05)).toMatchObject({ tier: 3, driver: 'history' });
  });
});

describe('cause split', () => {
  it('reproduces the deck ₹ values at baseline', () => {
    const c = causeSplit(5899);
    expect(c.map((x) => Math.round(x.cr))).toEqual([4165, 950, 784]);
  });
});

describe('price room', () => {
  it('Meesho accepts within 2 points of its recommendation, meets halfway below, rejects outside 10–20%', () => {
    expect(meeshoReply(0.15, 0.14)).toEqual({ kind: 'accept', floor: 0.14 });
    expect(meeshoReply(0.15, 0.13)).toEqual({ kind: 'accept', floor: 0.13 });
    expect(meeshoReply(0.15, 0.1)).toEqual({ kind: 'counter', floor: 0.13 });
    expect(meeshoReply(0.15, 0.08).kind).toBe('reject');
    expect(meeshoReply(0.15, 0.25).kind).toBe('reject');
  });
});
describe('local holding capacity', () => {
  it('an average pincode sees ~89 RTOs a day; ~37 wait locally for ~16 days → ~600 parcels on hand', () => {
    const h = holdingNeed(DEFAULTS, 'consignmentFloor');
    near(h.rtoPerPincodePerDay, 89.05, 0.05);
    near(h.intoHoldPerDay, 37.4, 0.1);
    near(h.avgDaysHeld, 16.4, 0.1);
    near(h.stockPerPincode, 614, 3);
  });

  it('a better flash sale shrinks the holding need', () => {
    const lo = holdingNeed({ ...DEFAULTS, flashClearance: 0.6 }, 'consignmentFloor');
    expect(lo.stockPerPincode).toBeLessThan(holdingNeed(DEFAULTS, 'consignmentFloor').stockPerPincode);
  });
});
describe('partner store earnings', () => {
  it('a 5 sq ft shelf holds 40 parcels and earns a few thousand rupees a month', () => {
    const e = partnerEstimate(DEFAULTS, 'consignmentFloor', 5);
    expect(e.capacity).toBe(40);
    expect(e.monthly).toBeGreaterThan(2000);
    expect(e.monthly).toBeLessThan(6000);
    expect(e.monthly).toBeGreaterThan(e.shelfRentValue * 10); // far more than the shelf is worth as rented space
  });

  it('more shelf means more holds, not more pickups', () => {
    const small = partnerEstimate(DEFAULTS, 'consignmentFloor', 3);
    const big = partnerEstimate(DEFAULTS, 'consignmentFloor', 10);
    expect(big.holdsPerDay).toBeGreaterThan(small.holdsPerDay);
    expect(big.pickupsPerDay).toBeCloseTo(small.pickupsPerDay, 9);
  });
});
describe('buy-back price: what Meesho pays a seller for a refused parcel', () => {
  const shoes = (price: number, b = {}) => buyBackQuote(DEFAULTS, price, { ...BUYBACK_DEFAULTS, ...b });

  it('₹299 sneakers: seller walks away below ₹211, Meesho can pay up to ₹252, they meet at ₹231', () => {
    const q = shoes(299);
    expect(Math.round(q.seller.walkAway)).toBe(211);
    expect(Math.round(q.meesho.ceiling)).toBe(252);
    expect(q.offer).toBe(231);
    expect(q.discount).toBeCloseTo(0.227, 2);
  });

  it('the seller side adds up: fee, repacking, damage risk and waiting come off the price', () => {
    const { seller: s } = shoes(299);
    expect(s.afterFee).toBe(299 - 47 - 15);
    expect(s.afterFee - s.damage - s.waiting).toBeCloseTo(s.walkAway, 6);
    expect(s.days).toBe(51);
  });

  it('any agreed price leaves both sides better off, and the split slider moves it across the zone', () => {
    const q = shoes(299);
    expect(q.sellerGain).toBeGreaterThan(0);
    expect(q.meeshoGain).toBeGreaterThan(0);
    expect(shoes(299, { sellerShare: 0 }).offer).toBe(Math.round(q.seller.walkAway));
    expect(shoes(299, { sellerShare: 1 }).offer).toBe(Math.round(q.meesho.ceiling));
  });

  it('cheaper items get a deeper discount: fixed local costs weigh more on them', () => {
    expect(shoes(149).discount).toBeGreaterThan(shoes(299).discount);
    expect(shoes(299).discount).toBeGreaterThan(shoes(999).discount);
  });

  it('expensive items are not worth buying, so they go back to the seller', () => {
    const q = shoes(2499);
    expect(q.deal).toBe(false);
    expect(q.offer).toBe(0);
  });

  it('a slower local market lowers what Meesho can pay', () => {
    const slow = buyBackQuote({ ...DEFAULTS, flashClearance: 0.2, weeklySellThrough: 0.3 }, 299);
    expect(slow.meesho.ceiling).toBeLessThan(shoes(299).meesho.ceiling);
  });
});

describe('margin-based ask and local demand', () => {
  const sig = { category: 'jewellery', price: 149, sellerType: 'reseller' as const, pastMaxDiscount: 0.3, priceVsPeers: 1.05 };

  it('bands set the ask: low margin 0–10% (half the margin), medium 10%, high 15%', () => {
    expect(estimateMargin({ ...sig, wholesale: 38 }).band).toBe('high');
    expect(estimateMargin({ ...sig, wholesale: 38 }).cap).toBe(0.15);
    const medium = estimateMargin({ category: 'clothes', price: 289, wholesale: 150, sellerType: 'manufacturer', pastMaxDiscount: 0.15, priceVsPeers: 1 });
    expect(medium.band).toBe('medium');
    expect(medium.cap).toBe(0.1);
    const low = estimateMargin({ category: 'shoes', price: 399, wholesale: 290, sellerType: 'reseller', pastMaxDiscount: 0.05, priceVsPeers: 1 });
    expect(low.band).toBe('low');
    expect(low.cap).toBeCloseTo(Math.round((low.margin / 2) * 100) / 100, 9);
    expect(low.cap).toBeLessThanOrEqual(0.1);
  });

  it('a wholesale match pulls the estimate towards the margin it implies', () => {
    const noMatch = estimateMargin(sig);
    const match = estimateMargin({ ...sig, wholesale: 100 }); // thin: (149-100-47)/149 ≈ 1%
    expect(match.fromWholesale).toBeCloseTo(2 / 149, 6);
    expect(match.margin).toBeLessThan(noMatch.margin);
    expect(match.margin).toBeCloseTo(0.6 * match.fromWholesale! + 0.4 * match.fromSignals, 9);
  });

  it('the demand funnel gives ~40% for the default pincode, and more shoppers sell faster', () => {
    expect(flashSellThrough(DEMAND_DEFAULTS)).toBeCloseTo(0.398, 2);
    expect(flashSellThrough({ ...DEMAND_DEFAULTS, shoppersPerDay: 70 })).toBeGreaterThan(flashSellThrough(DEMAND_DEFAULTS));
  });

  it('Meesho buys only when the margin-based ask is under its ceiling; otherwise it sells for the seller', () => {
    const busy = buyBackQuote({ ...DEFAULTS, flashClearance: flashSellThrough({ ...DEMAND_DEFAULTS, shoppersPerDay: 70 }) }, 149, { ...BUYBACK_DEFAULTS, damageRate: 0.1, resellDays: 40 });
    expect(buyDecision(busy, 0.15).kind).toBe('buy');
    const quiet = buyBackQuote({ ...DEFAULTS, flashClearance: flashSellThrough({ ...DEMAND_DEFAULTS, shoppersPerDay: 8 }) }, 149);
    expect(buyDecision(quiet, 0.1).kind).toBe('consign');
  });
});

describe('one refused parcel, end to end', () => {
  const jhumka = (attempts: number) => refusedParcel({ ...DEFAULTS, flashClearance: flashSellThrough({ ...DEMAND_DEFAULTS, shoppersPerDay: 70 }) }, 149, 0.15, attempts);

  it('today it costs the full ₹121 round trip with 3 attempts', () => {
    expect(jhumka(3).today).toBe(-121);
    expect(jhumka(2).today).toBe(-100);
  });

  it('sold in the flash sale: Meesho gets its fee back and skips the trip back', () => {
    const r = jhumka(3);
    expect(r.flash!.fee).toBe(47);
    expect(r.flash!.fee - r.sunk - r.flash!.local).toBeCloseTo(47 - 92 - 10.5, 6);
    expect(jhumka(1).flash!.fee - jhumka(1).sunk - jhumka(1).flash!.local).toBeCloseTo(-13.5, 6);
  });

  it('the saving vs today does not depend on how many attempts were already made', () => {
    expect(jhumka(3).saving).toBeCloseTo(jhumka(1).saving, 6);
    expect(jhumka(3).saving).toBeGreaterThan(40);
  });
});

describe('kirana pickup discount', () => {
  it('pickup beats home delivery for every buyer type at a ₹10 kirana fee, so ₹5 off pays for itself', () => {
    for (const [fail, max] of [[0.05, 3], [0.12, 3], [0.4, 2]]) {
      const x = pickupVsHome({ ...PICKUP_DEFAULTS, firstAttemptFail: fail, maxAttempts: max });
      expect(x.discount).toBe(5);
      expect(x.meeshoKeeps).toBeGreaterThan(0);
    }
  });

  it('at a ₹20 kirana fee only riskier buyers are worth a discount', () => {
    expect(pickupVsHome({ ...PICKUP_DEFAULTS, kiranaFee: 20, firstAttemptFail: 0.12, maxAttempts: 3 }).discount).toBe(0);
    expect(pickupVsHome({ ...PICKUP_DEFAULTS, kiranaFee: 20, firstAttemptFail: 0.4, maxAttempts: 2 }).discount).toBe(5);
  });
});

describe('buy plan: Meesho buys at a discount, resells at full price', () => {
  const jhumka = () => buyPlan(DEFAULTS, 149, { category: 'jewellery', wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 70 });

  it('asks for the margin band’s discount; the seller gets price − discount − usual fee', () => {
    const b = jhumka();
    expect(b.ask).toBe(0.15);
    expect(b.sellerGets(0.15)).toBe(Math.round(149 * 0.85 - 47));
    expect(b.sellerGets(0.15)).toBeGreaterThan(b.sellerWalkAway);
  });

  it('a full-price flash sale leaves Meesho its usual fee plus the discount', () => {
    const b = jhumka();
    expect(149 - b.sellerGets(0.15)).toBe(47 + Math.round(149 * 0.15));
  });

  it('busy pincode: buying beats selling it for her; quiet pincode: it does not', () => {
    expect(jhumka().worthBuying).toBe(true);
    const quiet = buyPlan(DEFAULTS, 149, { category: 'jewellery', wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 10 });
    expect(quiet.worthBuying).toBe(false);
  });
});

describe('ownership: buy before or after the flash sale, never send it back', () => {
  const jhumka = () => ownershipPlan(DEFAULTS, 149, { category: 'jewellery', wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 70 });

  it('every parcel ends up sold somewhere: flash, kirana, city, India or bulk', () => {
    const o = jhumka();
    expect(o.flash + o.stages.reduce((t, s) => t + s.share, 0)).toBeCloseTo(1, 9);
    expect(o.stages.find((s) => s.key === 'bulk')!.share).toBeLessThan(0.03);
  });

  it('buying before beats buying after, which beats selling it for her, which beats sending it back', () => {
    const m = jhumka().meesho;
    expect(m.buyBefore).toBeGreaterThan(m.buyAfter);
    expect(m.buyAfter).toBeGreaterThan(m.consign);
    expect(m.consign).toBeGreaterThan(m.today);
    expect(m.today).toBe(-29);
  });

  it('before vs after only moves the discount on flash-sale sales from the seller to Meesho', () => {
    const o = jhumka();
    expect(o.meesho.buyBefore - o.meesho.buyAfter).toBeCloseTo(o.flash * (o.sellerIfFlash - o.sellerNow), 6);
    expect(o.sellerAfterAvg).toBeGreaterThan(o.sellerNow);
  });

  it('two steps: the margin-based discount first; a 0% second offer only for fast sellers that still beat sending it back', () => {
    const j = jhumka(); // 63% expected to sell in 24 h
    expect(j.d).toBe(0.15);
    expect(j.fastSeller).toBe(true);
    expect(j.zeroOffer).toBe(true);
    const slow = ownershipPlan(DEFAULTS, 399, { category: 'jewellery', wholesale: 150, sellerType: 'manufacturer', pastMaxDiscount: 0.25, priceVsPeers: 1.1 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 24 });
    expect(slow.fastSeller).toBe(false); // 29%: declined parcels go back
    expect(slow.zeroOffer).toBe(false);
    expect(FAST_SELL).toBe(0.6);
  });

  it('Meesho can buy at 0% off when reselling still beats paying for the trip back', () => {
    const o = jhumka();
    expect(o.atZero).toBeGreaterThan(o.meesho.today); // +₹8 vs −₹29
    expect(o.minVsReturn).toBe(0);
    const zero = ownershipPlan(DEFAULTS, 149, { category: 'jewellery', wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 70 }, 0);
    expect(zero.sellerNow).toBe(149 - 47);
    expect(zero.meesho.buyBefore).toBeCloseTo(o.atZero, 6);
  });

  it('a counter-offer lowers the discount but never below Meesho’s minimum', () => {
    const o = jhumka();
    const countered = ownershipPlan(DEFAULTS, 149, { category: 'jewellery', wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05 }, { ...DEMAND_DEFAULTS, shoppersPerDay: 70 }, 0.1);
    expect(countered.sellerNow).toBeGreaterThan(o.sellerNow);
    expect(countered.meesho.buyBefore).toBeGreaterThanOrEqual(countered.meesho.consign);
  });
});
