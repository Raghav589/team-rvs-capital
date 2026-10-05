/**
 * Guided demo. Each step is data: where to go, what to say (built from live
 * state), how to tell it is done, and the store actions that complete it. The
 * presenter can click through the real UI, or press Next and the step completes
 * itself, so the story has no dead ends. demo.test.ts runs the whole thing.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULTS, DEMAND_DEFAULTS, ownershipPlan, parcelEV } from './model';
import { KESHAV_PRODUCT, LISTING_SIGNALS, type Parcel } from './seed';
import { buyerTier, kiranaOf, reducer, riderDistanceM, riderTrust, useStore, type Action, type State } from './store';
import { inr, km } from './ui';

const KESHAV = 'B01';
const HARSHITA = 'B02';

/** Keshav's demo order: his newest parcel on Archit's route. */
export const keshavParcel = (s: State): Parcel | undefined => s.world.parcels.find((p) => p.buyerId === KESHAV && p.riderId === 'R1');
const harshitaOwn = (s: State) => s.world.parcels.find((p) => p.buyerId === HARSHITA && p.riderId === 'R1')!;
const buyer = (s: State, id: string) => s.world.buyers.find((b) => b.id === id)!;
const nearDoor = (p: Parcel): Action => ({ type: 'RIDER_TELEPORT', x: p.x - 0.028, y: p.y + 0.021 });

export interface DemoStep {
  route: string;
  who: string;
  title: string;
  caption: (s: State) => string;
  /** actions to set the scene when the step opens */
  enter?: (s: State) => Action[];
  /** actions that complete the step if the presenter hasn't */
  complete: (s: State) => Action[];
  done: (s: State) => boolean;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    route: '/checkout',
    who: 'Keshav',
    title: 'Keshav places a COD order',
    caption: (s) => {
      const t = buyerTier(s, buyer(s, KESHAV));
      return `21, orders on impulse. TrustMesh scores this order ${Math.round(buyer(s, KESHAV).trustMesh * 100)}% and his history is clean, so he’s Tier ${t.tier}: plain cash on delivery, 3 attempts. He buys ${KESHAV_PRODUCT.title.toLowerCase()} for ${inr(KESHAV_PRODUCT.price)}.`;
    },
    enter: () => [{ type: 'SHOPPER', buyerId: KESHAV }],
    complete: () => [{ type: 'PLACE_ORDER', buyerId: KESHAV, product: KESHAV_PRODUCT, payment: 'COD', token: 0 }],
    done: (s) => !!keshavParcel(s),
  },
  {
    route: '/rider',
    who: 'Archit',
    title: 'Archit reaches the door. Keshav refuses.',
    caption: (s) => {
      const p = keshavParcel(s);
      const d = p ? riderDistanceM(s, p) : 0;
      if (p && p.status !== 'out_for_delivery' && p.status !== 'retry') {
        const seller = s.world.sellers.find((x) => x.id === p.sellerId)!;
        const ev = parcelEV({ ...s.assumptions, sellerFloorDiscount: seller.floor }, p.price, seller.optIn, s.mode);
        return `Refused, “changed mind”, verified ${d} m from the door. Nobody has to decide what happens next: selling it nearby saves ${inr(ev.resaleTrackEV)} against ${inr(ev.options[0].saving)} for sending it back, so it goes straight into a 24-hour sale in Keshav’s own pincode.`;
      }
      return `The outcome buttons stay locked until GPS puts Archit within 100 m of the door. He’s ${km(d)} away: ride there, then log the refusal with a reason code.`;
    },
    enter: (s) => {
      const p = keshavParcel(s);
      return p ? [{ type: 'RIDER_SELECT', parcelId: p.id }] : [];
    },
    complete: (s) => {
      const p = keshavParcel(s)!;
      return [nearDoor(p), { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'refused', reason: 'REFUSED_CHANGED_MIND' }, { type: 'RIDER_SELECT' }];
    },
    done: (s) => {
      const st = keshavParcel(s)?.status;
      return st === 'flash' || st === 'held' || st === 'sold' || st === 'resold_delivered' || st === 'returning';
    },
  },
  {
    route: '/pricing?item=sneakers',
    who: 'Meesho & Sara',
    title: 'Meesho and Sara agree a price',
    caption: () => {
      const s = LISTING_SIGNALS[KESHAV_PRODUCT.title];
      const o = ownershipPlan(DEFAULTS, KESHAV_PRODUCT.price, { category: KESHAV_PRODUCT.category, ...s }, { ...DEMAND_DEFAULTS, shoppersPerDay: s.shoppersPerDay });
      return `Meesho estimates Sara’s margin on the sneakers at ${Math.round(o.margin.margin * 100)}% (${o.margin.band}), so it offers to buy them for ${inr(o.sellerNow)} (${Math.round(o.d * 100)}% off, less the usual shipping charge), paid within 2 days. Sara accepts; from here the sneakers are Meesho’s to sell, and they never go back to Agra.`;
    },
    complete: () => [],
    done: () => true,
  },
  {
    route: '/checkout',
    who: 'Keshav',
    title: 'Keshav’s tier recalculates',
    caption: (s) => {
      const b = buyer(s, KESHAV);
      const t = buyerTier(s, b);
      return `One refusal in ${b.orders} orders is ${Math.round((b.customerCausedRtos / b.orders) * 100)}% customer-caused RTO, so he’s now Tier ${t.tier}. Next time: cash on delivery needs a ₹30 deposit, 2 attempts, then pickup. TrustMesh stays an input; the response is graded, not a block.`;
    },
    enter: () => [{ type: 'SHOPPER', buyerId: KESHAV }],
    complete: () => [],
    done: () => true,
  },
  {
    route: '/checkout',
    who: 'Harshita',
    title: 'A neighbour in the same pincode buys it',
    caption: (s) => {
      const p = keshavParcel(s)!;
      return p.resale
        ? `Harshita paid ${inr(p.resale.price)} online. She’s out 9 to 6, so she’ll collect it at ${p.kiranaId ? kiranaOf(p.kiranaId).name : 'a partner kirana'} after work with code ${p.resale.pickupCode}.`
        : `This is Harshita’s phone. She lives in the same pincode, so Keshav’s unopened sneakers show up as “Near you · get it today” at full price. She buys them for pickup.`;
    },
    enter: () => [{ type: 'SHOPPER', buyerId: HARSHITA }],
    complete: (s) => [{ type: 'BUY', parcelId: keshavParcel(s)!.id, buyerId: HARSHITA, via: 'pickup' }],
    done: (s) => {
      const st = keshavParcel(s)?.status;
      return st === 'sold' || st === 'resold_delivered';
    },
  },
  {
    route: '/partners/counter',
    who: 'Pados Point',
    title: 'Handed over at a Pados Point. It never re-entered line haul.',
    caption: (s) => {
      const p = keshavParcel(s)!;
      const k = p.kiranaId ? kiranaOf(p.kiranaId) : undefined;
      return p.status === 'resold_delivered'
        ? `${k?.owner.split(' ')[0] ?? 'The kirana'} checked code ${p.resale?.pickupCode} and scanned it out, earning ₹${s.assumptions.commission}. No reverse leg to Agra: ₹29 of network cost never spent, and the order counts as delivered.`
        : `Harshita shows pickup code ${p.resale?.pickupCode ?? '—'} at ${k?.name ?? 'the kirana'}. ${k?.owner.split(' ')[0] ?? 'The owner'} enters it on the Valmo Partner app and scans the parcel out.`;
    },
    complete: (s) => [{ type: 'COMPLETE_LOCAL', parcelId: keshavParcel(s)!.id }],
    done: (s) => keshavParcel(s)?.status === 'resold_delivered',
  },
  {
    route: '/seller',
    who: 'Sara',
    title: 'Sara sees the reason, the resale and her payout',
    caption: (s) => {
      const p = keshavParcel(s)!;
      return `For the first time her app says why: “changed mind”, the buyer’s choice, with GPS proof. And instead of stock coming back in ~3 weeks, ${inr(p.sellerPayout?.amount ?? 0)} lands in 2 days.`;
    },
    complete: () => [],
    done: () => true,
  },
  // ---- the fake-attempt scenario
  {
    route: '/rider',
    who: 'Archit',
    title: 'Fake attempt: “Not home” from 2 km away',
    caption: (s) => {
      const blocked = s.world.blocked.find((b) => b.parcelId === harshitaOwn(s).id);
      const t = riderTrust(s, 'R1');
      return blocked
        ? `Blocked: ${blocked.why}. It isn’t counted against Harshita, and it’s logged for review with his courier. Archit’s trust score drops to ${Math.round(t.score * 100)}%, and his incentives are tied to it.`
        : `52% of people we surveyed saw an attempt marked that never happened. Archit tries to mark Harshita’s parcel “Not home” without going there.`;
    },
    enter: (s) => {
      const p = harshitaOwn(s);
      return [
        { type: 'RIDER_SELECT', parcelId: p.id },
        { type: 'RIDER_TELEPORT', x: p.x - 2.0, y: p.y + 0.1 },
      ];
    },
    complete: (s) => [{ type: 'RIDER_OUTCOME', parcelId: harshitaOwn(s).id, outcome: 'not_home' }],
    done: (s) => s.world.blocked.some((b) => b.parcelId === harshitaOwn(s).id),
  },
];

export const STORY_STEPS = 7;

/**
 * The actions for moving from the current step to step `to`: finish the current
 * step first if asked (Next), then open `to` and set its scene. Planned against
 * the pure reducer so each enter() sees the state it will actually run in.
 */
export function planMove(s: State, to: number, finishCurrent: boolean): Action[] {
  const out: Action[] = [];
  let sim = s;
  const push = (a: Action) => {
    out.push(a);
    sim = reducer(sim, a);
  };
  const cur = DEMO_STEPS[s.demo.step];
  if (finishCurrent && cur && !cur.done(sim)) cur.complete(sim).forEach(push);
  const next = DEMO_STEPS[to];
  if (!next) {
    push({ type: 'DEMO', active: false });
    return out;
  }
  push({ type: 'DEMO', active: true, step: to });
  next.enter?.(sim).forEach(push);
  return out;
}

/** Start from a clean world, then open step 1. */
export function startDemo(dispatch: (a: Action) => void) {
  dispatch({ type: 'RESET' });
  dispatch({ type: 'DEMO', active: true, step: 0 });
}

// ---------------------------------------------------------------- caption bar

export function DemoBar() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { active, step } = state.demo;
  const cur = DEMO_STEPS[step];

  // Keep the screen on the step's persona.
  useEffect(() => {
    if (active && cur && location.pathname + location.search !== cur.route) navigate(cur.route);
  }, [active, step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !cur) return null;

  const run = (actions: Action[]) => actions.forEach((a) => dispatch(a));
  const go = (i: number) => run(planMove(state, i, false));
  const next = () => run(planMove(state, step + 1, true));
  const done = cur.done(state);
  const bonus = step >= STORY_STEPS;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-brand-600 bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center lg:px-6">
        <div className="hidden shrink-0 items-center gap-1.5 md:flex" aria-label={`Step ${step + 1} of ${DEMO_STEPS.length}`}>
          {DEMO_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={`h-2.5 rounded-full transition ${i === step ? 'w-6 bg-brand-600' : i < step ? 'w-2.5 bg-brand-300' : 'w-2.5 bg-ink-200'} ${i === STORY_STEPS ? 'ml-2' : ''}`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-100 text-brand-600">{bonus ? 'Fake-attempt scenario' : `Step ${step + 1} of ${STORY_STEPS}`}</span>
            <span className="text-xs font-bold text-ink-400">{cur.who}</span>
            {done && <span className="chip bg-emerald-50 text-emerald-700">✓ Done</span>}
          </div>
          <div className="mt-0.5 text-[17px] font-extrabold leading-snug text-ink-800">{cur.title}</div>
          <div className="text-sm leading-snug text-ink-600">{cur.caption(state)}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 [&>button]:px-3 md:[&>button]:px-4">
          <button className="btn text-ink-600 hover:text-brand-600" onClick={() => dispatch({ type: 'DEMO', active: false })}>
            Exit
          </button>
          <button className="btn-ghost" disabled={step === 0} onClick={() => go(step - 1)}>
            Back
          </button>
          {!done && (
            <button className="btn-ghost" onClick={() => run(cur.complete(state))}>
              Do it for me
            </button>
          )}
          <button className="btn-primary md:min-w-[110px]" onClick={next}>
            {step === DEMO_STEPS.length - 1 ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
