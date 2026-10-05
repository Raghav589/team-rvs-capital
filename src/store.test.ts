import { describe, expect, it } from 'vitest';
import { buyerTier, initialState, outcomeBlocker, reducer, resaleOffer, type Action, type State } from './store';

const run = (s: State, ...actions: Action[]) => actions.reduce(reducer, s);

/** Harshita's parcel on Archit's route; Archit starts at the hub, 2+ km away. */
function setup() {
  const s = initialState();
  const p = s.world.parcels.find((x) => x.riderId === 'R1' && x.buyerId === 'B02')!;
  const atDoor: Action = { type: 'RIDER_TELEPORT', x: p.x - 0.028, y: p.y + 0.021 };
  return { s, p, atDoor };
}

describe('Keshav: order → refusal → tier recalculates', () => {
  const product = { title: "Men's canvas sneakers, white, size 9", category: 'shoes' as const, price: 299, sellerId: 'S1', emoji: '👟' };

  it('Tier 1 COD order lands on Archit’s route with 3 attempts', () => {
    const s = run(initialState(), { type: 'PLACE_ORDER', buyerId: 'B01', product, payment: 'COD', token: 0 });
    const p = s.world.parcels[0];
    expect(p).toMatchObject({ buyerId: 'B01', riderId: 'R1', status: 'out_for_delivery', maxAttempts: 3, payment: 'COD' });
    expect(p.codToken).toBeUndefined();
    expect(buyerTier(s, s.world.buyers.find((b) => b.id === 'B01')!).tier).toBe(1);
  });

  it('a refusal at the door moves him to Tier 2 (1 of 4 orders = 25%), and the next order carries the ₹30 token', () => {
    const s0 = run(initialState(), { type: 'PLACE_ORDER', buyerId: 'B01', product, payment: 'COD', token: 0 });
    const p = s0.world.parcels[0];
    const s1 = run(
      s0,
      { type: 'RIDER_TELEPORT', x: p.x - 0.028, y: p.y + 0.021 },
      { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'refused', reason: 'REFUSED_CHANGED_MIND' },
    );
    const keshav = s1.world.buyers.find((b) => b.id === 'B01')!;
    expect(keshav).toMatchObject({ orders: 4, customerCausedRtos: 1 });
    expect(buyerTier(s1, keshav).tier).toBe(2);

    const s2 = run(s1, { type: 'PLACE_ORDER', buyerId: 'B01', product, payment: 'COD', token: 30, deliverTo: 'Neighbour · Room 12' });
    expect(s2.world.parcels[0]).toMatchObject({ codToken: 30, maxAttempts: 2, altDelivery: 'Neighbour · Room 12' });
  });

  it('an appeal is recorded without changing the tier', () => {
    const s = run(initialState(), { type: 'TIER_OVERRIDE', buyerId: 'B01', tier: 2 }, { type: 'APPEAL', buyerId: 'B01', reason: 'I was travelling' });
    expect(s.appeals.B01.reason).toBe('I was travelling');
    expect(buyerTier(s, s.world.buyers.find((b) => b.id === 'B01')!).tier).toBe(2);
  });
});

describe('Harshita buys a neighbour’s refused parcel', () => {
  const flashIn452010 = (s: State) =>
    s.world.parcels.filter((p) => p.status === 'flash' && s.world.buyers.find((b) => b.id === p.buyerId)!.pincode === '452010');

  it('there are flash-sale parcels in her pincode at the start, none of them hers', () => {
    const s = initialState();
    const list = flashIn452010(s);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((p) => p.buyerId !== 'B02')).toBe(true);
  });

  it('pickup: ₹5 off the flash price (Meesho pays it), pickup code at a kirana in 452010, seller paid the agreed price in 2 days; collect → handed over', () => {
    const s = initialState();
    const p = flashIn452010(s)[0];
    const bought = run(s, { type: 'BUY', parcelId: p.id, buyerId: 'B02', via: 'pickup' });
    const q = bought.world.parcels.find((x) => x.id === p.id)!;
    expect(q.status).toBe('sold');
    expect(q.resale).toMatchObject({ buyerId: 'B02', price: p.price - 5, mode: 'pickup' });
    expect(q.resale!.pickupCode).toMatch(/^\d{4}$/);
    expect(['K1', 'K2']).toContain(q.kiranaId); // the two partner kiranas in 452010
    expect(q.sellerPayout!.amount).toBe(resaleOffer(s, p).sellerGets); // the price agreed when Meesho bought it
    expect(q.sellerPayout!.amount).toBeLessThan(p.price - 47);

    const handed = run(bought, { type: 'COMPLETE_LOCAL', parcelId: p.id });
    expect(handed.world.parcels.find((x) => x.id === p.id)!.status).toBe('resold_delivered');
  });

  it('a parcel cannot be bought twice', () => {
    const s = initialState();
    const p = flashIn452010(s)[0];
    const once = run(s, { type: 'BUY', parcelId: p.id, buyerId: 'B02', via: 'delivery' });
    const twice = run(once, { type: 'BUY', parcelId: p.id, buyerId: 'B03', via: 'pickup' });
    expect(twice.world.parcels.find((x) => x.id === p.id)!.resale!.buyerId).toBe('B02');
  });
});

describe('Pados Point onboarding', () => {
  const application = {
    name: 'Shiv Shakti Kirana',
    owner: 'Pooja Malviya',
    phone: '98260 77 431',
    storeType: 'Kirana' as const,
    address: '14, Tilak Nagar extension',
    landmark: 'Near Sai Baba mandir',
    pincode: '452016',
    shelfSqft: 6,
    opens: '7 am',
    closes: '10 pm',
    sundays: true,
  };

  it('an application lands as Applied and walks through every stage to Live, then stops', () => {
    let s = run(initialState(), { type: 'PARTNER_APPLY', application });
    const app = s.world.prospects[0];
    expect(app).toMatchObject({ name: 'Shiv Shakti Kirana', stage: 'Applied', appliedDaysAgo: 0 });
    const stages = [];
    for (let i = 0; i < 5; i++) {
      s = run(s, { type: 'PARTNER_ADVANCE', id: app.id });
      stages.push(s.world.prospects.find((p) => p.id === app.id)!.stage);
    }
    expect(stages).toEqual(['KYC & shelf check', 'Training', 'Agreement signed', 'Live', 'Live']);
  });

  it('seeded pipeline has applications at every stage before Live', () => {
    const stages = new Set(initialState().world.prospects.map((p) => p.stage));
    for (const st of ['Applied', 'KYC & shelf check', 'Training', 'Agreement signed']) expect(stages.has(st as never)).toBe(true);
  });
});

describe('Keshav’s delivery slot and backup contact', () => {
  it('are stored on the order for the rider', () => {
    const product = { title: "Men's canvas sneakers, white, size 9", category: 'shoes' as const, price: 299, sellerId: 'S1', emoji: '👟' };
    const s = run(initialState(), {
      type: 'PLACE_ORDER',
      buyerId: 'B01',
      product,
      payment: 'COD',
      token: 0,
      deliverTo: 'Neighbour · Aman Verma, Room 12 · 98260 11223',
      window: 'Evening, 6 – 9 pm',
    });
    expect(s.world.parcels[0]).toMatchObject({ deliveryWindow: 'Evening, 6 – 9 pm', altDelivery: 'Neighbour · Aman Verma, Room 12 · 98260 11223' });
  });
});

describe('ops decision on a refused parcel', () => {
  const queued = (s: State) => s.world.parcels.find((p) => p.status === 'in_queue')!;

  it('ops can override and send an opted-in parcel back', () => {
    const s = initialState();
    const p = queued(s);
    const after = run(s, { type: 'DISPOSE', parcelId: p.id, choice: 'return' });
    expect(after.world.parcels.find((x) => x.id === p.id)!.status).toBe('returning');
  });

  it('ops can never resell a parcel the seller wants back', () => {
    let s = initialState();
    const p = queued(s);
    s = run(s, { type: 'SELLER_UPDATE', sellerId: p.sellerId, patch: { optIn: false } }, { type: 'DISPOSE', parcelId: p.id, choice: 'flash' });
    expect(s.world.parcels.find((x) => x.id === p.id)!.status).toBe('in_queue');
  });

  it('a parcel is only decided once', () => {
    const s = initialState();
    const p = queued(s);
    const once = run(s, { type: 'DISPOSE', parcelId: p.id, choice: 'flash' });
    const twice = run(once, { type: 'DISPOSE', parcelId: p.id, choice: 'return' });
    expect(twice.world.parcels.find((x) => x.id === p.id)!.status).toBe('flash');
  });
});

describe('price room and deal requests', () => {
  it('Sara proposes 10% → Meesho meets at 13% → she accepts → floor updates', () => {
    const s = initialState();
    expect(s.world.sellers.find((x) => x.id === 'S1')!.floor).toBe(0.12);
    const countered = run(s, { type: 'PRICE_PROPOSE', sellerId: 'S1', floor: 0.1 });
    const thread = countered.world.threads.S1;
    const last = thread[thread.length - 1];
    expect(last).toMatchObject({ from: 'meesho', kind: 'counter', floor: 0.13 });
    expect(countered.world.sellers.find((x) => x.id === 'S1')!.floor).toBe(0.12); // not until she accepts
    const agreed = run(countered, { type: 'PRICE_ACCEPT', sellerId: 'S1' });
    expect(agreed.world.sellers.find((x) => x.id === 'S1')!.floor).toBe(0.13);
  });

  it('a proposal within 2 points of Meesho’s number is accepted straight away', () => {
    const s = run(initialState(), { type: 'PRICE_PROPOSE', sellerId: 'S1', floor: 0.14 });
    expect(s.world.sellers.find((x) => x.id === 'S1')!.floor).toBe(0.14);
  });

  it('accepting the seeded deal request sells the stuck parcel and schedules a payout', () => {
    const s = initialState();
    const deal = s.world.deals.find((d) => d.status === 'open')!;
    const done = run(s, { type: 'DEAL_RESPOND', dealId: deal.id, accept: true });
    const p = done.world.parcels.find((x) => x.id === deal.parcelId)!;
    expect(p.status).toBe('sold');
    expect(p.sellerPayout!.amount).toBe(deal.price - 47);
    expect(done.world.deals.find((d) => d.id === deal.id)!.status).toBe('accepted');
  });

  it('declining sends it back to the seller', () => {
    const s = initialState();
    const deal = s.world.deals[0];
    const done = run(s, { type: 'DEAL_RESPOND', dealId: deal.id, accept: false });
    expect(done.world.parcels.find((x) => x.id === deal.parcelId)!.status).toBe('returning');
  });
});

describe('rider proof rules', () => {
  it('blocks and flags any outcome logged away from the address', () => {
    const { s, p } = setup();
    const after = run(s, { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'not_home', reason: 'NOT_HOME_NO_ANSWER' });
    expect(after.world.blocked).toHaveLength(1);
    expect(after.world.blocked[0].why).toMatch(/GPS .* from address/);
    expect(after.world.parcels.find((x) => x.id === p.id)!.status).toBe('out_for_delivery');
  });

  it('the in-app camera will not capture away from the door', () => {
    const { s, p } = setup();
    const after = run(s, { type: 'RIDER_PHOTO', parcelId: p.id });
    expect(after.rider.photos[p.id]).toBeUndefined();
  });

  it('“not home” at the door still needs a call, then a photo', () => {
    const { s, p, atDoor } = setup();
    const at = run(s, atDoor);
    expect(outcomeBlocker(at, p, 'not_home')).toBe('No call attempt logged');
    const called = run(at, { type: 'RIDER_CALL', parcelId: p.id });
    expect(outcomeBlocker(called, p, 'not_home')).toBe('No doorstep photo from the in-app camera');

    const blocked = run(called, { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'not_home', reason: 'NOT_HOME_NO_ANSWER' });
    expect(blocked.world.blocked[0].why).toBe('No doorstep photo from the in-app camera');

    const shot = run(called, { type: 'RIDER_PHOTO', parcelId: p.id });
    expect(outcomeBlocker(shot, p, 'not_home')).toBeNull();
  });

  it('a verified “not home” stores a geotagged photo, then a retry needs fresh proof', () => {
    const { s, p, atDoor } = setup();
    const done = run(
      s,
      atDoor,
      { type: 'RIDER_CALL', parcelId: p.id },
      { type: 'RIDER_PHOTO', parcelId: p.id },
      { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'not_home', reason: 'NOT_HOME_NO_ANSWER' },
    );
    const log = done.world.logs[0];
    expect(log.parcelId).toBe(p.id);
    expect(log.verified).toBe(true);
    expect(log.photo).toMatchObject({ source: 'in_app_camera' });
    expect(log.photo!.distanceM).toBeLessThanOrEqual(100);
    expect(log.photo!.lat).toBeGreaterThan(22.6);
    expect(log.photo!.lng).toBeGreaterThan(75.7);
    expect(done.world.parcels.find((x) => x.id === p.id)!.status).toBe('retry');
    // Proof does not carry over to the next attempt.
    expect(done.rider.calls[p.id]).toBeUndefined();
    expect(done.rider.photos[p.id]).toBeUndefined();
    expect(outcomeBlocker(done, p, 'not_home')).toBe('No call attempt logged');
  });

  it('refused and delivered need GPS only; no photo is needed to refuse', () => {
    const { s, p, atDoor } = setup();
    const refused = run(s, atDoor, { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'refused', reason: 'REFUSED_CHANGED_MIND' });
    expect(refused.world.blocked).toHaveLength(0);
    expect(refused.world.logs[0].photo).toBeUndefined();
  });

  it('a refusal is listed near the buyer straight away, with no one deciding by hand', () => {
    const { s, p, atDoor } = setup();
    const listed = run(s, atDoor, { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'refused', reason: 'REFUSED_CHANGED_MIND' });
    const q = listed.world.parcels.find((x) => x.id === p.id)!;
    expect(q.status).toBe('flash');
    expect(q.flashEndsAt).toBe(listed.clock + 24 * 60);
  });

  it('a refused parcel goes straight back if the seller has turned resale off', () => {
    const { s, p, atDoor } = setup();
    const back = run(
      s,
      { type: 'SELLER_UPDATE', sellerId: p.sellerId, patch: { optIn: false } },
      atDoor,
      { type: 'RIDER_OUTCOME', parcelId: p.id, outcome: 'refused', reason: 'REFUSED_CHANGED_MIND' },
    );
    expect(back.world.parcels.find((x) => x.id === p.id)!.status).toBe('returning');
  });
});

describe('kirana onboarding on the partner app', () => {
  const profile = { storeType: 'Kirana' as const, name: 'Shiv Shakti Kirana', owner: 'Pooja Malviya', phone: '98260 77 431', address: '14, Tilak Nagar extension', landmark: 'Near Sai Baba mandir', pincode: '452016', opens: '7 am', closes: '10 pm', sundays: true };

  it('builds up step by step: profile, space photo, training, signature, approval', () => {
    let s = initialState();
    expect(s.onboarding).toEqual({ lessons: [], kyc: false });
    s = run(
      s,
      { type: 'ONBOARD', patch: { profile } },
      { type: 'ONBOARD', patch: { spacePhoto: { at: s.clock, lat: 22.7, lng: 75.9 }, spaceOk: true } },
      { type: 'ONBOARD', patch: { lessons: ['receive', 'store', 'handover', 'problems'] } },
    );
    expect(s.onboarding.profile?.name).toBe('Shiv Shakti Kirana');
    expect(s.onboarding.lessons).toHaveLength(4);
    const feedBefore = s.feed.length;
    s = run(s, { type: 'ONBOARD', patch: { kyc: true, payoutTo: 'pooja.kirana@upi', signed: { at: s.clock, name: 'Pooja Malviya' } } });
    expect(s.feed.length).toBe(feedBefore + 1);
    expect(s.feed[0].text).toMatch(/Shiv Shakti Kirana .* signed up/);
    s = run(s, { type: 'ONBOARD', patch: { approved: { at: s.clock, parcels: 40 } } });
    expect(s.onboarding.approved?.parcels).toBe(40);
    expect(run(s, { type: 'ONBOARD_RESET' }).onboarding).toEqual({ lessons: [], kyc: false });
  });
});

describe('whose phone the customer app shows', () => {
  it('starts on Keshav and switches to Harshita', () => {
    const s = initialState();
    expect(s.shopper).toBe('B01');
    expect(run(s, { type: 'SHOPPER', buyerId: 'B02' }).shopper).toBe('B02');
  });
});
