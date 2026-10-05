import { useState } from 'react';
import { MIN_HISTORY, PICKUP_DISCOUNT, TIER_BANDS, tierPolicy, type Tier } from '../model';
import { CATALOGUE, KESHAV_PRODUCT, PERSONAS, PINCODES, type Parcel } from '../seed';
import { buyerTier, kiranaOf, nearestKirana, resaleOffer, useStore, type State } from '../store';
import { Card, Chip, PhoneFrame, RatingPill, Segmented, TierBadge, TrustStrip, inr, pct, ratingFor } from '../ui';

const PRODUCT = KESHAV_PRODUCT;

type Step = 'product' | 'address' | 'payment' | 'done' | 'nearby' | 'nearby_done';
type PayOption = 'cod' | 'upi';

/** The customer whose phone we're showing (Keshav, or Harshita next door). */
function useShopper() {
  const { state } = useStore();
  return state.world.buyers.find((b) => b.id === state.shopper)!;
}

/** Refused parcels from other buyers, unopened and waiting in this shopper's pincode. */
export function nearYou(s: State, buyerId: string) {
  const me = s.world.buyers.find((b) => b.id === buyerId)!;
  return s.world.parcels.filter(
    (p) => (p.status === 'flash' || p.status === 'held') && p.buyerId !== buyerId && s.world.buyers.find((b) => b.id === p.buyerId)?.pincode === me.pincode,
  );
}

const emojiFor = (title: string) => CATALOGUE.find((c) => c.title === title)?.emoji ?? '📦';

export default function Checkout() {
  const { state } = useStore();
  const me = useShopper();
  const [step, setStep] = useState<Step>('product');
  const [alt, setAlt] = useState<string | undefined>();
  const [slot, setSlot] = useState<string>(`${SLOTS[0].label}, ${SLOTS[0].hint}`);
  const [pick, setPick] = useState<string | undefined>();
  const area = PINCODES.find((p) => p.code === me.pincode)?.area ?? '';
  // Switching whose phone it is starts them on the shop page.
  const [shownFor, setShownFor] = useState(state.shopper);
  if (shownFor !== state.shopper) {
    setShownFor(state.shopper);
    setStep('product');
  }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <PhoneFrame accent="shop" title={<div className="mt-1 text-[11px] font-semibold text-ink-600">📍 Deliver to {me.name.split(' ')[0]} · {area} {me.pincode}</div>}>
        {step === 'product' && (
          <ProductScreen
            onBuy={() => setStep('address')}
            onNearby={(id) => {
              setPick(id);
              setStep('nearby');
            }}
          />
        )}
        {step === 'nearby' && pick && <NearbyScreen parcelId={pick} onBack={() => setStep('product')} onDone={() => setStep('nearby_done')} />}
        {step === 'nearby_done' && pick && <NearbyDone parcelId={pick} onShop={() => setStep('product')} />}
        {step === 'address' && (
          <AddressScreen
            onBack={() => setStep('product')}
            onNext={(a, w) => {
              setAlt(a);
              setSlot(w);
              setStep('payment');
            }}
          />
        )}
        {step === 'payment' && <PaymentScreen alt={alt} slot={slot} onBack={() => setStep('address')} onDone={() => setStep('done')} />}
        {step === 'done' && <DoneScreen onShop={() => setStep('product')} />}
      </PhoneFrame>
      <div className="min-w-0 space-y-5">
        <TierPanel />
        <DevPanel />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- product

const ORDER_STATUS: Partial<Record<Parcel['status'], string>> = {
  out_for_delivery: 'Out for delivery today',
  retry: 'Delivery attempted · trying again',
  delivered: 'Delivered',
};

function ProductScreen({ onBuy, onNearby }: { onBuy: () => void; onNearby: (parcelId: string) => void }) {
  const { state } = useStore();
  const me = useShopper();
  const orders = state.world.parcels.filter((p) => p.buyerId === me.id);
  const near = nearYou(state, me.id);
  const seller = state.world.sellers.find((s) => s.id === PRODUCT.sellerId)!;
  const { rating, reviews } = ratingFor(PRODUCT.title);
  return (
    <div>
      {near.length > 0 && (
        <div className="border-b border-ink-200 bg-emerald-50 p-3">
          <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">⚡ Near you · get it in 3 hours</div>
          <ul className="mt-2 space-y-2">
            {near.slice(0, 2).map((p) => (
              <li key={p.id}>
                <button className="flex w-full items-center gap-3 rounded-lg border border-emerald-300 bg-white p-2 text-left hover:border-emerald-500" onClick={() => onNearby(p.id)}>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-ink-50 text-2xl">{emojiFor(p.title)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-800">{p.title}</span>
                    <span className="block text-[11px] text-ink-600">Unopened, already in {me.pincode} · ₹{PICKUP_DISCOUNT} off if you collect it</span>
                  </span>
                  <span className="num shrink-0 text-base font-extrabold">{inr(resaleOffer(state, p).price)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid h-64 place-items-center bg-ink-50 text-[110px]">{PRODUCT.emoji}</div>
      <div className="space-y-3 p-4">
        <div>
          <div className="text-[15px] font-semibold leading-snug text-ink-600">{PRODUCT.title}</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="num text-[26px] font-extrabold text-ink-800">{inr(PRODUCT.price)}</span>
            <span className="strike">{inr(499)}</span>
            <span className="off-text">40% off</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <RatingPill rating={rating} />
            <span className="text-xs font-semibold text-ink-400">{reviews.toLocaleString('en-IN')} Ratings</span>
            <span className="free-del">Free Delivery</span>
          </div>
        </div>
        <TrustStrip items={['7 Days Easy Return', 'Free Delivery', 'Lowest Prices']} />
        <div className="rounded-lg border border-ink-200 p-3 text-sm">
          <div className="label">Sold by</div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-bold text-ink-800">
              🏪 {seller.shop}, {seller.city}
            </span>
            <span className="text-xs font-bold text-brand-600">View shop</span>
          </div>
          <div className="mt-1 text-xs text-ink-600">Delivery to 452010 in 4–5 days</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost py-3 text-base">🛒 Add to Cart</button>
          <button className="btn-primary py-3 text-base" onClick={onBuy}>
            ›› Buy Now
          </button>
        </div>
        {orders.length > 0 && (
          <div>
            <div className="label mb-2 mt-2">Your orders</div>
            <ul className="space-y-2">
              {orders.map((p) => (
                <li key={p.id} className="rounded-xl border border-ink-200 p-3 text-sm">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-xs text-ink-500">
                    {p.awb} · {p.payment === 'COD' ? (p.codToken ? `₹${p.codToken} paid, ₹${p.price - p.codToken} on delivery` : 'Cash on delivery') : 'Paid'}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-brand-700">{ORDER_STATUS[p.status] ?? 'Not accepted at the door'}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- address

const ALT_OPTIONS = [
  { key: 'none', label: 'No backup' },
  { key: 'neighbour', label: 'Neighbour' },
  { key: 'shop', label: 'Nearby shop' },
  { key: 'work', label: 'Workplace' },
] as const;

const ALT_FIELDS: Record<string, { name: string; place: string; namePh: string; placePh: string }> = {
  neighbour: { name: 'Neighbour’s name', place: 'Their flat / room', namePh: 'e.g. Aman Verma', placePh: 'e.g. Room 12, same hostel' },
  shop: { name: 'Shopkeeper’s name', place: 'Shop and where', namePh: 'e.g. Rakesh Sharma', placePh: 'e.g. Sharma General Store, Scheme 54' },
  work: { name: 'Who will receive it', place: 'Where at work', namePh: 'e.g. Front desk, Priya', placePh: 'e.g. Library, Block B' },
};

/** When someone can take delivery. Riders plan their route around it. */
export const SLOTS = [
  { key: 'any', label: 'Any time', hint: '9 am – 9 pm' },
  { key: 'morning', label: 'Morning', hint: 'before 11 am' },
  { key: 'work', label: 'Working hours', hint: '11 am – 6 pm' },
  { key: 'evening', label: 'Evening', hint: '6 – 9 pm' },
  { key: 'late', label: 'Late night', hint: '9 – 11 pm' },
] as const;

const validPhone = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ''));

function Field({ label, value, onChange, placeholder, invalid, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: string | false; inputMode?: 'tel' | 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-ink-600">{label}</span>
      <input
        className={`mt-0.5 w-full rounded-lg border px-3 py-2 text-sm outline-none ${invalid ? 'border-rose-300' : 'border-ink-300 focus:border-brand-400'}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-label={label}
      />
      {invalid && <span className="text-[11px] text-rose-700">{invalid}</span>}
    </label>
  );
}

function AddressScreen({ onBack, onNext }: { onBack: () => void; onNext: (alt: string | undefined, window: string) => void }) {
  const { state } = useStore();
  const b = state.world.buyers.find((x) => x.id === state.shopper)!;
  const [phone, setPhone] = useState(b.phone);
  const [otp, setOtp] = useState<'idle' | 'sent' | 'ok'>('idle');
  const [alt, setAltKind] = useState<(typeof ALT_OPTIONS)[number]['key']>('none');
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cPlace, setCPlace] = useState('');
  const [told, setTold] = useState(false);
  const [slot, setSlot] = useState<(typeof SLOTS)[number]['key']>('any');
  const [weekends, setWeekends] = useState(false);
  const phoneValid = validPhone(phone);
  const altLabel = ALT_OPTIONS.find((o) => o.key === alt)!.label;
  const f = alt !== 'none' ? ALT_FIELDS[alt] : null;
  const contactOk = alt === 'none' || (cName.trim().length > 1 && validPhone(cPhone) && cPlace.trim().length > 1 && told);
  const chosenSlot = SLOTS.find((s) => s.key === slot)!;
  const windowText = `${chosenSlot.label}, ${chosenSlot.hint}${weekends ? ' · weekends only' : ''}`;
  const pickupPoint = nearestKirana(b, b.pincode);
  const altText = alt === 'none' ? undefined : `${altLabel} · ${cName.trim()}, ${cPlace.trim()} · ${cPhone.trim()}`;

  return (
    <div className="space-y-4 p-4">
      <button className="text-xs font-semibold text-brand-700" onClick={onBack}>
        ← Back
      </button>
      <div>
        <div className="text-base font-bold">Where should we deliver?</div>
        <div className="mt-2 rounded-xl border border-ink-200 p-3 text-sm">
          <div className="font-semibold">{b.name}</div>
          <div className="text-ink-600">{b.address}, Indore 452010</div>
          <div className="text-ink-600">Landmark: {b.landmark}</div>
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">1 · Phone the rider can reach</span>
          {otp === 'ok' && <Chip tone="good">✓ Verified</Chip>}
        </div>
        <div className="flex gap-2">
          <input
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${phoneValid ? 'border-ink-200 focus:border-brand-400' : 'border-rose-300'}`}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setOtp('idle');
            }}
            inputMode="tel"
            aria-label="Phone number"
          />
          {otp !== 'ok' && (
            <button
              className="btn-ghost shrink-0"
              disabled={!phoneValid || otp === 'sent'}
              onClick={() => {
                setOtp('sent');
                window.setTimeout(() => setOtp('ok'), 900);
              }}
            >
              {otp === 'sent' ? 'OTP…' : 'Verify'}
            </button>
          )}
        </div>
        {!phoneValid && <div className="mt-1 text-xs text-rose-700">Enter a 10-digit mobile number starting 6–9</div>}
      </div>

      <div className="rounded-xl border border-ink-200 p-3">
        <div className="mb-2 text-sm font-semibold">2 · When can someone take delivery?</div>
        <div className="grid grid-cols-2 gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSlot(s.key)}
              className={`rounded-lg border px-2.5 py-2 text-left ${slot === s.key ? 'border-brand-400 bg-brand-50' : 'border-ink-200'} ${s.key === 'any' ? 'col-span-2' : ''}`}
            >
              <div className={`text-xs font-bold ${slot === s.key ? 'text-brand-600' : 'text-ink-800'}`}>{s.label}</div>
              <div className="text-[11px] text-ink-600">{s.hint}</div>
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-700">
          <input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} /> Weekends only
        </label>
        <div className="mt-1 text-[11px] text-ink-600">
          {slot === 'late'
            ? `Riders finish by 9 pm, so late-night orders wait at ${pickupPoint.name} (open till 11 pm) with a pickup code.`
            : 'Archit plans his route around your slot. You can change it until the parcel leaves the hub.'}
        </div>
      </div>

      <div className="rounded-xl border border-ink-200 p-3">
        <div className="mb-2 text-sm font-semibold">3 · If you’re not in, leave it with… (optional)</div>
        <div className="flex flex-wrap gap-1.5">
          {ALT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setAltKind(o.key)}
              className={`chip border px-3 py-1 text-xs ${alt === o.key ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-ink-200 text-ink-600'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {f && (
          <div className="mt-3 space-y-2">
            <Field label={f.name} value={cName} onChange={setCName} placeholder={f.namePh} />
            <Field
              label="Their mobile number"
              value={cPhone}
              onChange={setCPhone}
              placeholder="10-digit mobile"
              inputMode="tel"
              invalid={cPhone.length > 0 && !validPhone(cPhone) && 'Enter a 10-digit mobile number starting 6–9'}
            />
            <Field label={f.place} value={cPlace} onChange={setCPlace} placeholder={f.placePh} />
            <label className="flex items-start gap-2 text-xs text-ink-700">
              <input type="checkbox" className="mt-0.5" checked={told} onChange={(e) => setTold(e.target.checked)} />
              <span>I’ve told them. The rider will call them only if I don’t pick up.</span>
            </label>
          </div>
        )}
        <div className="mt-2 text-[11px] text-ink-500">61% of people we surveyed would collect from a pickup point within 2 km.</div>
      </div>

      <button className="btn-primary w-full py-3 text-base" disabled={otp !== 'ok' || !contactOk} onClick={() => onNext(altText, windowText)}>
        Continue to payment
      </button>
      {otp === 'ok' && !contactOk && <div className="-mt-2 text-center text-[11px] text-rose-700">Add their name, a valid mobile and where to find them, and confirm you’ve told them.</div>}
    </div>
  );
}

// ---------------------------------------------------------------- payment

function WhyTier({ tier }: { tier: Tier }) {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [appealing, setAppealing] = useState(false);
  const [reason, setReason] = useState('I was travelling and missed the calls');
  const appeal = state.appeals[state.shopper];
  return (
    <div className="text-xs">
      <button className="font-semibold text-brand-700 underline decoration-dotted" onClick={() => setOpen((o) => !o)}>
        Why am I seeing this?
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-ink-50 p-3 text-ink-600">
          <p>
            {tier === 1
              ? 'Your orders are almost always accepted, so you get cash on delivery with no extra steps.'
              : 'Some past deliveries to this account came back, or this order looks likely to. A small step now helps the parcel reach you, and keeps delivery free for everyone.'}
          </p>
          <p>It depends on your recent order history and a risk check on this order. It is not about you personally, and it resets as orders go through.</p>
          {appeal ? (
            <p className="font-semibold text-emerald-700">Appeal received. We’ll review it within 24 hours; your options update automatically.</p>
          ) : tier > 1 && !appealing ? (
            <button className="font-semibold text-brand-700" onClick={() => setAppealing(true)}>
              Think this is wrong? Appeal →
            </button>
          ) : tier > 1 ? (
            <div className="space-y-2">
              <select className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Appeal reason">
                <option>I was travelling and missed the calls</option>
                <option>The rider never came to my door</option>
                <option>The item was damaged or wrong, so I refused it</option>
                <option>Someone else used my number</option>
              </select>
              <button className="btn-primary w-full" onClick={() => dispatch({ type: 'APPEAL', buyerId: state.shopper, reason })}>
                Send appeal
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Where cash on delivery is offered, paying online is ₹30 cheaper (Meesho already prices prepaid lower).
 * The saving never grows with risk, so refusing parcels can never earn a better deal: Tier 1 gets COD as usual,
 * Tier 2 gets COD with a ₹30 deposit, and Tier 3 can only pay online, at the full price with no discount.
 */
const ONLINE_SAVING = 30;

function PaymentScreen({ alt, slot, onBack, onDone }: { alt?: string; slot: string; onBack: () => void; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const b = state.world.buyers.find((x) => x.id === state.shopper)!;
  const { tier } = buyerTier(state, b);
  const policy = tierPolicy(tier);
  const kirana = nearestKirana(b, b.pincode);
  const saving = tier === 3 ? 0 : ONLINE_SAVING; // no COD to compare against, so no discount
  const online = PRODUCT.price - saving;
  const deposit = policy.codToken;
  const all: { key: PayOption; title: string; sub: string; show: boolean }[] = [
    {
      key: 'cod',
      title: 'Cash on delivery',
      sub: deposit ? `₹${deposit} deposit now by UPI, ${inr(PRODUCT.price - deposit)} at the door. The deposit comes back if it doesn’t reach you.` : `Pay ${inr(PRODUCT.price)} at the door`,
      show: tier !== 3,
    },
    {
      key: 'upi',
      title: saving ? `Pay online · save ₹${saving}` : 'Pay online',
      sub: saving ? `${inr(online)} now by UPI, ₹${saving} less than cash on delivery` : `${inr(online)} now by UPI`,
      show: true,
    },
  ];
  const options = all.filter((o) => o.show);
  const defaultOpt: PayOption = tier === 3 ? 'upi' : 'cod';
  const [choice, setChoice] = useState<PayOption>(defaultOpt);
  const [confirmed, setConfirmed] = useState(false);
  const [paying, setPaying] = useState(false);
  const selected = options.find((o) => o.key === choice) ? choice : defaultOpt;
  const upfront = selected === 'upi' ? online : deposit;
  const canPlace = !policy.confirmBeforeShip || confirmed;

  const place = () => {
    const go = () => {
      dispatch({ type: 'PLACE_ORDER', buyerId: state.shopper, product: selected === 'upi' ? { ...PRODUCT, price: online } : PRODUCT, payment: selected === 'upi' ? 'Prepaid' : 'COD', token: selected === 'cod' ? deposit : 0, deliverTo: alt, window: slot });
      onDone();
    };
    if (upfront > 0) {
      setPaying(true);
      window.setTimeout(go, 1100);
    } else go();
  };

  return (
    <div className="space-y-4 p-4">
      <button className="text-xs font-semibold text-brand-700" onClick={onBack}>
        ← Back
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="text-base font-bold">How would you like to pay?</div>
        <TierBadge tier={tier} />
      </div>
      <WhyTier tier={tier} />

      <ul className="space-y-2">
        {options.map((o) => {
          const active = selected === o.key;
          return (
            <li key={o.key}>
              <button
                onClick={() => setChoice(o.key)}
                className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-brand-400 bg-brand-50' : 'border-ink-200 hover:border-brand-300'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 place-items-center rounded-full border ${active ? 'border-brand-600' : 'border-ink-300'}`}>
                    {active && <span className="h-2 w-2 rounded-full bg-brand-600" />}
                  </span>
                  <span className="text-sm font-semibold">{o.title}</span>
                </div>
                <div className="ml-6 mt-0.5 text-xs">{o.sub}</div>
              </button>
            </li>
          );
        })}
      </ul>
      {tier === 3 && <div className="-mt-2 text-xs text-ink-600">Cash on delivery isn’t available on this order.</div>}

      <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
        <div className="mb-1 font-semibold text-ink-800">Delivery for this order</div>
        <ul className="space-y-1">
          <li>• Up to {policy.maxAttempts} delivery attempts</li>
          {policy.selfPickupAfterAttempts && <li>• After 2 tries, collect within 1 day from {kirana.name} ({kirana.landmark})</li>}
          {policy.preDispatchReminder && <li>• We’ll ask you to confirm before it ships. Cancel free until then.</li>}
          <li>• Delivery slot: {slot}</li>
          {alt && <li>• If you’re out: {alt}</li>}
        </ul>
      </div>

      {policy.confirmBeforeShip && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I confirm this order. The seller packs and ships it only after this confirmation.</span>
        </label>
      )}

      <div className="flex items-baseline justify-between border-t border-ink-100 pt-3 text-sm">
        <span>Pay now</span>
        <span className="num text-lg font-extrabold">{inr(upfront)}</span>
      </div>
      <button className="btn-primary w-full py-3 text-base" disabled={!canPlace || paying} onClick={place}>
        {paying ? 'Opening UPI…' : upfront > 0 ? `Pay ${inr(upfront)} & place order` : 'Place order'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- near you: a refused parcel, resold next door

function NearbyScreen({ parcelId, onBack, onDone }: { parcelId: string; onBack: () => void; onDone: () => void }) {
  const { state, dispatch } = useStore();
  const me = useShopper();
  const p = state.world.parcels.find((x) => x.id === parcelId)!;
  const offer = resaleOffer(state, p);
  const k = p.kiranaId ? kiranaOf(p.kiranaId) : nearestKirana(me, me.pincode);
  const [via, setVia] = useState<'pickup' | 'delivery'>('pickup');
  const [paying, setPaying] = useState(false);
  const gone = p.status !== 'flash' && p.status !== 'held';
  const pay = offer.price - (via === 'pickup' ? PICKUP_DISCOUNT : 0);
  const buy = () => {
    setPaying(true);
    window.setTimeout(() => {
      dispatch({ type: 'BUY', parcelId: p.id, buyerId: me.id, via });
      onDone();
    }, 1000);
  };
  return (
    <div className="space-y-4 p-4">
      <button className="text-xs font-semibold text-brand-700" onClick={onBack}>
        ← Back
      </button>
      <div className="grid h-40 place-items-center rounded-xl bg-ink-50 text-[80px]">{emojiFor(p.title)}</div>
      <div>
        <Chip tone="good">Near you · unopened</Chip>
        <div className="mt-1.5 text-[15px] font-semibold leading-snug text-ink-800">{p.title}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="num text-[26px] font-extrabold">{inr(offer.price)}</span>
          {offer.discount > 0 && <span className="off-text">{pct(offer.discount)} off</span>}
        </div>
        <div className="text-xs text-ink-600">Sealed and already in your pincode, so you get it in hours instead of in 4–5 days.</div>
      </div>
      <div className="space-y-2">
        {(
          [
            ['pickup', `Collect at ${k.name} · ₹${PICKUP_DISCOUNT} off`, `Ready in 1 hour · ${k.landmark} · open till 10 pm · show a 4-digit code`],
            ['delivery', '⚡ Delivered in 3 hours', 'To your door, today'],
          ] as const
        ).map(([key, t, sub]) => (
          <button
            key={key}
            onClick={() => setVia(key)}
            className={`w-full rounded-xl border p-3 text-left ${via === key ? 'border-brand-400 bg-brand-50' : 'border-ink-200'}`}
          >
            <div className="text-sm font-semibold">{t}</div>
            <div className="text-xs text-ink-600">{sub}</div>
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">Paid online, so there’s nothing to settle at the door. Easy returns apply as usual.</div>
      <button className="btn-primary w-full py-3 text-base" disabled={gone || paying} onClick={buy}>
        {gone ? 'Just sold to someone nearby' : paying ? 'Opening UPI…' : `Pay ${inr(pay)} by UPI`}
      </button>
    </div>
  );
}

function NearbyDone({ parcelId, onShop }: { parcelId: string; onShop: () => void }) {
  const { state } = useStore();
  const p = state.world.parcels.find((x) => x.id === parcelId)!;
  const r = p.resale;
  if (!r) return null;
  const k = p.kiranaId ? kiranaOf(p.kiranaId) : undefined;
  return (
    <div className="space-y-4 p-4 text-center">
      <div className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
      <div>
        <div className="text-lg font-bold">Paid {inr(r.price)}</div>
        <div className="text-sm text-ink-500">{p.title}</div>
      </div>
      {r.mode === 'pickup' && k ? (
        <div className="rounded-xl border-2 border-brand-300 bg-brand-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-700">Your pickup code</div>
          <div className="num text-4xl font-extrabold tracking-[0.3em] text-brand-700">{r.pickupCode}</div>
          <div className="mt-1 text-xs text-ink-600">
            Show this at {k.name}, {k.landmark}. Open till 10 pm.
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-ink-50 p-3 text-sm">⚡ Arriving within 3 hours.</div>
      )}
      <button className="btn-ghost w-full" onClick={onShop}>
        Back to shop
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- done

function DoneScreen({ onShop }: { onShop: () => void }) {
  const { state } = useStore();
  const p = state.world.parcels.find((x) => x.buyerId === state.shopper);
  if (!p) return null;
  return (
    <div className="space-y-4 p-4 text-center">
      <div className="mx-auto mt-6 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
      <div>
        <div className="text-lg font-bold">Order placed</div>
        <div className="text-sm text-ink-500">{p.awb}</div>
      </div>
      <div className="rounded-xl bg-ink-50 p-3 text-left text-sm">
        <div className="font-semibold">{p.title}</div>
        <div className="text-xs text-ink-600">
          {p.payment === 'Prepaid' ? `Paid ${inr(p.price)} by UPI` : p.codToken ? `₹${p.codToken} paid by UPI · ${inr(p.price - p.codToken)} on delivery` : `${inr(p.price)} cash on delivery`}
        </div>
        <div className="mt-2 text-xs font-semibold text-brand-700">Out for delivery today with Archit</div>
        {p.deliveryWindow && <div className="text-xs text-ink-600">Slot: {p.deliveryWindow}</div>}
        {p.altDelivery && <div className="text-xs text-ink-600">If you’re out: {p.altDelivery}</div>}
      </div>
      <button className="btn-ghost w-full" onClick={onShop}>
        Back to shop
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- right-hand panels

function band(rate: number) {
  return rate > TIER_BANDS.t3 ? 3 : rate >= TIER_BANDS.t2 ? 2 : 1;
}

function TierPanel() {
  const { state } = useStore();
  const b = state.world.buyers.find((x) => x.id === state.shopper)!;
  const t = buyerTier(state, b);
  const appeal = state.appeals[state.shopper];
  const persona = b.persona ? PERSONAS[b.persona] : undefined;
  return (
    <Card title={`How ${b.name.split(' ')[0]}’s checkout is decided`} sub={persona ? `${persona.age} · ${persona.role}. ${persona.line}` : undefined}>
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_1fr_auto_1fr]">
        <div className="rounded-xl border border-ink-200 p-3">
          <div className="label">TrustMesh score</div>
          <div className="num mt-1 text-3xl font-extrabold">{pct(b.trustMesh)}</div>
          <div className="text-xs text-ink-500">Meesho’s existing pre-dispatch RTO prediction for this order</div>
          <div className="mt-2">
            <TierBadge tier={band(b.trustMesh) as Tier} />
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 p-3">
          <div className="label">Order history</div>
          <div className="num mt-1 text-3xl font-extrabold">{t.historyRate === null ? '—' : pct(t.historyRate)}</div>
          <div className="text-xs text-ink-500">
            {b.customerCausedRtos} customer-caused RTO{b.customerCausedRtos === 1 ? '' : 's'} in {b.orders} orders
            {t.historyRate === null ? ` (needs ${MIN_HISTORY}+ orders to count)` : ''}
          </div>
          <div className="mt-2">{t.historyTier ? <TierBadge tier={t.historyTier} /> : <Chip>Not enough history</Chip>}</div>
        </div>
        <div className="hidden place-items-center text-2xl text-ink-300 md:grid">→</div>
        <div className={`rounded-xl p-3 ${t.tier === 1 ? 'bg-emerald-50' : t.tier === 2 ? 'bg-amber-50' : 'bg-rose-50'}`}>
          <div className="label">Stricter of the two</div>
          <div className="mt-1 text-3xl font-extrabold">Tier {t.tier}</div>
          <div className="text-xs text-ink-600">
            {t.overridden ? 'Set from the dev panel' : t.driver === 'both' ? 'Both signals agree' : t.driver === 'history' ? 'Driven by order history' : 'Driven by TrustMesh'}
          </div>
          {appeal && <div className="mt-2 text-xs font-semibold text-emerald-700">Appeal pending: “{appeal.reason}”</div>}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-600">
        <b>TrustMesh stays.</b> Today it blocks or allows an order. We use its score as one input and turn the answer into three graded responses, so a medium-risk
        buyer keeps COD with a ₹30 deposit, instead of losing COD.
      </p>
    </Card>
  );
}

function DevPanel() {
  const { state, dispatch } = useStore();
  const b = state.world.buyers.find((x) => x.id === state.shopper)!;
  const override = state.tierOverride[state.shopper];
  return (
    <Card title="Demo controls" sub="For presenting: change the inputs and watch the checkout respond" className="border-dashed">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="label mb-2">Whose phone</div>
          <Segmented
            size="sm"
            value={state.shopper}
            onChange={(v) => dispatch({ type: 'SHOPPER', buyerId: v })}
            options={[
              { value: 'B01', label: 'Keshav' },
              { value: 'B02', label: 'Harshita, next door' },
            ]}
          />
        </div>
        <div>
          <div className="label mb-2">Force a tier</div>
          <Segmented
            size="sm"
            value={String(override ?? 'auto')}
            onChange={(v) => dispatch({ type: 'TIER_OVERRIDE', buyerId: state.shopper, tier: v === 'auto' ? undefined : (Number(v) as Tier) })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: '1', label: 'Tier 1' },
              { value: '2', label: 'Tier 2' },
              { value: '3', label: 'Tier 3' },
            ]}
          />
        </div>
        <label className="block">
          <div className="flex items-baseline justify-between">
            <span className="label">TrustMesh score</span>
            <span className="num text-sm font-bold">{pct(b.trustMesh)}</span>
          </div>
          <input
            type="range"
            className="mt-2 w-full"
            min={0}
            max={0.9}
            step={0.01}
            value={b.trustMesh}
            onChange={(e) => dispatch({ type: 'BUYER_PATCH', buyerId: state.shopper, patch: { trustMesh: Number(e.target.value) } })}
          />
        </label>
      </div>
    </Card>
  );
}
