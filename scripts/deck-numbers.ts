/**
 * Prints every number used in the deck, straight from the model in src/.
 * Run: npm run numbers   (writes the same figures to docs/numbers.json)
 */
import * as fs from 'fs';
import { DEFAULTS, DEMAND_DEFAULTS, FAST_SELL, PICKUP_DEFAULTS, flashSellThrough, ownershipPlan, pickupVsHome, unitCosts } from '../src/model.ts';
import { ANNUAL_DEFAULTS, AVG_SIGNALS, annualCase, fiveYears, kiranaEstimate } from '../src/annual.ts';
import { CATALOGUE, LISTING_SIGNALS } from '../src/seed.ts';

const K = ANNUAL_DEFAULTS;
const r = (x: number, d = 0) => Number(x.toFixed(d));
const cr = (x: number) => `${x < 0 ? '−' : ''}₹${Math.abs(Math.round(x)).toLocaleString('en-IN')} Cr`;
const rs = (x: number, d = 0) => `${x < 0 ? '−' : ''}₹${Math.abs(x).toFixed(d)}`;
const pc = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const line = (label: string, value: string) => console.log(`  ${label.padEnd(52, '.')} ${value}`);
const head = (t: string) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

// ---------------------------------------------------------------- 1. problem size
const u = unitCosts(DEFAULTS);
const rtoRate = DEFAULTS.codShare * DEFAULTS.rtoRateCod + (1 - DEFAULTS.codShare) * DEFAULTS.rtoRatePrepaid;
const shipped = DEFAULTS.annualOrders * DEFAULTS.shippedShare;
head('1. Problem size (Meesho, annualised Q4 FY26)');
line('Orders placed a year', `${DEFAULTS.annualOrders} Cr`);
line('Orders shipped (80% of placed)', `${r(shipped, 1)} Cr`);
line('Blended RTO rate (80% COD × 20% + 20% prepaid × 5%)', pc(rtoRate));
line('RTO parcels a year', `${(shipped * rtoRate).toFixed(1)} Cr`);
line('One-way network cost (₹6 + ₹5 + ₹8 + ₹10)', rs(u.networkOneWay));
line('Cost of one RTO parcel (2 × ₹29 + 3 × ₹21)', rs(u.baseline));
line('RTO loss a year', cr(shipped * rtoRate * u.baseline));
line('…as a share of NMV', pc((shipped * rtoRate * u.baseline) / DEFAULTS.annualNmv, 1));
line('…per order placed', rs((shipped * rtoRate * u.baseline) / DEFAULTS.annualOrders, 1));

// ---------------------------------------------------------------- 2. one parcel: the jhumkas
const jt = CATALOGUE[4];
const js = LISTING_SIGNALS[jt.title];
const j = ownershipPlan(DEFAULTS, jt.price, { category: jt.category, ...js }, { ...DEMAND_DEFAULTS, shoppersPerDay: js.shoppersPerDay });
head(`2. One parcel: ${jt.title}, ₹${jt.price}`);
line('Margin from the wholesale match', pc(j.margin.fromWholesale ?? 0));
line('Margin from seller signals', pc(j.margin.fromSignals));
line('Blended margin (60/40) → band', `${pc(j.margin.margin)} → ${j.margin.band}`);
line('Step 1: discount asked', pc(j.d));
line('Step 1: Meesho pays the seller (price − discount − ₹47)', rs(j.sellerNow));
line('Worth to the seller if it goes back (walk-away)', rs(j.sellerWalkAway));
line('Sold in the 24 h flash sale (demand funnel)', pc(j.flash, 1));
line(`Fast seller (≥ ${pc(FAST_SELL)}) → step 2 offer at 0%`, j.zeroOffer ? `yes, ${rs(j.sellerIfFlash)}` : 'no');
line('Meesho result: send it back (today)', rs(j.meesho.today));
line('Meesho result: buys at step 1 price', `+${rs(j.meesho.buyBefore, 1)}`);
line('Meesho result: buys at 0% off', `${j.atZero >= 0 ? '+' : ''}${rs(j.atZero, 1)}`);

// ---------------------------------------------------------------- 3. the year on Valmo
const b = annualCase();
head('3. Full-scale year on Valmo (base case)');
line('RTO parcels on Valmo (half of shipped)', `${r(b.rto, 2)} Cr`);
line('Offered to Meesho (85% resaleable × 70% sellers say yes)', `${r(b.pool, 2)} Cr`);
line('Average parcel: sold in 24 h', pc(b.flash, 1));
const labels: Record<string, string> = {
  tripBack: 'Trip back avoided', flashCharge: '₹47 margin on flash sales', flashDiscount: 'Discount kept on flash sales',
  flashLocal: 'Flash delivery and pickup', boughtNet: 'Parcels sold after 24 h, net', ops: 'Seal check and support', notIncremental: 'Resales that aren’t new orders',
};
for (const [k, v] of Object.entries(b.lines)) line(labels[k] ?? k, cr(v));
line('NET A YEAR', cr(b.net));
line('Per RTO parcel vs today', rs(b.perRto, 1));
line('2-try cap test, if it passes (not in the base case)', cr(b.capTest.net));
line('Each point of RTO removed by prevention', cr(b.perPointCr));

// ---------------------------------------------------------------- 4. range, stress, five years
head('4. Sensitivity and stress tests');
for (const inc of [0, 0.5, 1]) line(`Resales that are new orders: ${pc(inc)}`, cr(annualCase(undefined, { ...K, incremental: inc }).net));
const DOWN_DEMAND = { ...DEMAND_DEFAULTS, shoppersPerDay: 16 };
line('Flash sale sells 20%, not 40%', cr(annualCase(undefined, K, DOWN_DEMAND).net));
line('Later sales 30% slower', cr(annualCase(undefined, K, DEMAND_DEFAULTS, { widenSlow: 0.7, extraCost: 0 }).net));
line('+₹4 handling per parcel unsold after 24 h', cr(annualCase(undefined, K, DEMAND_DEFAULTS, { widenSlow: 1, extraCost: 4 }).net));
line('Only 75% of parcels resaleable', cr(annualCase(undefined, { ...K, eligible: 0.75 }).net));
const down = annualCase(undefined, { ...K, eligible: 0.75 }, DOWN_DEMAND, { widenSlow: 0.7, extraCost: 4 });
line('All four at once (combined downside)', cr(down.net));
line('Same model on all Meesho shipments', cr(annualCase(undefined, { ...K, valmoShare: 1 }).net));
const five = fiveYears(b.net);
head('5. Five years on Valmo (orders +15%/yr; 20% → 55% → 85% → 100% of pincodes)');
['FY27', 'FY28', 'FY29', 'FY30', 'FY31'].forEach((y, i) => line(y, cr(five.net[i])));
line('Five-year total', cr(five.total));

// ---------------------------------------------------------------- 5. kirana and pickup
head('6. Kirana (Pados Point) and the ₹5 pickup discount');
for (const sq of [3, 5, 8]) {
  const e = kiranaEstimate(sq);
  line(`${sq} sq ft shelf: holds ${e.capacity}, earns a month`, `₹${Math.round(e.monthly).toLocaleString('en-IN')}`);
}
for (const f of [0.2, 0.3, 0.4]) {
  const p = pickupVsHome({ ...PICKUP_DEFAULTS, firstAttemptFail: f, maxAttempts: 2 });
  line(`First home attempt fails ${pc(f)}: pickup saves / Meesho keeps`, `${rs(p.saving, 1)} / ${rs(p.meeshoKeeps, 1)}`);
}
line('Demand funnel, average pincode (36 shoppers × 70% × 2%)', pc(flashSellThrough(DEMAND_DEFAULTS), 1));

const avg = ownershipPlan(DEFAULTS, DEFAULTS.aov, AVG_SIGNALS, DEMAND_DEFAULTS, K.discount);
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(
  'docs/numbers.json',
  JSON.stringify({ defaults: DEFAULTS, annualInputs: K, base: { ...b, plan: undefined }, jhumka: { ...j, sellerGets: undefined, buyNet: undefined, keepsIfFlash: undefined }, averageOrder: avg.meesho, fiveYears: five, downside: down.net }, null, 1),
);
console.log('\nWrote docs/numbers.json');
