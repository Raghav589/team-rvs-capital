/**
 * The one shared in-memory state. Every persona view reads and writes here, so
 * an action in one view shows up in all the others. Reset rebuilds the seed.
 */
import { useContext, useMemo, useReducer, type ReactNode } from 'react';
import { StoreCtx as Ctx } from './storeContext';
import { DEFAULTS, DEMAND_DEFAULTS, PICKUP_DISCOUNT, RECOMMENDED_FLOOR, decideTier, ladder, meeshoReply, ownershipPlan, parcelEV, tierPolicy, type Assumptions, type Mode, type Tier } from './model';
import {
  DEMO_START_MIN,
  HUBS,
  KIRANAS,
  PROSPECT_STAGES,
  RIDERS,
  LISTING_SIGNALS,
  buildWorld,
  dist,
  reasonInfo,
  toLatLng,
  type Buyer,
  type DealRequest,
  type Kirana,
  type DoorPhoto,
  type PriceMsg,
  type Prospect,
  type Outcome,
  type Parcel,
  type Product,
  type ReasonCode,
  type Seller,
  type StoreType,
  type World,
} from './seed';

export const GPS_RADIUS_M = 100;
export const FAR_KM = 10;
export const FAR_BONUS = 15; // ₹ per far drop
export const FLASH_MIN = 24 * 60;

export interface FeedEvent {
  id: number;
  at: number;
  who: 'buyer' | 'rider' | 'engine' | 'seller' | 'nearby';
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

export interface State {
  world: World;
  clock: number; // minutes since 00:00 on demo day
  assumptions: Assumptions;
  mode: Mode;
  rider: {
    id: string;
    pos: { x: number; y: number };
    activeParcelId?: string;
    calls: Record<string, number>; // parcelId → minute of logged call
    photos: Record<string, DoorPhoto>; // parcelId → doorstep photo from the in-app camera
  };
  tierOverride: Record<string, Tier | undefined>; // dev panel
  appeals: Record<string, { at: number; reason: string }>; // buyerId → pending tier appeal
  feed: FeedEvent[];
  lastDecision?: { parcelId: string; at: number };
  /** Whose phone the customer app is showing: Keshav, or Harshita next door. */
  shopper: string;
  /** A new kirana signing up in the partner app. */
  onboarding: Onboarding;
  demo: { active: boolean; step: number };
}

export interface PartnerProfile {
  storeType: StoreType;
  name: string;
  owner: string;
  phone: string;
  address: string;
  landmark: string;
  pincode: string;
  opens: string;
  closes: string;
  sundays: boolean;
}

export interface Onboarding {
  profile?: PartnerProfile;
  spacePhoto?: { at: number; lat: number; lng: number };
  spaceOk?: boolean; // they reviewed the photo and moved on
  lessons: string[]; // training lessons completed
  kyc: boolean;
  payoutTo?: string;
  signed?: { at: number; name: string };
  approved?: { at: number; parcels: number };
}

const NO_ONBOARDING: Onboarding = { lessons: [], kyc: false };

export type Action =
  | { type: 'RESET' }
  | { type: 'SET_ASSUMPTION'; key: keyof Assumptions; value: Assumptions[keyof Assumptions] }
  | { type: 'RESET_ASSUMPTIONS' }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'TICK'; minutes: number }
  | { type: 'PLACE_ORDER'; buyerId: string; product: Product; payment: 'COD' | 'Prepaid'; token: number; deliverTo?: string; window?: string }
  | { type: 'PARTNER_APPLY'; application: Omit<Prospect, 'id' | 'stage' | 'appliedDaysAgo'> }
  | { type: 'PARTNER_ADVANCE'; id: string }
  | { type: 'RIDER_SELECT'; parcelId?: string }
  | { type: 'RIDER_MOVE'; x: number; y: number }
  | { type: 'RIDER_TELEPORT'; x: number; y: number }
  | { type: 'RIDER_CALL'; parcelId: string }
  | { type: 'RIDER_PHOTO'; parcelId: string }
  | { type: 'RIDER_OUTCOME'; parcelId: string; outcome: Outcome; reason?: ReasonCode }
  | { type: 'DISPOSE'; parcelId: string; choice?: 'flash' | 'return' }
  | { type: 'BUY'; parcelId: string; buyerId: string; via: 'delivery' | 'pickup' }
  | { type: 'COMPLETE_LOCAL'; parcelId: string }
  | { type: 'SELLER_UPDATE'; sellerId: string; patch: Partial<Seller> }
  | { type: 'PRICE_PROPOSE'; sellerId: string; floor: number }
  | { type: 'PRICE_ACCEPT'; sellerId: string }
  | { type: 'DEAL_REQUEST'; parcelId: string }
  | { type: 'DEAL_RESPOND'; dealId: string; accept: boolean }
  | { type: 'TIER_OVERRIDE'; buyerId: string; tier?: Tier }
  | { type: 'BUYER_PATCH'; buyerId: string; patch: Partial<Buyer> }
  | { type: 'APPEAL'; buyerId: string; reason: string }
  | { type: 'SHOPPER'; buyerId: string }
  | { type: 'ONBOARD'; patch: Partial<Onboarding> }
  | { type: 'ONBOARD_RESET' }
  | { type: 'DEMO'; active: boolean; step?: number };

// ---------------------------------------------------------------- selectors

export const hubOf = (id: string) => HUBS.find((h) => h.id === id)!;
export const riderOf = (id: string) => RIDERS.find((r) => r.id === id)!;
export const kiranaOf = (id: string) => KIRANAS.find((k) => k.id === id)!;

/** The seller opted in, and hasn't excluded this product type from local resale. */
export function sellerAllowsResale(seller: Seller, p: Parcel) {
  return seller.optIn && !seller.exclusions.some((e) => p.title.toLowerCase().includes(e.toLowerCase()));
}

export function buyerTier(s: State, b: Buyer) {
  const d = decideTier(b.customerCausedRtos, b.orders, b.trustMesh);
  const o = s.tierOverride[b.id];
  return o ? { ...d, tier: o, overridden: true } : { ...d, overridden: false };
}

/** Metres between the rider and a parcel's address. */
export const riderDistanceM = (s: State, p: Parcel) => Math.round(dist(s.rider.pos, p) * 1000);

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/**
 * Why an outcome cannot be logged yet, or null if it can. Single source of
 * truth for the rider UI locks and the store's block-and-flag.
 */
export function outcomeBlocker(s: State, p: Parcel, outcome: Outcome): string | null {
  const d = riderDistanceM(s, p);
  if (d > GPS_RADIUS_M) return `GPS ${fmtDist(d)} from address (limit ${GPS_RADIUS_M} m)`;
  if (outcome === 'not_home') {
    if (s.rider.calls[p.id] === undefined) return 'No call attempt logged';
    const photo = s.rider.photos[p.id];
    if (!photo) return 'No doorstep photo from the in-app camera';
    if (photo.distanceM > GPS_RADIUS_M) return `Doorstep photo taken ${fmtDist(photo.distanceM)} from address`;
  }
  return null;
}

export function riderTrust(s: State, riderId: string) {
  const logs = s.world.logs.filter((l) => l.riderId === riderId);
  const blocked = s.world.blocked.filter((b) => b.riderId === riderId).length;
  const verified = logs.filter((l) => l.verified).length;
  const total = logs.length + blocked;
  return { verified, total, blocked, score: total ? verified / total : 1 };
}

/**
 * Nearest holding point. Buyers collect from kiranas only; a parcel waiting out
 * its weekly ladder can sit at a kirana or a courier partner's depot.
 */
export function nearestKirana(p: { x: number; y: number }, pincode?: string, kinds: Kirana['kind'][] = ['kirana']) {
  const ofKind = KIRANAS.filter((k) => kinds.includes(k.kind));
  const pool = pincode ? ofKind.filter((k) => k.pincode === pincode) : ofKind;
  return [...(pool.length ? pool : ofKind)].sort((a, b) => dist(a, p) - dist(b, p))[0];
}

/**
 * What a nearby buyer pays for a refused parcel right now, and what its seller
 * receives. Flash sale: the flash discount. Local hold: the week-1 step of the
 * seller's ladder. Shared by the storefront and the BUY action.
 */
export function resaleOffer(s: State, p: Parcel) {
  const seller = s.world.sellers.find((x) => x.id === p.sellerId)!;
  const week1 = ladder({ ...s.assumptions, sellerFloorDiscount: seller.floor }, s.mode).discounts[0] ?? 0;
  const discount = p.status === 'held' ? week1 : s.assumptions.flashDiscount;
  const price = Math.round(p.price * (1 - discount));
  // Meesho bought the parcel when the buyer refused: the seller gets the price agreed on the Pricing tab, whatever it later sells for.
  const sig = LISTING_SIGNALS[p.title];
  const sellerGets = sig
    ? ownershipPlan(s.assumptions, p.price, { category: p.category, ...sig }, { ...DEMAND_DEFAULTS, shoppersPerDay: sig.shoppersPerDay }).sellerNow
    : Math.max(Math.round(p.price * (1 - seller.floor)) - s.assumptions.platformFee, 0);
  return { price, discount, sellerGets, floor: seller.floor };
}

/**
 * What a holding point is doing: the last 7 days from the seed, plus anything
 * that happens live in the demo today (a new hold, a buyer collecting with a code).
 */
export function holdingPointStats(s: State, k: Kirana) {
  const a = s.assumptions;
  const today = (p: Parcel) => (p.resale?.at ?? p.refusedAt ?? 0) >= DEMO_START_MIN;
  const holding = s.world.parcels.filter((p) => p.status === 'held' && p.kiranaId === k.id).length;
  const livePickups = s.world.parcels.filter((p) => p.resale?.mode === 'pickup' && p.kiranaId === k.id && today(p)).length;
  const liveHolds = s.world.parcels.filter((p) => p.status === 'held' && p.kiranaId === k.id && today(p)).length;
  const holds = k.weekHolds + liveHolds;
  const pickups = k.weekPickups + livePickups;
  return { holding, holds, pickups, earned: holds * a.handling + pickups * a.commission };
}
export const fmtClock = (min: number) => {
  const day = Math.floor(min / (24 * 60));
  const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const t = `${((h + 11) % 12) + 1}:${mm} ${ampm}`;
  return day === 0 ? t : day > 0 ? `${t} · +${day}d` : `${t} · ${day}d`;
};

// ---------------------------------------------------------------- reducer

export function initialState(): State {
  const world = buildWorld();
  const hub = hubOf('H1');
  return {
    world,
    clock: DEMO_START_MIN,
    assumptions: DEFAULTS,
    mode: 'consignmentFloor',
    rider: { id: 'R1', pos: { x: hub.x, y: hub.y }, calls: {}, photos: {} },
    tierOverride: {},
    appeals: {},
    shopper: 'B01',
    onboarding: NO_ONBOARDING,
    feed: [{ id: 1, at: DEMO_START_MIN, who: 'engine', text: 'Day starts. 8 parcels out for delivery with Archit from Vijay Nagar hub.', tone: 'info' }],
    demo: { active: false, step: 0 },
  };
}

let feedId = 100;
const ev = (s: State, who: FeedEvent['who'], text: string, tone: FeedEvent['tone'] = 'info'): FeedEvent[] =>
  [{ id: ++feedId, at: s.clock, who, text, tone }, ...s.feed].slice(0, 60);

const patchParcel = (s: State, id: string, patch: Partial<Parcel>): World => ({
  ...s.world,
  parcels: s.world.parcels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

const patchBuyer = (w: World, id: string, patch: (b: Buyer) => Partial<Buyer>): World => ({
  ...w,
  buyers: w.buyers.map((b) => (b.id === id ? { ...b, ...patch(b) } : b)),
});

function pickupCode(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9000;
  return String(1000 + h);
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'RESET':
      return initialState();

    case 'SET_ASSUMPTION':
      return { ...s, assumptions: { ...s.assumptions, [a.key]: a.value } };

    case 'RESET_ASSUMPTIONS':
      return { ...s, assumptions: DEFAULTS };

    case 'SET_MODE':
      return { ...s, mode: a.mode };

    case 'TICK': {
      const clock = s.clock + a.minutes;
      // Flash sales that expire unsold move to the nearest partner kirana (local hold, weekly ladder).
      let world = s.world;
      let feed = s.feed;
      world.parcels.forEach((p) => {
        if (p.status === 'flash' && p.flashEndsAt !== undefined && p.flashEndsAt <= clock) {
          const k = nearestKirana(p, world.buyers.find((b) => b.id === p.buyerId)?.pincode, ['kirana', 'depot']);
          world = { ...world, parcels: world.parcels.map((q) => (q.id === p.id ? { ...q, status: 'held', kiranaId: k.id } : q)) };
          feed = ev({ ...s, clock, feed }, 'engine', `${p.awb} unsold after 24h → held at ${k.name}, week-1 price`, 'info');
        }
      });
      return { ...s, clock, world, feed };
    }

    case 'PLACE_ORDER': {
      const buyer = s.world.buyers.find((b) => b.id === a.buyerId)!;
      const tier = buyerTier(s, buyer).tier;
      const rider = riderOf(s.rider.id);
      const hub = hubOf(rider.hubId);
      const id = `PX${String(s.world.parcels.length + 1).padStart(3, '0')}`;
      const parcel: Parcel = {
        id,
        awb: `VL${7420031 + (s.world.parcels.length + 1) * 37}IN`,
        title: a.product.title,
        category: a.product.category,
        price: a.product.price,
        sellerId: a.product.sellerId,
        buyerId: buyer.id,
        payment: a.payment,
        hubId: hub.id,
        riderId: rider.id,
        partnerId: rider.partnerId,
        x: buyer.x,
        y: buyer.y,
        distanceKm: Math.round(dist(hub, buyer) * 1.3 * 10) / 10,
        status: 'out_for_delivery',
        attemptsMade: 0,
        maxAttempts: tierPolicy(tier).maxAttempts,
        codToken: a.payment === 'COD' && a.token ? a.token : undefined,
        altDelivery: a.deliverTo,
        deliveryWindow: a.window,
      };
      const payTxt = a.payment === 'Prepaid' ? 'prepaid' : a.token ? `COD with ₹${a.token} UPI token` : 'COD';
      return {
        ...s,
        world: { ...s.world, parcels: [parcel, ...s.world.parcels] },
        feed: ev(s, 'buyer', `${buyer.name.split(' ')[0]} (Tier ${tier}) ordered ${a.product.title}, ${payTxt}`, 'info'),
      };
    }

    case 'RIDER_SELECT':
      return { ...s, rider: { ...s.rider, activeParcelId: a.parcelId } };

    case 'RIDER_MOVE':
    case 'RIDER_TELEPORT':
      return { ...s, rider: { ...s.rider, pos: { x: a.x, y: a.y } } };

    case 'RIDER_CALL':
      return {
        ...s,
        clock: s.clock + 1,
        rider: { ...s.rider, calls: { ...s.rider.calls, [a.parcelId]: s.clock } },
      };

    case 'RIDER_OUTCOME': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      const d = riderDistanceM(s, p);
      const callAt = s.rider.calls[p.id];
      const photo = s.rider.photos[p.id];
      const buyer = s.world.buyers.find((b) => b.id === p.buyerId)!;

      const why = outcomeBlocker(s, p, a.outcome);
      if (why) {
        return {
          ...s,
          world: {
            ...s.world,
            blocked: [{ id: `X${s.world.blocked.length + 1}`, parcelId: p.id, riderId: p.riderId, at: s.clock, tried: a.outcome, gpsDistanceM: d, why }, ...s.world.blocked],
          },
          feed: ev(s, 'rider', `Blocked: ${riderOf(p.riderId).name.split(' ')[0]} tried “${a.outcome.replace('_', ' ')}” on ${p.awb}: ${why}`, 'bad'),
        };
      }

      const log = {
        id: `L-live-${s.world.logs.length + 1}`,
        parcelId: p.id,
        riderId: p.riderId,
        partnerId: p.partnerId,
        at: s.clock,
        outcome: a.outcome,
        reason: a.reason,
        gpsDistanceM: d,
        callAt,
        photo: a.outcome === 'not_home' ? photo : undefined,
        verified: true,
      };
      let world: World = { ...s.world, logs: [log, ...s.world.logs] };
      // Proof is per attempt: a retry needs a fresh call and photo.
      const { [p.id]: _c, ...calls } = s.rider.calls;
      const { [p.id]: _p, ...photos } = s.rider.photos;
      void _c;
      void _p;
      const rider = { ...s.rider, calls, photos };
      const attemptsMade = p.attemptsMade + 1;
      let status: Parcel['status'];
      let text: string;
      let tone: FeedEvent['tone'] = 'info';
      const reasonTxt = a.reason ? reasonInfo(a.reason).label.toLowerCase() : '';

      if (a.outcome === 'delivered') {
        status = 'delivered';
        text = `Delivered ${p.awb} to ${buyer.name.split(' ')[0]} · GPS ${d} m`;
        tone = 'good';
        world = patchBuyer(world, buyer.id, (b) => ({ orders: b.orders + 1 }));
      } else if (a.outcome === 'refused' || attemptsMade >= p.maxAttempts) {
        status = 'in_queue';
        text = `${p.awb} ${a.outcome === 'refused' ? 'refused at door' : 'attempts exhausted'} (${reasonTxt}) · verified GPS ${d} m`;
        tone = 'bad';
        if (a.reason && reasonInfo(a.reason).blame === 'buyer') {
          world = patchBuyer(world, buyer.id, (b) => ({ orders: b.orders + 1, customerCausedRtos: b.customerCausedRtos + 1 }));
        }
      } else {
        status = 'retry';
        text = `${p.awb} attempt ${attemptsMade}/${p.maxAttempts} failed (${reasonTxt}) · verified`;
      }
      if (log.photo) text += ' · 📷 geotagged doorstep photo';
      world = {
        ...world,
        parcels: world.parcels.map((x) =>
          x.id === p.id ? { ...x, status, attemptsMade, refusedAt: status === 'in_queue' ? s.clock : x.refusedAt } : x,
        ),
      };
      const next = { ...s, clock: s.clock + 2, rider, world, feed: ev(s, 'rider', text, tone) };
      // No one has to decide by hand: the model lists it near the buyer, or sends it back.
      return status === 'in_queue' ? reducer(next, { type: 'DISPOSE', parcelId: p.id }) : next;
    }

    case 'RIDER_PHOTO': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      const d = riderDistanceM(s, p);
      if (d > GPS_RADIUS_M) return s; // the camera will not open away from the door
      const photo: DoorPhoto = { at: s.clock, ...toLatLng(s.rider.pos.x, s.rider.pos.y), distanceM: d, source: 'in_app_camera' };
      return { ...s, clock: s.clock + 1, rider: { ...s.rider, photos: { ...s.rider.photos, [p.id]: photo } } };
    }

    case 'DISPOSE': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      if (p.status !== 'in_queue') return s;
      const seller = s.world.sellers.find((x) => x.id === p.sellerId)!;
      const optIn = sellerAllowsResale(seller, p);
      const d = parcelEV({ ...s.assumptions, sellerFloorDiscount: seller.floor }, p.price, optIn, s.mode);
      // Ops may override the recommendation, but can never resell against the seller's wishes.
      const choice = a.choice ?? (d.chosen === 'flash' ? 'flash' : 'return');
      if (choice === 'flash' && !optIn) return s;
      const world =
        choice === 'flash'
          ? patchParcel(s, p.id, { status: 'flash', flashEndsAt: s.clock + FLASH_MIN })
          : patchParcel(s, p.id, { status: 'returning' });
      const text =
        choice === 'flash'
          ? `${p.awb} listed in 24h flash sale for pincode ${s.world.buyers.find((b) => b.id === p.buyerId)!.pincode} · expected +₹${Math.round(d.resaleTrackEV)} vs sending back`
          : `${p.awb} → sent back to ${seller.name}${optIn ? '' : ` (${d.reason.toLowerCase()})`}`;
      return { ...s, world, lastDecision: { parcelId: p.id, at: s.clock }, feed: ev(s, 'engine', text, choice === 'flash' ? 'good' : 'info') };
    }

    case 'BUY': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      if (p.status !== 'flash' && p.status !== 'held') return s; // already sold or gone
      const buyer = s.world.buyers.find((b) => b.id === a.buyerId)!;
      const offer = resaleOffer(s, p);
      const sellerAmount = offer.sellerGets;
      const price = offer.price - (a.via === 'pickup' ? PICKUP_DISCOUNT : 0); // Meesho funds the pickup discount
      const k = p.kiranaId ? kiranaOf(p.kiranaId) : nearestKirana(buyer, buyer.pincode);
      const code = a.via === 'pickup' ? pickupCode(p.id + buyer.id) : undefined;
      const world = patchParcel(s, p.id, {
        status: 'sold',
        kiranaId: a.via === 'pickup' ? k.id : p.kiranaId,
        resale: { buyerId: buyer.id, price, mode: a.via, pickupCode: code, at: s.clock },
        sellerPayout: { amount: sellerAmount, at: s.clock + 2 * 24 * 60, label: 'Sold to Meesho · paid in 2 days' },
      });
      return {
        ...s,
        world,
        feed: ev(
          s,
          'nearby',
          `${buyer.name.split(' ')[0]} bought ${p.awb} for ₹${price} · ${a.via === 'pickup' ? `pickup at ${k.name}, code ${code}` : 'same-day local delivery'}`,
          'good',
        ),
      };
    }

    case 'COMPLETE_LOCAL': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      return {
        ...s,
        clock: s.clock + 90,
        world: patchParcel(s, p.id, { status: 'resold_delivered' }),
        feed: ev(s, 'engine', `${p.awb} handed over locally. It never re-entered line haul: reverse leg of ₹29 avoided`, 'good'),
      };
    }

    case 'SELLER_UPDATE':
      return {
        ...s,
        world: { ...s.world, sellers: s.world.sellers.map((x) => (x.id === a.sellerId ? { ...x, ...a.patch } : x)) },
      };

    case 'PRICE_PROPOSE': {
      const seller = s.world.sellers.find((x) => x.id === a.sellerId)!;
      const reply = meeshoReply(RECOMMENDED_FLOOR[seller.category], a.floor);
      const thread = s.world.threads[seller.id] ?? [];
      const n = thread.length;
      const mine: PriceMsg = { id: `${seller.id}-${n + 1}`, from: 'seller', at: s.clock, kind: 'counter', floor: a.floor, text: `Proposed ${Math.round(a.floor * 100)}%.` };
      const text =
        reply.kind === 'accept'
          ? `Agreed at ${Math.round(reply.floor * 100)}%. This is now your resale floor.`
          : reply.kind === 'counter'
            ? `Meet at ${Math.round(reply.floor * 100)}%? Below that, more of your stock comes back unsold after 4 weeks.`
            : `Floors need to sit between 10% and 20%. Our suggestion stands at ${Math.round(reply.floor * 100)}%.`;
      const theirs: PriceMsg = { id: `${seller.id}-${n + 2}`, from: 'meesho', at: s.clock + 1, kind: reply.kind, floor: reply.floor, text };
      const sellers = reply.kind === 'accept' ? s.world.sellers.map((x) => (x.id === seller.id ? { ...x, floor: reply.floor } : x)) : s.world.sellers;
      return {
        ...s,
        clock: s.clock + 1,
        world: { ...s.world, sellers, threads: { ...s.world.threads, [seller.id]: [...thread, mine, theirs] } },
        feed: ev(s, 'seller', `${seller.name} proposed a ${Math.round(a.floor * 100)}% resale floor → Meesho ${reply.kind === 'accept' ? 'agreed' : reply.kind === 'counter' ? `countered at ${Math.round(reply.floor * 100)}%` : 'declined'}`),
      };
    }

    case 'PRICE_ACCEPT': {
      const seller = s.world.sellers.find((x) => x.id === a.sellerId)!;
      const thread = s.world.threads[seller.id] ?? [];
      const last = thread[thread.length - 1];
      if (!last || last.from !== 'meesho' || last.kind !== 'counter' || last.floor === undefined) return s;
      const floor = last.floor;
      const msg: PriceMsg = { id: `${seller.id}-${thread.length + 1}`, from: 'seller', at: s.clock, kind: 'accept', floor, text: `OK, ${Math.round(floor * 100)}%.` };
      return {
        ...s,
        world: {
          ...s.world,
          sellers: s.world.sellers.map((x) => (x.id === seller.id ? { ...x, floor } : x)),
          threads: { ...s.world.threads, [seller.id]: [...thread, msg] },
        },
        feed: ev(s, 'seller', `${seller.name} agreed a ${Math.round(floor * 100)}% resale floor`, 'good'),
      };
    }

    case 'DEAL_REQUEST': {
      const p = s.world.parcels.find((x) => x.id === a.parcelId)!;
      const seller = s.world.sellers.find((x) => x.id === p.sellerId)!;
      if (s.world.deals.some((d) => d.parcelId === p.id && d.status === 'open')) return s;
      const pin = s.world.buyers.find((b) => b.id === p.buyerId)!.pincode;
      const nearby = s.world.buyers.find((b) => b.pincode === pin && b.id !== p.buyerId)!;
      const discount = Math.min(seller.floor + 0.08, 0.3);
      const deal: DealRequest = {
        id: `D${s.world.deals.length + 1}`,
        parcelId: p.id,
        sellerId: seller.id,
        discount,
        price: Math.round(p.price * (1 - discount)),
        buyerId: nearby.id,
        createdAt: s.clock,
        status: 'open',
      };
      return {
        ...s,
        world: { ...s.world, deals: [deal, ...s.world.deals] },
        feed: ev(s, 'engine', `${p.awb}: asked ${seller.name} to go to ${Math.round(discount * 100)}% off (below their ${Math.round(seller.floor * 100)}% floor) or take it back`),
      };
    }

    case 'DEAL_RESPOND': {
      const deal = s.world.deals.find((d) => d.id === a.dealId)!;
      if (deal.status !== 'open') return s;
      const p = s.world.parcels.find((x) => x.id === deal.parcelId)!;
      const seller = s.world.sellers.find((x) => x.id === deal.sellerId)!;
      const deals = s.world.deals.map((d) => (d.id === deal.id ? { ...d, status: a.accept ? ('accepted' as const) : ('declined' as const) } : d));
      if (!a.accept) {
        return {
          ...s,
          world: { ...patchParcel(s, p.id, { status: 'returning' }), deals },
          feed: ev(s, 'seller', `${seller.name} declined ${Math.round(deal.discount * 100)}% on ${p.awb} → returning to seller`),
        };
      }
      const payout = s.mode === 'acquire' ? Math.round(p.price * (1 - s.assumptions.acquisitionDiscount)) : Math.max(deal.price - s.assumptions.platformFee, 0);
      const world = patchParcel(s, p.id, {
        status: 'sold',
        resale: { buyerId: deal.buyerId, price: deal.price, mode: 'pickup', pickupCode: pickupCode(p.id + deal.buyerId), at: s.clock },
        sellerPayout: { amount: payout, at: s.clock + 2 * 24 * 60, label: 'Sold below floor with your OK · paid in 2 days' },
      });
      return {
        ...s,
        world: { ...world, deals },
        feed: ev(s, 'seller', `${seller.name} accepted ${Math.round(deal.discount * 100)}% on ${p.awb} → sold for ₹${deal.price}`, 'good'),
      };
    }

    case 'PARTNER_APPLY': {
      const id = `PR${s.world.prospects.length + 1}`;
      const app: Prospect = { ...a.application, id, stage: 'Applied', appliedDaysAgo: 0 };
      return {
        ...s,
        world: { ...s.world, prospects: [app, ...s.world.prospects] },
        feed: ev(s, 'engine', `${app.name} (${app.pincode}) applied to be a Pados Point · ${app.shelfSqft} sq ft shelf`, 'good'),
      };
    }

    case 'PARTNER_ADVANCE': {
      const p = s.world.prospects.find((x) => x.id === a.id);
      if (!p || p.stage === 'Live') return s;
      const next = PROSPECT_STAGES[PROSPECT_STAGES.indexOf(p.stage) + 1];
      return {
        ...s,
        world: { ...s.world, prospects: s.world.prospects.map((x) => (x.id === p.id ? { ...x, stage: next } : x)) },
        feed: ev(s, 'engine', `${p.name} → ${next}`, next === 'Live' ? 'good' : 'info'),
      };
    }

    case 'BUYER_PATCH':
      return { ...s, world: patchBuyer(s.world, a.buyerId, () => a.patch) };

    case 'APPEAL': {
      const b = s.world.buyers.find((x) => x.id === a.buyerId)!;
      return {
        ...s,
        appeals: { ...s.appeals, [b.id]: { at: s.clock, reason: a.reason } },
        feed: ev(s, 'buyer', `${b.name.split(' ')[0]} appealed their tier: “${a.reason}”. Reviewed within 24h`),
      };
    }

    case 'SHOPPER':
      return { ...s, shopper: a.buyerId };

    case 'ONBOARD': {
      const onboarding = { ...s.onboarding, ...a.patch };
      const feed =
        a.patch.signed && !s.onboarding.signed && onboarding.profile
          ? ev(s, 'engine', `${onboarding.profile.name} (${onboarding.profile.pincode}) signed up as a Pados Point · space photo in for review`, 'good')
          : s.feed;
      return { ...s, onboarding, feed };
    }

    case 'ONBOARD_RESET':
      return { ...s, onboarding: NO_ONBOARDING };

    case 'TIER_OVERRIDE':
      return { ...s, tierOverride: { ...s.tierOverride, [a.buyerId]: a.tier } };

    case 'DEMO':
      return { ...s, demo: { active: a.active, step: a.step ?? (a.active ? s.demo.step : 0) } };
  }
}

// ---------------------------------------------------------------- context

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}
