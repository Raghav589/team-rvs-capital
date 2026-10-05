/**
 * The base case for the deck: one operating model, on Valmo's network.
 *
 * As soon as a parcel is refused, the seller chooses: sell it to Meesho at the
 * agreed price (her price less the margin-based discount and the usual ₹47
 * shipping charge, paid within 2 days), or have it returned as today. Once Meesho
 * owns it, everything after is Meesho's: the 24-hour flash sale in the same
 * pincode, then kirana, city, India and bulk. It is never sent back. Parcels that
 * are damaged or wrong, or whose seller says no, go back as today. Prevention
 * (tiers, prepaid discounts, slots) is left out and measured in the pilot.
 */
import {
  DEFAULTS,
  DEMAND_DEFAULTS,
  OPS_COST,
  PICKUP_DEFAULTS,
  PICKUP_DISCOUNT,
  VALMO_PINCODES,
  WIDEN,
  ownershipPlan,
  unitCosts,
  type Assumptions,
} from './model';

export interface AnnualInputs {
  valmoShare: number; // share of Meesho's shipped orders Valmo delivers (Business Standard: about half)
  eligible: number; // refused parcels that come back sealed, undamaged and the right item
  incremental: number; // resales that are new orders for Meesho, not ones the shopper would have placed anyway
  thirdAttemptSuccess: number; // of capped parcels that would have got a 3rd home attempt, share it would have delivered
  collectAfterCap: number; // of those, share who collect from the kirana instead
  discount: number; // average agreed discount: 10% for medium margins, 15% for high
  kiranasPerPincode: number; // pilot: 25–30 kiranas across 4 pincodes
}

export const ANNUAL_DEFAULTS: AnnualInputs = {
  valmoShare: 0.5,
  eligible: 0.85,
  incremental: 0.5,
  thirdAttemptSuccess: 0.2,
  collectAfterCap: 0.5,
  discount: 0.12,
  kiranasPerPincode: 7,
};

/** An average listing: the deck's average order, medium-margin category, average local demand. */
export const AVG_SIGNALS = { category: 'clothes', sellerType: 'manufacturer' as const, pastMaxDiscount: 0.15, priceVsPeers: 1 };

/** Stress: later sales slower (sell-through × widenSlow) and extra handling per parcel that misses the flash sale. */
export interface Stress {
  widenSlow: number;
  extraCost: number;
}

const slowed = (f: number) => ({
  kirana: { ...WIDEN.kirana, sellThrough: WIDEN.kirana.sellThrough * f },
  city: { ...WIDEN.city, sellThrough: WIDEN.city.sellThrough * f },
  india: { ...WIDEN.india, sellThrough: WIDEN.india.sellThrough * f },
  bulk: WIDEN.bulk,
});

export function annualCase(a: Assumptions = DEFAULTS, k: AnnualInputs = ANNUAL_DEFAULTS, demand = DEMAND_DEFAULTS, stress: Stress = { widenSlow: 1, extraCost: 0 }) {
  const u = unitCosts(a);
  const fee = a.platformFee;
  const rtoRate = a.codShare * a.rtoRateCod + (1 - a.codShare) * a.rtoRatePrepaid;
  const shipped = a.annualOrders * a.shippedShare; // Cr orders shipped by all couriers
  const shippedValmo = shipped * k.valmoShare;
  const rto = shippedValmo * rtoRate; // Cr refused or undelivered parcels on Valmo
  const optIn = 1 - a.sellerBackShare;
  const pool = rto * k.eligible * optIn; // offered for local resale
  const o = ownershipPlan(a, a.aov, AVG_SIGNALS, demand, k.discount, slowed(stress.widenSlow), stress.extraCost);
  const share = (key: string) => o.stages.find((s) => s.key === key)!.share;
  const resoldShare = o.flash + share('kirana') + share('city') + share('india'); // sold to a Meesho shopper
  const flashLocal = (1 - a.selfCollectShare) * a.localDelivery + a.selfCollectShare * (PICKUP_DEFAULTS.kiranaFee + PICKUP_DEFAULTS.dropCost + PICKUP_DISCOUNT);

  // The 2-try cap is a separate pilot test, not in the base case: it saves an attempt but loses a few deliveries.
  const capped = rto * a.cappedShare; // RTO parcels from riskier buyers today, all on their 3rd attempt
  const reachThird = capped / (1 - k.thirdAttemptSuccess); // parcels that reach a 3rd attempt (some of them deliver)
  const wouldDeliver = reachThird * k.thirdAttemptSuccess;
  const lostDeliveries = wouldDeliver * (1 - k.collectAfterCap); // the rest collect from the kirana instead
  const capTest = {
    capped,
    reachThird,
    wouldDeliver,
    lostDeliveries,
    fewerAttempts: capped * (a.attemptsToday - a.cappedAttempts) * a.costLastMile,
    lostSales: -lostDeliveries * fee,
    net: 0,
  };
  capTest.net = capTest.fewerAttempts + capTest.lostSales;

  // ₹ Cr a year from recovery, against today (every refused parcel goes back).
  const lines = {
    tripBack: pool * u.networkOneWay,
    flashCharge: pool * o.flash * fee,
    flashDiscount: pool * o.flash * (o.sellerIfFlash - o.sellerNow), // Meesho owns it, so the seller's discount stays with Meesho
    flashLocal: -pool * o.flash * flashLocal,
    boughtNet: pool * (o.tail - (1 - o.flash) * (o.sellerNow + o.capital)), // parcels still unsold after the flash sale
    ops: -pool * OPS_COST,
    notIncremental: -pool * resoldShare * fee * (1 - k.incremental),
  };
  const net = Object.values(lines).reduce((t, v) => t + v, 0);

  // What happens to the parcels, reported separately (recovery is not prevention).
  const outcomes = {
    deliveredTodayPct: 1 - rtoRate,
    deliveredNewPct: 1 - rtoRate, // recovery doesn't change it
    deliveredWithCapPct: 1 - rtoRate - lostDeliveries / shippedValmo,
    returnedPctOfRto: 1 - k.eligible * optIn,
    resoldPctOfRto: k.eligible * optIn * resoldShare,
    bulkPctOfRto: k.eligible * optIn * share('bulk'),
  };

  // One point less RTO from prevention is worth: the RTO cost avoided, less a normal delivery, plus the shipping charge, less the recovery it no longer needs.
  const perPointCr = shippedValmo * 0.01 * (u.baseline - (u.networkOneWay + a.costLastMile) + fee - net / rto);

  // A kirana's day in an average pincode.
  const perDay = (cr: number) => (cr * 1e7) / 365 / VALMO_PINCODES;
  const holdsPP = perDay(pool * (1 - o.flash)); // every parcel Meesho buys waits at a kirana first
  const kiranaSoldPP = perDay(pool * share('kirana'));
  const flashPickupsPP = perDay(pool * o.flash * a.selfCollectShare);
  const k1 = share('kirana') / (1 - o.flash); // of bought parcels, sold within the 2 kirana weeks
  const avgWaitDays = 7 * WIDEN.kirana.sellThrough + 14 * (1 - WIDEN.kirana.sellThrough); // week-1 sales leave after 7 days; the rest after 14 (sold or moved to the city)
  const kirana = {
    rtoPerPincodeDay: perDay(rto),
    offeredPerPincodeDay: perDay(pool),
    holdsPerDay: holdsPP / k.kiranasPerPincode,
    pickupsPerDay: (kiranaSoldPP + flashPickupsPP) / k.kiranasPerPincode,
    heldPickupsPerDay: kiranaSoldPP / k.kiranasPerPincode,
    flashPickupsPerDay: flashPickupsPP / k.kiranasPerPincode,
    stockPerKirana: (holdsPP * avgWaitDays) / k.kiranasPerPincode,
    soldAtKiranaPct: k1,
    monthly: (30 * (holdsPP * a.handling + kiranaSoldPP * a.commission + flashPickupsPP * PICKUP_DEFAULTS.kiranaFee)) / k.kiranasPerPincode,
  };

  return { inputs: k, rtoRate, shipped, shippedValmo, rto, pool, optIn, flash: o.flash, plan: o, resoldShare, lines, net, perRto: net / rto, perOffered: net / pool, outcomes, perPointCr, kirana, capTest };
}

/** Five-year view: the full-scale year, scaled by order growth and the share of Valmo pincodes live. */
export const GROWTH = 1.15;
export const ROLLOUT = [0.2, 0.55, 0.85, 1, 1]; // FY27–FY31: GTM waves, all Valmo pincodes from FY30

export function fiveYears(net: number) {
  const scale = ROLLOUT.map((r, n) => GROWTH ** (n + 1) * r);
  return { scale, net: scale.map((s) => net * s), total: scale.reduce((t, s) => t + net * s, 0) };
}

/** What a new Pados Point is likely to earn with a shelf of `shelfSqft`, in an average pincode at full rollout. */
export function kiranaEstimate(shelfSqft: number, a: Assumptions = DEFAULTS, k: AnnualInputs = ANNUAL_DEFAULTS) {
  const c = annualCase(a, k).kirana;
  const capacity = shelfSqft * a.parcelsPerSqft;
  const fill = Math.min(1, (capacity * 0.7) / Math.max(c.stockPerKirana, 1e-9)); // a small shelf takes only what fits
  const holdsPerDay = c.holdsPerDay * fill;
  const heldPickupsPerDay = c.heldPickupsPerDay * fill;
  return {
    capacity,
    holdsPerDay,
    heldPickupsPerDay,
    flashPickupsPerDay: c.flashPickupsPerDay,
    pickupsPerDay: heldPickupsPerDay + c.flashPickupsPerDay,
    stock: c.stockPerKirana * fill,
    monthly: 30 * (holdsPerDay * a.handling + heldPickupsPerDay * a.commission + c.flashPickupsPerDay * PICKUP_DEFAULTS.kiranaFee),
    shelfRentValue: shelfSqft * a.rentPerSqftMonth,
  };
}
