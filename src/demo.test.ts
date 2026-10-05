import { describe, expect, it } from 'vitest';
import { DEMO_STEPS, STORY_STEPS, keshavParcel, planMove } from './demo';
import { KESHAV_PRODUCT } from './seed';
import { buyerTier, initialState, reducer, type Action, type State } from './store';

const apply = (s: State, actions: Action[]) => actions.reduce(reducer, s);
const start = () => apply(initialState(), [{ type: 'RESET' }, { type: 'DEMO', active: true, step: 0 }]);

/** Press Next on every step, as a presenter who never clicks anything else would. */
function playThrough(onStep?: (s: State, i: number) => void) {
  let s = start();
  for (let i = 0; i < DEMO_STEPS.length; i++) {
    expect(s.demo).toEqual({ active: true, step: i });
    onStep?.(s, i);
    s = apply(s, planMove(s, i + 1, true));
  }
  return s;
}

describe('guided demo', () => {
  it('has 7 story steps plus the fake-attempt scenario', () => {
    expect(STORY_STEPS).toBe(7);
    expect(DEMO_STEPS.length).toBe(8);
  });

  it('the price agreed on the Pricing tab is what Sara is paid at the end', () => {
    const i = DEMO_STEPS.findIndex((st) => st.route.startsWith('/pricing'));
    expect(i).toBe(2); // right after the refusal
    const s = playThrough();
    const paid = keshavParcel(s)!.sellerPayout!.amount;
    expect(DEMO_STEPS[i].caption(s)).toContain(`₹${paid}`);
  });

  it('the neighbour step shows the app on Harshita’s phone, then the story returns to Keshav’s', () => {
    playThrough((s, i) => {
      if (DEMO_STEPS[i].who === 'Harshita') expect(s.shopper).toBe('B02');
      if (DEMO_STEPS[i].who === 'Keshav') expect(s.shopper).toBe('B01');
    });
  });

  it('pressing Next all the way through completes every step: no dead ends', () => {
    playThrough((s, i) => {
      const step = DEMO_STEPS[i];
      const finished = step.done(s) ? s : apply(s, step.complete(s));
      expect(step.done(finished), `step ${i + 1}: ${step.title}`).toBe(true);
    });
  });

  it('captions read cleanly at every step, before and after completing it', () => {
    playThrough((s, i) => {
      const step = DEMO_STEPS[i];
      for (const st of [s, apply(s, step.done(s) ? [] : step.complete(s))]) {
        const text = step.caption(st);
        expect(text.length).toBeGreaterThan(40);
        expect(text).not.toMatch(/undefined|NaN|null|\[object/);
      }
    });
  });

  it('ends with the whole story true in the shared state', () => {
    const s = playThrough();
    expect(s.demo.active).toBe(false);
    const p = keshavParcel(s)!;
    expect(p.status).toBe('resold_delivered'); // refused → flash sale → bought by Harshita → handed over
    expect(p.resale).toMatchObject({ buyerId: 'B02', mode: 'pickup' });
    expect(p.sellerPayout!.amount).toBeLessThan(KESHAV_PRODUCT.price - 47); // Meesho bought it at the agreed, discounted price
    expect(buyerTier(s, s.world.buyers.find((b) => b.id === 'B01')!).tier).toBe(2);
    const harshitaParcel = s.world.parcels.find((x) => x.buyerId === 'B02' && x.riderId === 'R1')!;
    expect(s.world.blocked.some((b) => b.parcelId === harshitaParcel.id && b.why.startsWith('GPS'))).toBe(true);
    expect(harshitaParcel.status).toBe('out_for_delivery'); // the fake attempt changed nothing
  });

  it('if the presenter does a step by hand, Next does not repeat it', () => {
    let s = start();
    s = apply(s, [{ type: 'PLACE_ORDER', buyerId: 'B01', product: KESHAV_PRODUCT, payment: 'COD', token: 0 }]);
    s = apply(s, planMove(s, 1, true));
    expect(s.world.parcels.filter((p) => p.buyerId === 'B01').length).toBe(1);
    expect(s.rider.activeParcelId).toBe(keshavParcel(s)!.id); // step 2 opens on Keshav's parcel
  });

  it('the fake-attempt step places Archit ~2 km from Harshita’s door', () => {
    let s = start();
    s = apply(s, planMove(s, STORY_STEPS, false));
    const p = s.world.parcels.find((x) => x.buyerId === 'B02' && x.riderId === 'R1')!;
    const d = Math.hypot(s.rider.pos.x - p.x, s.rider.pos.y - p.y);
    expect(d).toBeGreaterThan(1.9);
    expect(d).toBeLessThan(2.1);
  });
});
