/**
 * Team RVS Capital — financial model.
 *
 * Pure functions only; every input is a parameter. Defaults reproduce the
 * submitted deck (appendix "Savings Calculation from our model", I–IV).
 * Money is in ₹ per parcel unless a name says Cr (₹ crore) or a volume is in
 * Cr orders.
 *
 * Every path's saving vs baseline is built from the same six components, so
 * the waterfall always sums exactly to the headline:
 *   saving = attemptsSaved + reverseAvoided + platformRevenue + resaleMargin
 *            − fulfilment − handling − commission − storage
 */

// ---------------------------------------------------------------- inputs

/**
 * consignmentFloor — HEADLINE. Meesho never owns the parcel; the seller gets the
 *                  realised price − platform fee. The weekly ladder is drawn inside
 *                  the seller's agreed floor (10–20%), and anything unsold after it
 *                  goes back to the seller.
 * consignment   — consignment with the deck's ladder and salvage, ignoring the floor.
 * acquire       — the submitted deck: Meesho buys at 12% off and resells.
 */
export type Mode = 'acquire' | 'consignment' | 'consignmentFloor';

export const MODES: Mode[] = ['consignmentFloor', 'consignment', 'acquire'];

export const MODE_LABEL: Record<Mode, string> = {
  consignmentFloor: 'Consignment',
  consignment: 'Consignment · no floor',
  acquire: 'Acquire (submitted deck)',
};

export interface Assumptions {
  // Volume
  annualOrders: number; // Cr orders placed / yr
  aov: number; // ₹ gross selling price a buyer pays (GMV / orders)
  annualNmv: number; // ₹ Cr — label only; NMV per order ≠ AOV
  codShare: number;
  rtoRateCod: number;
  rtoRatePrepaid: number;
  /** 'placed' reproduces the deck; 'shipped' applies RTO only to shipped orders */
  rtoBasis: 'placed' | 'shipped';
  shippedShare: number;

  // Network cost per leg (₹)
  costFmHubCarting: number;
  costFmSorting: number;
  costLineHaul: number;
  costRegional: number;
  costLastMile: number;

  // Attempt policy
  attemptsToday: number;
  cappedShare: number; // share of RTO parcels capped
  cappedAttempts: number;

  // Seller participation & acquisition
  sellerBackShare: number; // Path A
  acquisitionDiscount: number; // vs AOV (acquire mode)
  sellerFloorDiscount: number; // max discount a seller approves (consignmentFloor), on buyer price; fee is separate

  // Flash sale
  flashClearance: number; // share of Path B pool sold in 24h
  flashDiscount: number;

  // Weekly ladder
  ladderDiscounts: number[]; // one per week (acquire / consignment)
  weeklySellThrough: number; // of what's left (acquire / consignment)
  floorLadderSteps: number[]; // consignmentFloor: week n discount = step × seller floor
  floorSellThrough: number; // consignmentFloor: weekly sell-through at the reference floor
  floorReference: number; // floor at which floorSellThrough applies
  floorSellThroughSlope: number; // extra sell-through per unit of floor above the reference (deeper floor sells faster)
  salvageRate: number; // of AOV

  // Local costs
  localDelivery: number;
  selfCollectShare: number;
  handling: number;
  commission: number;
  rentPerSqftMonth: number;
  parcelsPerSqft: number;

  // Revenue
  platformRevenue: number; // ₹ booked per resold order (acquire)
  platformFee: number; // ₹ fee kept from seller proceeds (consignment)
  consignmentSalvageFee: number; // ₹ fee on salvage sales (consignment)
}

export const DEFAULTS: Assumptions = {
  annualOrders: 286.8,
  aov: 265.75,
  annualNmv: 46456,
  codShare: 0.8,
  rtoRateCod: 0.2,
  rtoRatePrepaid: 0.05,
  rtoBasis: 'placed',
  shippedShare: 0.8,

  costFmHubCarting: 6,
  costFmSorting: 5,
  costLineHaul: 8,
  costRegional: 10,
  costLastMile: 21,

  attemptsToday: 3,
  cappedShare: 0.4,
  cappedAttempts: 2,

  sellerBackShare: 0.3,
  acquisitionDiscount: 0.12,
  sellerFloorDiscount: 0.15, // sellers accept anything from 10–20%; the ladder scales with it

  flashClearance: 0.4,
  flashDiscount: 0,

  ladderDiscounts: [0.15, 0.25, 0.35, 0.45],
  weeklySellThrough: 0.5,
  floorLadderSteps: [0.25, 0.5, 0.75, 1],
  floorSellThrough: 0.35,
  floorReference: 0.15,
  floorSellThroughSlope: 1, // 10% floor → 30%/wk, 20% → 40%/wk
  salvageRate: 0.35,

  localDelivery: 21,
  selfCollectShare: 0.5,
  handling: 15,
  commission: 20,
  rentPerSqftMonth: 25,
  parcelsPerSqft: 8,

  platformRevenue: 47,
  platformFee: 47,
  consignmentSalvageFee: 0,
};

// ---------------------------------------------------------------- derived unit costs

export interface UnitCosts {
  networkOneWay: number; // excl. last mile
  baseline: number; // today's cost of an RTO parcel
  avgAttempts: number; // new policy
  attemptsSaved: number; // ₹ per RTO parcel from the attempt cap
  pathA: number; // returned to seller under new policy
  sunk: number; // spent before the disposition decision
  acquisitionPrice: number;
  fulfilment: number; // blended local delivery / self-collect
  storagePerWeek: number;
}

export function unitCosts(a: Assumptions, price = a.aov): UnitCosts {
  const networkOneWay = a.costFmHubCarting + a.costFmSorting + a.costLineHaul + a.costRegional;
  const avgAttempts = (1 - a.cappedShare) * a.attemptsToday + a.cappedShare * a.cappedAttempts;
  const baseline = 2 * networkOneWay + a.attemptsToday * a.costLastMile;
  return {
    networkOneWay,
    baseline,
    avgAttempts,
    attemptsSaved: (a.attemptsToday - avgAttempts) * a.costLastMile,
    pathA: 2 * networkOneWay + avgAttempts * a.costLastMile,
    sunk: networkOneWay + avgAttempts * a.costLastMile,
    acquisitionPrice: price * (1 - a.acquisitionDiscount),
    fulfilment: a.localDelivery * (1 - a.selfCollectShare),
    storagePerWeek: ((a.rentPerSqftMonth / a.parcelsPerSqft) * 12) / 52,
  };
}

// ---------------------------------------------------------------- volumes

export interface Volumes {
  ordersBase: number; // Cr orders RTO rate is applied to
  rto: number;
  rtoCod: number;
  rtoPrepaid: number;
  pathA: number;
  poolB: number;
}

export function volumes(a: Assumptions): Volumes {
  const ordersBase = a.rtoBasis === 'shipped' ? a.annualOrders * a.shippedShare : a.annualOrders;
  const rtoCod = ordersBase * a.codShare * a.rtoRateCod;
  const rtoPrepaid = ordersBase * (1 - a.codShare) * a.rtoRatePrepaid;
  const rto = rtoCod + rtoPrepaid;
  return {
    ordersBase,
    rto,
    rtoCod,
    rtoPrepaid,
    pathA: rto * a.sellerBackShare,
    poolB: rto * (1 - a.sellerBackShare),
  };
}

// ---------------------------------------------------------------- paths

export type PathKind = 'return' | 'flash' | 'week' | 'salvage' | 'returnAfterFlash';

export interface Components {
  attemptsSaved: number;
  reverseAvoided: number;
  platformRevenue: number;
  resaleMargin: number;
  fulfilment: number;
  handling: number;
  commission: number;
  storage: number;
}

export interface PathRow {
  key: string; // 'A' | 'B1' | 'W1'..'Wn' | 'SALV' | 'RET'
  label: string;
  kind: PathKind;
  week: number; // weeks held locally (0 for A / B1)
  share: number; // of total RTO volume
  volume: number; // Cr orders
  realised: number; // ₹ the end buyer pays (0 if not resold)
  sellerReceives: number; // ₹ paid to the seller (0 = gets stock back)
  components: Components; // ₹ per parcel, signed as used in `saving`
  saving: number; // ₹ per parcel vs baseline
  netCost: number; // ₹ per parcel
  totalCostCr: number;
  savingCr: number;
}

const ZERO: Components = {
  attemptsSaved: 0,
  reverseAvoided: 0,
  platformRevenue: 0,
  resaleMargin: 0,
  fulfilment: 0,
  handling: 0,
  commission: 0,
  storage: 0,
};

export function componentSum(c: Components): number {
  return (
    c.attemptsSaved +
    c.reverseAvoided +
    c.platformRevenue +
    c.resaleMargin -
    c.fulfilment -
    c.handling -
    c.commission -
    c.storage
  );
}

/**
 * The weekly discount ladder for a mode. Under consignmentFloor it is drawn
 * inside the seller's floor (e.g. 15% floor → 3.75 / 7.5 / 11.25 / 15%) and,
 * with smaller discounts, sells through more slowly.
 */
export function ladder(a: Assumptions, mode: Mode) {
  return mode === 'consignmentFloor'
    ? {
        discounts: a.floorLadderSteps.map((s) => Math.round(s * a.sellerFloorDiscount * 1e4) / 1e4),
        sellThrough: Math.min(0.95, Math.max(0.05, a.floorSellThrough + a.floorSellThroughSlope * (a.sellerFloorDiscount - a.floorReference))),
      }
    : { discounts: a.ladderDiscounts, sellThrough: a.weeklySellThrough };
}

/** Share of the RTO pool (not Cr) landing in each path; independent of price. */
function cascadeShares(a: Assumptions, mode: Mode) {
  const { discounts, sellThrough } = ladder(a, mode);
  const b = 1 - a.sellerBackShare;
  const flashAllowed = mode !== 'consignmentFloor' || a.flashDiscount <= a.sellerFloorDiscount + 1e-9;
  const flash = flashAllowed ? b * a.flashClearance : 0;
  let left = b - flash;
  const weeks: number[] = [];
  let returnedAfterWeek = -1; // floor mode: week the ladder stopped (0 = straight after flash)
  for (let i = 0; i < discounts.length; i++) {
    if (mode === 'consignmentFloor' && discounts[i] > a.sellerFloorDiscount + 1e-9) {
      returnedAfterWeek = i;
      break;
    }
    const sold = left * sellThrough;
    weeks.push(sold);
    left -= sold;
  }
  // Salvage is a discount too: under the floor it needs the seller's consent, else the parcel goes back.
  if (mode === 'consignmentFloor' && returnedAfterWeek === -1 && 1 - a.salvageRate > a.sellerFloorDiscount + 1e-9) {
    returnedAfterWeek = discounts.length;
  }
  return {
    pathA: a.sellerBackShare,
    flash,
    weeks,
    salvage: returnedAfterWeek === -1 ? left : 0,
    returned: returnedAfterWeek === -1 ? 0 : left,
    returnedAfterWeek: Math.max(returnedAfterWeek, 0),
  };
}

/**
 * Per-parcel economics of every path for an item at `price` (defaults to AOV)
 * and the annual volume in each. Volumes always use the pool-level cascade.
 */
export function paths(a: Assumptions, mode: Mode = 'acquire', price = a.aov): PathRow[] {
  const u = unitCosts(a, price);
  const v = volumes(a);
  const s = cascadeShares(a, mode);
  const { discounts } = ladder(a, mode);
  const acquire = mode === 'acquire';
  const rows: PathRow[] = [];

  const push = (
    key: string,
    label: string,
    kind: PathKind,
    week: number,
    share: number,
    realised: number,
    sellerReceives: number,
    comp: Partial<Components>,
  ) => {
    const components = { ...ZERO, attemptsSaved: u.attemptsSaved, ...comp };
    const saving = componentSum(components);
    const netCost = u.baseline - saving;
    const volume = share * v.rto;
    rows.push({
      key,
      label,
      kind,
      week,
      share,
      volume,
      realised,
      sellerReceives,
      components,
      saving,
      netCost,
      totalCostCr: volume * netCost,
      savingCr: volume * saving,
    });
  };

  /** A resold parcel: revenue side depends on ownership model. */
  const resale = (realised: number, fee: number) =>
    acquire
      ? { platformRevenue: a.platformRevenue, resaleMargin: realised - u.acquisitionPrice }
      : { platformRevenue: Math.min(fee, realised), resaleMargin: 0 };
  const sellerGets = (realised: number, fee: number) =>
    acquire ? u.acquisitionPrice : Math.max(realised - Math.min(fee, realised), 0);

  // Path A — seller wants it back.
  push('A', 'Returned to seller', 'return', 0, s.pathA, 0, 0, {});

  // B1 — 24h flash sale, no holding.
  if (s.flash > 0) {
    const realised = price * (1 - a.flashDiscount);
    push('B1', '24h flash sale', 'flash', 0, s.flash, realised, sellerGets(realised, a.platformFee), {
      reverseAvoided: u.networkOneWay,
      fulfilment: u.fulfilment,
      ...resale(realised, a.platformFee),
    });
  }

  // B2 — weekly discount ladder at the local holding point.
  s.weeks.forEach((share, i) => {
    const n = i + 1;
    const realised = price * (1 - discounts[i]);
    push(`W${n}`, `Local hold · week ${n}`, 'week', n, share, realised, sellerGets(realised, a.platformFee), {
      reverseAvoided: u.networkOneWay,
      fulfilment: u.fulfilment,
      handling: a.handling,
      commission: a.commission,
      storage: u.storagePerWeek * n,
      ...resale(realised, a.platformFee),
    });
  });

  const heldWeeks = discounts.length;

  // Salvage after the ladder: no fulfilment or commission; bulk buyer collects.
  if (s.salvage > 0) {
    const realised = price * a.salvageRate;
    push('SALV', 'Salvaged', 'salvage', heldWeeks, s.salvage, realised, acquire ? u.acquisitionPrice : Math.max(realised - a.consignmentSalvageFee, 0), {
      reverseAvoided: u.networkOneWay,
      handling: a.handling,
      storage: u.storagePerWeek * heldWeeks,
      ...(acquire
        ? { resaleMargin: realised - u.acquisitionPrice }
        : { platformRevenue: Math.min(a.consignmentSalvageFee, realised) }),
    });
  }

  // Floor mode: couldn't sell above the seller's floor → reverse leg after all.
  if (s.returned > 0) {
    const w = s.returnedAfterWeek;
    push('RET', w === 0 ? 'Back to seller after flash sale' : `Back to seller after week ${w}`, 'returnAfterFlash', w, s.returned, 0, 0, {
      handling: w > 0 ? a.handling : 0,
      storage: u.storagePerWeek * w,
    });
  }

  return rows;
}

// ---------------------------------------------------------------- annual result

export interface WaterfallBar {
  key: 'attempts' | 'reverse' | 'resale' | 'costs' | 'net';
  label: string;
  value: number; // ₹ Cr, signed
  start: number; // running total before this bar (for floating bars)
  end: number;
  isTotal: boolean;
}

export interface Breakdown {
  // 1. cost avoided
  fewerAttemptsCr: number;
  reverseAvoidedCr: number;
  costAvoidedCr: number;
  // 2. revenue recovered
  platformRevenueCr: number;
  resaleMarginCr: number;
  revenueRecoveredCr: number;
  // 3. costs added (positive numbers, subtracted)
  fulfilmentCr: number;
  handlingCr: number;
  commissionCr: number;
  storageCr: number;
  costsAddedCr: number;
  // = net P&L impact
  netCr: number;
}

export interface ModelResult {
  mode: Mode;
  assumptions: Assumptions;
  unit: UnitCosts;
  volumes: Volumes;
  rows: PathRow[];
  breakdown: Breakdown;
  waterfall: WaterfallBar[];
  kpi: {
    baselineLossCr: number;
    newLossCr: number;
    netImpactCr: number;
    netImpactPct: number;
    savingPerRto: number; // ₹
    savingPerSellOff: number; // ₹, weighted over the Path B pool
    neverSentBackCr: number; // Cr orders not sent back to seller
    neverSentBackPct: number; // of RTO
    resoldCr: number; // Cr orders
    resoldPctOfOrders: number;
    gmvRecoveredCr: number; // ₹ Cr, resold parcels excl. salvage
    unrecoveredRtoRate: number; // (returned + salvaged) / orders
    codShareOfRto: number;
    lossPerOrder: number; // ₹ baseline loss / orders placed
    lossPctOfNmv: number;
    nmvPerOrder: number; // ₹ — distinct from AOV
  };
}

export function computeModel(a: Assumptions = DEFAULTS, mode: Mode = 'acquire'): ModelResult {
  const unit = unitCosts(a);
  const vol = volumes(a);
  const rows = paths(a, mode);

  const sumCr = (f: (r: PathRow) => number) => rows.reduce((t, r) => t + r.volume * f(r), 0);
  const bd: Breakdown = {
    fewerAttemptsCr: sumCr((r) => r.components.attemptsSaved),
    reverseAvoidedCr: sumCr((r) => r.components.reverseAvoided),
    costAvoidedCr: 0,
    platformRevenueCr: sumCr((r) => r.components.platformRevenue),
    resaleMarginCr: sumCr((r) => r.components.resaleMargin),
    revenueRecoveredCr: 0,
    fulfilmentCr: sumCr((r) => r.components.fulfilment),
    handlingCr: sumCr((r) => r.components.handling),
    commissionCr: sumCr((r) => r.components.commission),
    storageCr: sumCr((r) => r.components.storage),
    costsAddedCr: 0,
    netCr: 0,
  };
  bd.costAvoidedCr = bd.fewerAttemptsCr + bd.reverseAvoidedCr;
  bd.revenueRecoveredCr = bd.platformRevenueCr + bd.resaleMarginCr;
  bd.costsAddedCr = bd.fulfilmentCr + bd.handlingCr + bd.commissionCr + bd.storageCr;
  bd.netCr = bd.costAvoidedCr + bd.revenueRecoveredCr - bd.costsAddedCr;

  const baselineLossCr = vol.rto * unit.baseline;
  const newLossCr = rows.reduce((t, r) => t + r.totalCostCr, 0);
  const resold = rows.filter((r) => r.kind === 'flash' || r.kind === 'week');
  const resoldCr = resold.reduce((t, r) => t + r.volume, 0);
  const unrecovered = rows
    .filter((r) => r.kind === 'return' || r.kind === 'salvage' || r.kind === 'returnAfterFlash')
    .reduce((t, r) => t + r.volume, 0);
  const sentBack = rows
    .filter((r) => r.kind === 'return' || r.kind === 'returnAfterFlash')
    .reduce((t, r) => t + r.volume, 0);
  const poolBSaving = rows.filter((r) => r.kind !== 'return').reduce((t, r) => t + r.savingCr, 0);

  return {
    mode,
    assumptions: a,
    unit,
    volumes: vol,
    rows,
    breakdown: bd,
    waterfall: waterfall(bd),
    kpi: {
      baselineLossCr,
      newLossCr,
      netImpactCr: bd.netCr,
      netImpactPct: bd.netCr / baselineLossCr,
      savingPerRto: bd.netCr / vol.rto,
      savingPerSellOff: vol.poolB > 0 ? poolBSaving / vol.poolB : 0,
      neverSentBackCr: vol.rto - sentBack,
      neverSentBackPct: (vol.rto - sentBack) / vol.rto,
      resoldCr,
      resoldPctOfOrders: resoldCr / a.annualOrders,
      gmvRecoveredCr: resold.reduce((t, r) => t + r.volume * r.realised, 0),
      unrecoveredRtoRate: unrecovered / vol.ordersBase,
      codShareOfRto: vol.rtoCod / vol.rto,
      lossPerOrder: baselineLossCr / a.annualOrders,
      lossPctOfNmv: baselineLossCr / a.annualNmv,
      nmvPerOrder: a.annualNmv / a.annualOrders,
    },
  };
}

/** The deck's five-bar waterfall: attempts, reverse leg, resale revenue, costs added, net. */
export function waterfall(bd: Breakdown): WaterfallBar[] {
  const steps: [WaterfallBar['key'], string, number][] = [
    ['attempts', 'From fewer attempts', bd.fewerAttemptsCr],
    ['reverse', 'Avoiding reverse leg', bd.reverseAvoidedCr],
    ['resale', 'Resell revenue', bd.revenueRecoveredCr],
    ['costs', 'Fulfilment costs added', -bd.costsAddedCr],
  ];
  let run = 0;
  const bars: WaterfallBar[] = steps.map(([key, label, value]) => {
    const start = run;
    run += value;
    return { key, label, value, start, end: run, isTotal: false };
  });
  bars.push({ key: 'net', label: 'Net P&L impact', value: run, start: 0, end: run, isTotal: true });
  return bars;
}

export function compareModes(a: Assumptions = DEFAULTS): Record<Mode, ModelResult> {
  return {
    acquire: computeModel(a, 'acquire'),
    consignment: computeModel(a, 'consignment'),
    consignmentFloor: computeModel(a, 'consignmentFloor'),
  };
}

// ---------------------------------------------------------------- sensitivity

export interface SensitivityCell {
  clearance: number;
  col: number; // value on the column axis
  netCr: number;
  isDefault: boolean;
}

export interface SensitivityAxis {
  key: 'flashDiscount' | 'floorSellThrough';
  label: string;
  values: number[];
}

export const SENS_CLEARANCES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
export const SENS_DISCOUNTS = [0, 0.05, 0.1, 0.15, 0.2];
export const SENS_SELL_THROUGH = [0.2, 0.3, 0.35, 0.4, 0.5];

/**
 * The column axis that matters for a mode. Under Acquire, Meesho carries the
 * flash discount. Under consignment Meesho earns a fixed fee, so the discount
 * only moves the seller's payout; what moves Meesho is how fast the ladder sells.
 */
export function sensitivityAxis(mode: Mode): SensitivityAxis {
  return mode === 'consignmentFloor'
    ? { key: 'floorSellThrough', label: 'weekly sell-through', values: SENS_SELL_THROUGH }
    : { key: 'flashDiscount', label: 'flash-sale discount', values: SENS_DISCOUNTS };
}

/** Annual net P&L across flash-sale clearance (rows) × the mode's column axis. */
export function sensitivity(
  a: Assumptions = DEFAULTS,
  mode: Mode = 'acquire',
  clearances = SENS_CLEARANCES,
  axis: SensitivityAxis = sensitivityAxis(mode),
): SensitivityCell[][] {
  return clearances.map((clearance) =>
    axis.values.map((col) => ({
      clearance,
      col,
      netCr: computeModel({ ...a, flashClearance: clearance, [axis.key]: col }, mode).breakdown.netCr,
      isDefault: Math.abs(clearance - a.flashClearance) < 1e-9 && Math.abs(col - a[axis.key]) < 1e-9,
    })),
  );
}

// ---------------------------------------------------------------- per-parcel disposition

export type Disposition = 'return' | 'flash' | 'hold' | 'salvage';

export interface ParcelEV {
  price: number;
  sellerOptIn: boolean;
  /** ₹ saving vs today's ₹121 round trip, per option, if this parcel ends there */
  options: { key: Disposition; label: string; saving: number; netCost: number }[];
  /** probability-weighted ₹ saving of putting the parcel on the resale track */
  resaleTrackEV: number;
  /** probability-weighted ₹ saving of local hold, given the flash sale missed */
  holdEV: number;
  chosen: Disposition;
  chosenSaving: number; // EV of the chosen action
  reason: string;
}

/**
 * Decision for one refused parcel at the doorstep. The seller's opt-in decides
 * Path A vs B; the engine only chooses among resale options, and falls back to
 * return if the resale track is worth less than sending it back.
 */
export function parcelEV(a: Assumptions, price: number, sellerOptIn: boolean, mode: Mode = 'acquire'): ParcelEV {
  const rows = paths(a, mode, price);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const A = byKey.A;
  const flash = byKey.B1;
  const tail = rows.filter((r) => r.kind === 'week' || r.kind === 'salvage' || r.kind === 'returnAfterFlash');
  const tailShare = tail.reduce((t, r) => t + r.share, 0);
  const holdEV = tailShare > 0 ? tail.reduce((t, r) => t + r.share * r.saving, 0) / tailShare : 0;
  const poolShare = 1 - a.sellerBackShare;
  const resaleTrackEV =
    poolShare > 0 ? rows.filter((r) => r.kind !== 'return').reduce((t, r) => t + r.share * r.saving, 0) / poolShare : 0;

  const salv = byKey.SALV;
  const options: ParcelEV['options'] = [
    { key: 'return', label: 'Return to seller', saving: A.saving, netCost: A.netCost },
    ...(flash ? [{ key: 'flash' as const, label: '24h flash sale', saving: flash.saving, netCost: flash.netCost }] : []),
    { key: 'hold', label: 'Local hold (weekly ladder)', saving: holdEV, netCost: A.netCost + A.saving - holdEV },
    ...(salv ? [{ key: 'salvage' as const, label: 'Salvage', saving: salv.saving, netCost: salv.netCost }] : []),
  ];

  let chosen: Disposition = 'return';
  let reason: string;
  if (!sellerOptIn) {
    reason = 'Seller has opted out of local resale';
  } else if (!flash) {
    reason = 'Flash-sale discount exceeds the seller floor';
  } else if (resaleTrackEV > A.saving) {
    chosen = 'flash';
    reason = 'Resale track beats the reverse leg';
  } else {
    reason = 'Returning is cheaper than the resale track for this item';
  }
  return {
    price,
    sellerOptIn,
    options,
    resaleTrackEV,
    holdEV,
    chosen,
    chosenSaving: chosen === 'return' ? A.saving : resaleTrackEV,
    reason,
  };
}

// ---------------------------------------------------------------- buyer tiering

export type Tier = 1 | 2 | 3;

export const TIER_BANDS = { t2: 0.2, t3: 0.6 }; // customer-caused RTO share
export const MIN_HISTORY = 3; // orders before history counts (deck: minimum sample size)

export function bandTier(rate: number): Tier {
  return rate > TIER_BANDS.t3 ? 3 : rate >= TIER_BANDS.t2 ? 2 : 1;
}

export interface TierDecision {
  tier: Tier;
  historyRate: number | null; // null = not enough history
  historyTier: Tier | null;
  trustMeshTier: Tier;
  driver: 'history' | 'trustmesh' | 'both';
}

/**
 * TrustMesh (Meesho's existing pre-dispatch RTO predictor, 0–1) is kept as an
 * input, not replaced. Its probability is banded on the same thresholds as our
 * customer-caused RTO history, and the stricter of the two sets the tier —
 * turning TrustMesh's block/allow into a graded response.
 */
export function decideTier(customerCausedRtos: number, orders: number, trustMeshScore: number): TierDecision {
  const trustMeshTier = bandTier(trustMeshScore);
  const enough = orders >= MIN_HISTORY;
  const historyRate = enough ? customerCausedRtos / orders : null;
  const historyTier = historyRate === null ? null : bandTier(historyRate);
  const tier = Math.max(trustMeshTier, historyTier ?? 1) as Tier;
  const driver =
    historyTier === null || trustMeshTier > historyTier ? 'trustmesh' : historyTier > trustMeshTier ? 'history' : 'both';
  return { tier, historyRate, historyTier, trustMeshTier, driver };
}

export interface TierPolicy {
  cod: boolean;
  codToken: number; // ₹ refundable UPI token up front
  prepaidOnly: boolean;
  maxAttempts: number;
  selfPickupAfterAttempts: boolean;
  preDispatchReminder: boolean;
  confirmBeforeShip: boolean;
}

export function tierPolicy(tier: Tier): TierPolicy {
  switch (tier) {
    case 1:
      return { cod: true, codToken: 0, prepaidOnly: false, maxAttempts: 3, selfPickupAfterAttempts: false, preDispatchReminder: false, confirmBeforeShip: false };
    case 2:
      return { cod: true, codToken: 30, prepaidOnly: false, maxAttempts: 2, selfPickupAfterAttempts: true, preDispatchReminder: true, confirmBeforeShip: false };
    case 3:
      return { cod: false, codToken: 0, prepaidOnly: true, maxAttempts: 2, selfPickupAfterAttempts: false, preDispatchReminder: false, confirmBeforeShip: true };
  }
}

// ---------------------------------------------------------------- deck diagnosis

/** Deck's cause split of the ₹5,899 Cr baseline (₹ Cr). Shares are derived, not rounded. */
export const CAUSE_SPLIT_CR = { commitment: 4165, unreachable: 950, distribution: 784 };

export function causeSplit(baselineLossCr: number, split = CAUSE_SPLIT_CR) {
  const total = split.commitment + split.unreachable + split.distribution;
  return (Object.keys(split) as (keyof typeof split)[]).map((k) => ({
    key: k,
    share: split[k] / total,
    cr: (split[k] / total) * baselineLossCr,
  }));
}

// ---------------------------------------------------------------- price room (seller ↔ Meesho)

/** Sellers accept a resale floor anywhere in this band (seller interviews). */
export const FLOOR_BAND = { min: 0.1, max: 0.2 };

/** Meesho's opening floor per category, from local sell-through data. */
export const RECOMMENDED_FLOOR: Record<string, number> = { jewellery: 0.18, clothes: 0.12, shoes: 0.15 };

export interface SellerOutlook {
  floor: number;
  ladder: number[];
  pSell: number; // chance a refused parcel sells locally
  payoutIfSold: number; // ₹ expected payout, given it sells
  daysToCash: number; // expected days to payout, given it sells
  pBack: number; // chance it comes back to the seller anyway
  daysBack: number; // days until stock is back, if it comes back
  meeshoSaving: number; // ₹ Meesho saves vs today on this parcel
}

const DAYS_TO_PAYOUT = 2;
const RETURN_TRANSIT_DAYS = 6;

/**
 * What a floor means for one refused parcel, from both sides of the table. Used
 * by the price room so seller and Meesho negotiate over the same numbers.
 */
export function sellerOutlook(a: Assumptions, price: number, floor: number): SellerOutlook {
  const x = { ...a, sellerFloorDiscount: floor };
  const rows = paths(x, 'consignmentFloor', price).filter((r) => r.kind !== 'return');
  const pool = rows.reduce((t, r) => t + r.share, 0);
  const sold = rows.filter((r) => r.kind === 'flash' || r.kind === 'week' || r.kind === 'salvage');
  const back = rows.filter((r) => r.kind === 'returnAfterFlash');
  const pSold = sold.reduce((t, r) => t + r.share, 0);
  const days = (r: PathRow) => r.week * 7 + DAYS_TO_PAYOUT;
  return {
    floor,
    ladder: ladder(x, 'consignmentFloor').discounts,
    pSell: pool ? pSold / pool : 0,
    payoutIfSold: pSold ? sold.reduce((t, r) => t + r.share * r.sellerReceives, 0) / pSold : 0,
    daysToCash: pSold ? sold.reduce((t, r) => t + r.share * days(r), 0) / pSold : 0,
    pBack: pool ? back.reduce((t, r) => t + r.share, 0) / pool : 0,
    daysBack: back.length ? back[0].week * 7 + RETURN_TRANSIT_DAYS : 0,
    meeshoSaving: pool ? rows.reduce((t, r) => t + r.share * r.saving, 0) / pool : 0,
  };
}

export type ReplyKind = 'accept' | 'counter' | 'reject';

/**
 * Meesho's rule-based reply to a seller's proposed floor: accept anything within
 * 2 points of its recommendation, meet halfway otherwise, and reject outside the band.
 */
export function meeshoReply(recommended: number, proposed: number): { kind: ReplyKind; floor: number } {
  const eps = 1e-9;
  if (proposed < FLOOR_BAND.min - eps || proposed > FLOOR_BAND.max + eps) return { kind: 'reject', floor: recommended };
  if (proposed >= recommended - 0.02 - eps) return { kind: 'accept', floor: proposed };
  return { kind: 'counter', floor: Math.round(((proposed + recommended) / 2) * 100) / 100 };
}
// ---------------------------------------------------------------- buy-back price (Meesho buys a refused parcel)

/**
 * What decides the price Meesho pays a seller for a refused parcel. The seller
 * will not take less than the parcel is worth to her if it comes back; Meesho
 * will not pay more than it is worth to Meesho to sell it locally. Any price
 * in between leaves both better off, and they split that gap.
 */
export interface BuyBackInputs {
  damageRate: number; // chance returned stock comes back damaged or missing (seller interviews)
  repackCost: number; // ₹ to inspect, repack and relist a returned parcel
  returnDays: number; // days for a refused parcel to get back to the seller today
  resellDays: number; // days for the seller to sell it again herself
  capitalCost: number; // seller's yearly cost of working capital
  sellerShare: number; // share of the gain that goes to the seller (0.5 = an even split)
}

export const BUYBACK_DEFAULTS: BuyBackInputs = {
  damageRate: 0.08,
  repackCost: 15,
  returnDays: 21,
  resellDays: 30,
  capitalCost: 0.24,
  sellerShare: 0.5,
};

/** Category differences: jewellery breaks or goes missing more and sells slower; clothes less so. */
export const BUYBACK_BY_CATEGORY: Record<string, Partial<BuyBackInputs>> = {
  shoes: {},
  clothes: { damageRate: 0.06, resellDays: 25 },
  jewellery: { damageRate: 0.1, resellDays: 40 },
};

export interface BuyBackQuote {
  price: number;
  seller: { afterFee: number; fee: number; repack: number; damage: number; waiting: number; walkAway: number; days: number };
  meesho: { resale: number; localCosts: number; reverseAvoided: number; ceiling: number; pSold: number };
  deal: boolean;
  zone: number; // ₹ between the seller's walk-away and Meesho's ceiling
  offer: number; // ₹ Meesho pays the seller (0 if no deal)
  discount: number; // off the original price
  sellerGain: number; // vs taking the parcel back
  meeshoGain: number; // vs sending it back
}

export function buyBackQuote(a: Assumptions, price: number, b: BuyBackInputs = BUYBACK_DEFAULTS): BuyBackQuote {
  // Seller: if it comes back she can sell it again herself, minus the usual fee and repacking,
  // if it isn't damaged, and only after ~7 weeks of her money being tied up.
  const fee = a.platformFee;
  const afterFee = price - fee - b.repackCost;
  const days = b.returnDays + b.resellDays;
  const damage = afterFee * b.damageRate;
  const waiting = (afterFee - damage) * b.capitalCost * (days / 365);
  const walkAway = afterFee - damage - waiting;

  // Meesho: expected local resale (flash sale, weekly price steps, salvage), minus local costs,
  // plus the ₹29 reverse leg it no longer pays.
  const rows = paths(a, 'acquire', price).filter((r) => r.kind !== 'return');
  const pool = rows.reduce((t, r) => t + r.share, 0) || 1;
  const resale = rows.reduce((t, r) => t + r.share * r.realised, 0) / pool;
  const localCosts = rows.reduce((t, r) => t + r.share * (r.components.fulfilment + r.components.handling + r.components.commission + r.components.storage), 0) / pool;
  const reverseAvoided = unitCosts(a, price).networkOneWay;
  const ceiling = resale - localCosts + reverseAvoided;
  const pSold = rows.filter((r) => r.kind === 'flash' || r.kind === 'week').reduce((t, r) => t + r.share, 0) / pool;

  const zone = ceiling - walkAway;
  const deal = zone > 0;
  const offer = deal ? Math.round(walkAway + b.sellerShare * zone) : 0;
  return {
    price,
    seller: { afterFee, fee, repack: b.repackCost, damage, waiting, walkAway, days },
    meesho: { resale, localCosts, reverseAvoided, ceiling, pSold },
    deal,
    zone,
    offer,
    discount: deal ? 1 - offer / price : 0,
    sellerGain: deal ? offer - walkAway : 0,
    meeshoGain: deal ? ceiling - offer : 0,
  };
}

// ---------------------------------------------------------------- seller margin → how much discount to ask for

/**
 * Sellers told us they give bigger discounts on high-margin products and resist
 * them on thin ones. Meesho doesn't see a seller's costs, so it estimates the
 * margin from signals it does have, then asks for a discount that fits.
 */
export interface MarginSignals {
  category: string;
  price: number;
  wholesale?: number; // price of the closest matching wholesale listing (image match), if found
  sellerType: 'manufacturer' | 'reseller';
  pastMaxDiscount: number; // deepest discount the seller has run in past sale events
  priceVsPeers: number; // this listing's price ÷ median of similar listings
}

/** Typical gross margins for unbranded products on Meesho, by category (assumption, to be fitted on data). */
export const CATEGORY_MARGIN: Record<string, number> = { jewellery: 0.5, clothes: 0.35, shoes: 0.28 };

export type MarginBand = 'low' | 'medium' | 'high';
export const MARGIN_BANDS = { low: 0.2, high: 0.4 }; // below 20% = low, above 40% = high
export const DISCOUNT_CAP: Record<MarginBand, number> = { low: 0.1, medium: 0.1, high: 0.15 };

export interface MarginEstimate {
  fromWholesale?: number; // margin implied by the wholesale match
  fromSignals: number; // margin implied by the other signals
  parts: { label: string; value: number }[]; // how fromSignals is built
  margin: number; // blended estimate
  band: MarginBand;
  cap: number; // most discount Meesho asks for
}

export function estimateMargin(s: MarginSignals, fee = 47): MarginEstimate {
  const base = CATEGORY_MARGIN[s.category] ?? 0.3;
  const parts = [
    { label: `Typical ${s.category} margin`, value: base },
    { label: s.priceVsPeers >= 1 ? 'Priced above similar listings' : 'Priced below similar listings', value: 0.5 * (s.priceVsPeers - 1) },
    { label: s.sellerType === 'manufacturer' ? 'Makes it herself' : 'Buys it to resell', value: s.sellerType === 'manufacturer' ? 0.06 : -0.06 },
    { label: `Has run discounts up to ${Math.round(s.pastMaxDiscount * 100)}%`, value: 0.6 * (s.pastMaxDiscount - 0.15) },
  ];
  const fromSignals = parts.reduce((t, p) => t + p.value, 0);
  const fromWholesale = s.wholesale !== undefined ? (s.price - s.wholesale - fee) / s.price : undefined;
  const margin = Math.max(0, fromWholesale !== undefined ? 0.6 * fromWholesale + 0.4 * fromSignals : fromSignals);
  const band: MarginBand = margin < MARGIN_BANDS.low ? 'low' : margin > MARGIN_BANDS.high ? 'high' : 'medium';
  // Thin margins: ask for at most half the margin, up to 10%.
  const cap = band === 'low' ? Math.min(DISCOUNT_CAP.low, Math.round((margin / 2) * 100) / 100) : DISCOUNT_CAP[band];
  return { fromWholesale, fromSignals, parts, margin, band, cap };
}

// ---------------------------------------------------------------- local demand → flash-sale sell-through

/**
 * Chance a refused parcel sells within 24 hours, built up from things Meesho
 * already measures: how many people in the pincode shop that category and size
 * each day, how many see the "near you, today" card, and how many of those buy.
 */
export interface DemandFunnel {
  shoppersPerDay: number; // people in the pincode browsing this category and size today
  reach: number; // share who see the "near you · get it today" card
  conversion: number; // share of those who buy at full price
}

export const DEMAND_DEFAULTS: DemandFunnel = { shoppersPerDay: 36, reach: 0.7, conversion: 0.02 };

export function flashSellThrough(d: DemandFunnel): number {
  return 1 - Math.pow(1 - d.reach * d.conversion, d.shoppersPerDay);
}

/** The buy decision at a margin-based ask: buy if Meesho can afford it, else sell it for the seller. */
export function buyDecision(q: BuyBackQuote, cap: number) {
  const ask = Math.round(q.price * (1 - cap));
  const affordable = ask <= q.meesho.ceiling;
  const above = ask >= q.seller.walkAway;
  return {
    ask,
    kind: (affordable && above ? 'buy' : 'consign') as 'buy' | 'consign',
    meeshoGain: q.meesho.ceiling - ask,
    sellerGain: ask - q.seller.walkAway,
  };
}

// ---------------------------------------------------------------- one refused parcel, end to end (for the pitch)

/**
 * Meesho's money on one refused parcel, counted from the moment the order was
 * placed. Today it goes back. With our solution it is sold near the buyer: in the 24h
 * flash sale, or later from a kirana; a few still go back after 4 weeks.
 */
export function refusedParcel(a: Assumptions, price: number, floor: number, attempts: number) {
  const x = { ...a, sellerFloorDiscount: floor };
  const rows = paths(x, 'consignmentFloor', price).filter((r) => r.kind !== 'return');
  const pool = rows.reduce((t, r) => t + r.share, 0) || 1;
  const way = unitCosts(a, price).networkOneWay;
  const sunk = way + attempts * a.costLastMile; // spent before the refusal, whatever happens next
  const local = (r: PathRow) => r.components.fulfilment + r.components.handling + r.components.commission + r.components.storage;
  const flashRow = rows.find((r) => r.kind === 'flash');
  const weeks = rows.filter((r) => r.kind === 'week');
  const back = rows.filter((r) => r.kind === 'returnAfterFlash');
  const wShare = weeks.reduce((t, r) => t + r.share, 0);
  const avg = (rs: PathRow[], f: (r: PathRow) => number) => (rs.length ? rs.reduce((t, r) => t + r.share * f(r), 0) / rs.reduce((t, r) => t + r.share, 0) : 0);

  const today = -(sunk + way);
  const flash = flashRow ? { share: flashRow.share / pool, buyerPays: flashRow.realised, fee: flashRow.components.platformRevenue, local: local(flashRow) } : null;
  const kirana = weeks.length
    ? { share: wShare / pool, buyerLow: Math.min(...weeks.map((r) => r.realised)), buyerHigh: Math.max(...weeks.map((r) => r.realised)), fee: avg(weeks, (r) => r.components.platformRevenue), local: avg(weeks, local) }
    : null;
  const unsold = back.length ? { share: back.reduce((t, r) => t + r.share, 0) / pool, local: avg(back, local) } : null;
  const outcomes = [
    ...(flash ? [{ key: 'flash' as const, share: flash.share, net: flash.fee - sunk - flash.local }] : []),
    ...(kirana ? [{ key: 'kirana' as const, share: kirana.share, net: kirana.fee - sunk - kirana.local }] : []),
    ...(unsold ? [{ key: 'unsold' as const, share: unsold.share, net: -(sunk + unsold.local + way) }] : []),
  ];
  const average = outcomes.reduce((t, o) => t + o.share * o.net, 0);
  return { sunk, way, today, flash, kirana, unsold, outcomes, average, saving: average - today };
}

// ---------------------------------------------------------------- buy-back plan: how the price is agreed

/**
 * Meesho buys the refused parcel at a discount and resells it at full price.
 * The seller gets her price, less the discount, less Meesho's usual fee (as on
 * any order), paid in 2 days. Meesho keeps its fee plus the discount when it
 * resells at full price. The discount Meesho asks for comes from her margin
 * band; the least it will accept is where buying stops beating simply selling
 * the parcel for her (consignment).
 */
/** Predicted share sold in the 24h flash sale at or above which a parcel counts as a fast seller (assumption, to be tuned in the pilot). */
export const FAST_SELL = 0.6;

export function buyPlan(a: Assumptions, price: number, signals: Omit<MarginSignals, 'category' | 'price'> & { category: string }, demand: DemandFunnel) {
  const margin = estimateMargin({ ...signals, price }, a.platformFee);
  const fee = a.platformFee;
  const flash = flashSellThrough(demand);
  const x = { ...a, flashClearance: flash };
  const q = buyBackQuote(x, price, { ...BUYBACK_DEFAULTS, ...BUYBACK_BY_CATEGORY[signals.category] });
  const consign = refusedParcel(x, price, margin.cap, 0);
  const consignNet = consign.average + consign.sunk; // from the refusal onwards: what's already spent doesn't count
  const sellerGets = (d: number) => Math.round(price * (1 - d) - fee);
  const buyNet = (d: number) => q.meesho.resale - q.meesho.localCosts - sellerGets(d);
  // Least discount at which buying is worth more to Meesho than selling it for her.
  const minDiscount = Math.max(0, Math.ceil(((consignNet - q.meesho.resale + q.meesho.localCosts + price - fee) / price) * 100) / 100);
  // Ask for her margin band's discount, but never pay her less than the parcel is worth to her back.
  const sellerMax = Math.max(0, Math.floor((1 - (q.seller.walkAway + fee) / price) * 100) / 100);
  // Step 1 is always the margin-based discount. Fast sellers can get a second offer at 0% if the seller declines.
  const fastSeller = flash >= FAST_SELL;
  const ask = Math.min(margin.cap, sellerMax);
  const worthBuying = minDiscount <= ask;
  const flashLocal = consign.flash?.local ?? 0;
  return {
    margin,
    fee,
    flash,
    normalPayout: price - fee,
    fastSeller,
    ask,
    minDiscount,
    worthBuying,
    sellerGets,
    sellerWalkAway: q.seller.walkAway,
    sellerMax,
    keepsIfFlash: (d: number) => price - sellerGets(d) - flashLocal,
    buyNet,
    consignNet,
    returnNet: -consign.way,
  };
}

// ---------------------------------------------------------------- ownership: buy before or after the flash sale

/**
 * Once Meesho owns a refused parcel it never sends it back: if it doesn't sell
 * in the pincode it widens the circle (whole city, then a normal listing anywhere
 * in India) and only clears what's left in bulk. Assumptions, to be tested in the pilot.
 */
export const WIDEN = {
  kirana: { weeks: [0.05, 0.1], sellThrough: 0.35 }, // weeks 1–2 in the pincode, % off each week
  city: { discount: 0.1, sellThrough: 0.6, moveCost: 10 }, // week 3: all pincodes in the city, next-day delivery
  india: { discount: 0.15, sellThrough: 0.6, weeks: 2 }, // weeks 4–5: a normal listing, ships in a day
  bulk: { rate: 0.35, cost: 10 }, // what's left goes to local resellers
};

export interface WidenStage {
  key: 'kirana' | 'city' | 'india' | 'bulk';
  label: string;
  when: string;
  discount: number;
  share: number; // of all refused parcels
}

export function ownershipPlan(a: Assumptions, price: number, signals: Omit<MarginSignals, 'category' | 'price'> & { category: string }, demand: DemandFunnel, discount?: number, widen = WIDEN, extraCost = 0) {
  const base = buyPlan(a, price, signals, demand);
  const d = discount ?? base.ask;
  const fee = a.platformFee;
  const flash = base.flash;
  const u = unitCosts(a, price);
  // Flash-sale buyers get it home (₹21) or collect it at a kirana: ₹10 to the kirana, ₹4 for the rider's stop, ₹5 off for the buyer.
  const flashLocal = (1 - a.selfCollectShare) * a.localDelivery + a.selfCollectShare * (PICKUP_DEFAULTS.kiranaFee + PICKUP_DEFAULTS.dropCost + PICKUP_DISCOUNT);
  const kiranaCost = a.handling + a.commission + u.fulfilment;
  const indiaShip = u.networkOneWay + a.costLastMile;
  const W = widen; // stress tests can slow the later steps down

  // What Meesho earns on the parcels that don't sell in the flash sale, once it owns them (before paying for them).
  let left = 1 - flash;
  let tail = 0;
  const stages: WidenStage[] = [];
  let kSold = 0;
  let days = 0; // parcel-days Meesho holds stock it has paid for
  W.kirana.weeks.forEach((disc, i) => {
    const sold = left * W.kirana.sellThrough;
    tail += sold * (price * (1 - disc) - kiranaCost - u.storagePerWeek * (i + 1));
    kSold += sold;
    days += sold * 7 * (i + 1);
    left -= sold;
  });
  stages.push({ key: 'kirana', label: 'Kirana, same pincode', when: 'Weeks 1–2', discount: W.kirana.weeks[W.kirana.weeks.length - 1], share: kSold });
  const citySold = left * W.city.sellThrough;
  tail += citySold * (price * (1 - W.city.discount) - W.city.moveCost - a.costLastMile - a.handling);
  days += citySold * 21;
  left -= citySold;
  stages.push({ key: 'city', label: 'Whole city', when: 'Week 3', discount: W.city.discount, share: citySold });
  let indiaSold = 0;
  for (let w = 0; w < W.india.weeks; w++) {
    const sold = left * W.india.sellThrough;
    tail += sold * (price * (1 - W.india.discount) - indiaShip);
    indiaSold += sold;
    days += sold * 7 * (4 + w);
    left -= sold;
  }
  stages.push({ key: 'india', label: 'Anywhere in India', when: 'Weeks 4–5', discount: W.india.discount, share: indiaSold });
  tail += left * (price * W.bulk.rate - W.bulk.cost);
  tail -= (1 - flash) * extraCost; // stress tests: extra handling on every parcel that misses the flash sale
  days += left * 42;
  stages.push({ key: 'bulk', label: 'Bulk to local resellers', when: 'After week 5', discount: 1 - W.bulk.rate, share: left });

  const sellerNow = base.sellerGets(d);
  // Paying her before the parcel resells ties up Meesho's money for the weeks it takes to sell.
  const heldDays = flash < 1 ? days / (1 - flash) : 0;
  const capital = sellerNow * BUYBACK_DEFAULTS.capitalCost * (heldDays / 365);
  const consign = base.consignNet - OPS_COST - flash * a.selfCollectShare * PICKUP_DISCOUNT;
  // Base offer: full price if it sells in the 24h flash sale (Meesho keeps its usual charge), else Meesho pays the agreed price.
  const buyAfter = flash * (fee - flashLocal) + tail - (1 - flash) * (sellerNow + capital) - OPS_COST;
  // Later experiment: pay her the agreed price up front, before the flash sale.
  const buyBefore = flash * (price - flashLocal) + tail - sellerNow - (1 - flash) * capital - OPS_COST;
  // Least discount at which buying up front still beats selling it for her.
  const minDiscount = Math.max(0, Math.ceil(((consign - flash * (price - flashLocal) - tail + price - fee) / price) * 100) / 100);
  // How low Meesho can go: buying is worth it as long as the expected resale beats paying for the trip back,
  // which is all Meesho can still save once the buyer has refused (the forward trip is already spent).
  const capPerRupee = 1 + (1 - flash) * BUYBACK_DEFAULTS.capitalCost * (heldDays / 365); // money tied up scales with what she is paid
  const resaleValue = flash * (price - flashLocal) + tail - OPS_COST;
  const atZero = resaleValue - (price - fee) * capPerRupee; // Meesho's result if it pays her full price less the shipping charge
  const maxPay = (resaleValue + u.networkOneWay) / capPerRupee; // most Meesho can pay and still beat sending it back
  const minVsReturn = Math.max(0, Math.ceil((1 - (maxPay + fee) / price) * 100) / 100);
  return {
    ...base,
    d,
    minDiscount,
    minVsReturn,
    atZero,
    // Step 2: if the seller declines the discount, ask once more at 0% off, but only for fast sellers that still beat sending it back.
    zeroOffer: base.fastSeller && atZero > -u.networkOneWay,
    stages,
    tail,
    capital,
    heldDays,
    sellerNow,
    sellerIfFlash: price - fee,
    sellerAfterAvg: flash * (price - fee) + (1 - flash) * sellerNow,
    meesho: { today: -u.networkOneWay, consign, buyAfter, buyBefore },
    keepsOnFlash: { before: price - sellerNow - flashLocal, after: fee - flashLocal },
  };
}

// ---------------------------------------------------------------- kirana pickup vs home delivery

/**
 * Is it worth paying a buyer to collect from a kirana instead of a home drop?
 * Home: ₹21 per attempt, and some attempts fail. Pickup: the rider drops it at
 * the kirana on his route (shared stop) and the kirana gets a small fee.
 */
export interface PickupInputs {
  firstAttemptFail: number; // chance a home attempt fails
  maxAttempts: number;
  attemptCost: number; // ₹ per last-mile attempt
  kiranaFee: number; // ₹ to the kirana per pickup handed over
  dropCost: number; // ₹ per parcel for the rider's stop at the kirana
}

/** Flat discount for collecting from a kirana instead of a home drop. */
export const PICKUP_DISCOUNT = 5;

/** ₹ per resale parcel for the seal check, buyer support and payments (assumption). */
export const OPS_COST = 3;

export const PICKUP_DEFAULTS: Omit<PickupInputs, 'firstAttemptFail' | 'maxAttempts'> = { attemptCost: 21, kiranaFee: 10, dropCost: 4 };

export function pickupVsHome(p: PickupInputs) {
  let attempts = 0;
  for (let k = 0; k < p.maxAttempts; k++) attempts += Math.pow(p.firstAttemptFail, k);
  const failedAll = Math.pow(p.firstAttemptFail, p.maxAttempts);
  const pickup = p.kiranaFee + p.dropCost;
  const home = attempts * p.attemptCost + failedAll * pickup; // after the last failed attempt it goes to pickup anyway
  const saving = home - pickup;
  const discount = saving >= PICKUP_DISCOUNT ? PICKUP_DISCOUNT : 0; // flat ₹5 off, only where pickup saves at least that
  return { attempts, home, pickup, saving, discount, meeshoKeeps: saving - discount };
}

// ---------------------------------------------------------------- local holding capacity

/** Valmo's footprint: ~15,000 pincodes (deck, "Meesho's strengths"; Business Standard). */
export const VALMO_PINCODES = 15000;

export interface HoldingNeed {
  rtoPerPincodePerDay: number;
  intoHoldPerDay: number; // parcels per pincode per day that miss the flash sale and wait locally
  avgDaysHeld: number;
  stockPerPincode: number; // parcels waiting at any moment, per pincode, at full rollout
}

/**
 * How much local holding space an average pincode needs at full rollout:
 * parcels entering local hold per day × how long they wait (Little's law).
 */
export function holdingNeed(a: Assumptions, mode: Mode, pincodes = VALMO_PINCODES): HoldingNeed {
  const rows = paths(a, mode).filter((r) => r.week > 0);
  const share = rows.reduce((t, r) => t + r.share, 0);
  const avgWeeks = share ? rows.reduce((t, r) => t + r.share * r.week, 0) / share : 0;
  const rtoPerPincodePerDay = (volumes(a).rto * 1e7) / 365 / pincodes;
  const intoHoldPerDay = rtoPerPincodePerDay * share;
  return { rtoPerPincodePerDay, intoHoldPerDay, avgDaysHeld: avgWeeks * 7, stockPerPincode: intoHoldPerDay * avgWeeks * 7 };
}
// ---------------------------------------------------------------- what a partner store earns

export interface PartnerEstimate {
  capacity: number; // parcels the shelf holds
  holdsPerDay: number;
  pickupsPerDay: number;
  monthly: number; // ₹ a month
  shelfRentValue: number; // ₹ a month the same shelf would cost to rent as warehouse space
}

/**
 * A new Pados Point's likely earnings: it fills its shelf (at `utilisation`) with
 * parcels that wait the model's average time, and shares its pincode's resale
 * pickups with the other `pointsInPincode` partners. ₹handling per parcel held,
 * ₹commission per pickup handed over.
 */
export function partnerEstimate(a: Assumptions, mode: Mode, shelfSqft: number, pointsInPincode = 12, utilisation = 0.7): PartnerEstimate {
  const need = holdingNeed(a, mode);
  const capacity = shelfSqft * a.parcelsPerSqft;
  const holdsPerDay = need.avgDaysHeld ? (capacity * utilisation) / need.avgDaysHeld : 0;
  const resoldShare = paths(a, mode)
    .filter((r) => r.kind === 'flash' || r.kind === 'week')
    .reduce((t, r) => t + r.share, 0);
  const pickupsPerDay = (need.rtoPerPincodePerDay * resoldShare * a.selfCollectShare) / pointsInPincode;
  return {
    capacity,
    holdsPerDay,
    pickupsPerDay,
    monthly: 30 * (holdsPerDay * a.handling + pickupsPerDay * a.commission),
    shelfRentValue: shelfSqft * a.rentPerSqftMonth,
  };
}