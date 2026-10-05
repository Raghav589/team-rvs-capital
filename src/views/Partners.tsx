/**
 * Pados Point on the Valmo Partner app: kiranas and local courier stores that
 * hold refused parcels and hand them to nearby buyers.
 * /partners          a new store signs up: profile → space photo → training → documents → live
 * /partners/counter  a live store's counter (Sharma General Store), where buyers collect with a code
 */
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { kiranaEstimate } from '../annual';
import { CATALOGUE, type StoreType } from '../seed';
import { fmtClock, holdingPointStats, kiranaOf, useStore, type PartnerProfile } from '../store';
import { Card, Chip, PhoneFrame, Segmented, inr, num } from '../ui';

const COUNTER_STORE = 'K1'; // Rakesh Sharma's Sharma General Store, 452010
const STORE_TYPES: StoreType[] = ['Kirana', 'Courier store', 'Medical store', 'Mobile & recharge', 'Other'];
const HOURS = ['6 am', '7 am', '8 am', '9 am', '10 am', '11 am', '6 pm', '7 pm', '8 pm', '9 pm', '10 pm', '11 pm'];
const TYPICAL_SQFT = 5;

const validPhone = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ''));
const emojiFor = (title: string) => CATALOGUE.find((c) => c.title === title)?.emoji ?? '📦';

const EMPTY: PartnerProfile = { storeType: 'Kirana', name: '', owner: '', phone: '', address: '', landmark: '', pincode: '', opens: '8 am', closes: '10 pm', sundays: true };
const SAMPLE: PartnerProfile = {
  storeType: 'Kirana',
  name: 'Shiv Shakti Kirana',
  owner: 'Pooja Malviya',
  phone: '98260 77 431',
  address: '14, Tilak Nagar extension',
  landmark: 'Near Sai Baba mandir',
  pincode: '452016',
  opens: '7 am',
  closes: '10 pm',
  sundays: true,
};

const STEPS = ['Profile', 'Space', 'Training', 'Sign', 'Live'] as const;
type StepName = (typeof STEPS)[number];

export default function Partners() {
  const location = useLocation();
  const navigate = useNavigate();
  const counter = location.pathname.endsWith('/counter');
  const k = kiranaOf(COUNTER_STORE);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <PhoneFrame
        title={
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80">Valmo Partner app</div>
              <div className="text-lg font-bold">🏪 Pados Point</div>
            </div>
            <div className="text-right text-xs opacity-80">
              {counter ? (
                <>
                  {k.owner}
                  <br />
                  {k.name}
                </>
              ) : (
                <>
                  Your shop,
                  <br />
                  your neighbourhood
                </>
              )}
            </div>
          </div>
        }
      >
        {counter ? <CounterScreen /> : <Onboarding />}
      </PhoneFrame>

      <div className="min-w-0 space-y-5">
        <Segmented
          value={counter ? 'counter' : 'join'}
          onChange={(v) => navigate(v === 'counter' ? '/partners/counter' : '/partners')}
          options={[
            { value: 'join', label: 'A new store signs up' },
            { value: 'counter', label: `${k.name} (live)` },
          ]}
        />
        {counter ? <HowCounterWorks /> : <HowJoiningWorks />}
        <WhyJoin />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- onboarding

function currentStep(o: ReturnType<typeof useStore>['state']['onboarding']): StepName {
  if (!o.profile) return 'Profile';
  if (!o.spacePhoto || !o.spaceOk) return 'Space';
  if (o.lessons.length < LESSONS.length) return 'Training';
  if (!o.signed) return 'Sign';
  return 'Live';
}

function Onboarding() {
  const { state } = useStore();
  const step = currentStep(state.onboarding);
  const at = STEPS.indexOf(step);
  return (
    <div>
      <ol className="sticky top-0 z-10 flex border-b border-ink-200 bg-white px-2 py-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-0.5">
            <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${i < at ? 'bg-emerald-500 text-white' : i === at ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-600'}`}>
              {i < at ? '✓' : i + 1}
            </span>
            <span className={`text-[10px] font-bold ${i === at ? 'text-brand-600' : 'text-ink-600'}`}>{s}</span>
          </li>
        ))}
      </ol>
      {step === 'Profile' && <ProfileStep />}
      {step === 'Space' && <SpaceStep />}
      {step === 'Training' && <TrainingStep />}
      {step === 'Sign' && <SignStep />}
      {step === 'Live' && <LiveStep />}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, invalid, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: string | false; inputMode?: 'tel' | 'numeric' | 'text' }) {
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

function ProfileStep() {
  const { dispatch } = useStore();
  const [form, setForm] = useState<PartnerProfile>(EMPTY);
  const [otp, setOtp] = useState<'idle' | 'sent' | 'ok'>('idle');
  const set = <K extends keyof PartnerProfile>(key: K, v: PartnerProfile[K]) => setForm({ ...form, [key]: v });
  const pinOk = /^[1-9]\d{5}$/.test(form.pincode); // any Indian pincode
  const ready = form.name.trim().length > 2 && form.owner.trim().length > 2 && otp === 'ok' && form.address.trim().length > 4 && form.landmark.trim().length > 2 && pinOk;

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg bg-brand-50 p-3">
        <div className="text-sm font-extrabold text-ink-800">Earn from space you already have</div>
        <div className="text-[11px] text-ink-600">Hold sealed Meesho parcels for a few days and hand them to buyers from your area. No rent, no stock, no deposit.</div>
        <button
          className="mt-2 text-[11px] font-bold text-brand-600 underline"
          onClick={() => {
            setForm(SAMPLE);
            setOtp('ok');
          }}
        >
          Fill a sample store (for the demo)
        </button>
      </div>
      <div className="text-sm font-bold text-ink-800">Create your store profile</div>
      <div>
        <div className="text-[11px] font-bold text-ink-600">Type of store</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {STORE_TYPES.map((t) => (
            <button key={t} onClick={() => set('storeType', t)} className={`chip border px-2.5 py-1 text-xs ${form.storeType === t ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <Input label="Store name" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Shiv Shakti Kirana" />
      <Input label="Owner’s name" value={form.owner} onChange={(v) => set('owner', v)} placeholder="As on your ID" />
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Mobile number"
            value={form.phone}
            onChange={(v) => {
              set('phone', v);
              setOtp('idle');
            }}
            placeholder="10-digit mobile"
            inputMode="tel"
            invalid={form.phone.length > 0 && !validPhone(form.phone) && 'Enter a 10-digit mobile starting 6–9'}
          />
        </div>
        {otp === 'ok' ? (
          <Chip tone="good">✓ Verified</Chip>
        ) : (
          <button
            className="btn-ghost mb-0.5 shrink-0"
            disabled={!validPhone(form.phone) || otp === 'sent'}
            onClick={() => {
              setOtp('sent');
              window.setTimeout(() => setOtp('ok'), 900);
            }}
          >
            {otp === 'sent' ? 'OTP…' : 'Verify'}
          </button>
        )}
      </div>
      <Input label="Shop address" value={form.address} onChange={(v) => set('address', v)} placeholder="Shop number, street, area" />
      <Input label="Landmark" value={form.landmark} onChange={(v) => set('landmark', v)} placeholder="e.g. opposite SBI ATM" />
      <div>
        <Input label="Pincode" value={form.pincode} onChange={(v) => set('pincode', v.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" inputMode="numeric" invalid={form.pincode.length === 6 && !pinOk && 'Enter a valid 6-digit pincode'} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['opens', 'closes'] as const).map((key) => (
          <label key={key} className="block">
            <span className="text-[11px] font-bold text-ink-600">{key === 'opens' ? 'Opens at' : 'Closes at'}</span>
            <select className="mt-0.5 w-full rounded-lg border border-ink-300 bg-white px-2 py-2 text-sm" value={form[key]} onChange={(e) => set(key, e.target.value)} aria-label={key === 'opens' ? 'Opens at' : 'Closes at'}>
              {HOURS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input type="checkbox" checked={form.sundays} onChange={(e) => set('sundays', e.target.checked)} /> Open on Sundays
      </label>
      <button className="btn-primary w-full py-3 text-base" disabled={!ready} onClick={() => dispatch({ type: 'ONBOARD', patch: { profile: { ...form, name: form.name.trim(), owner: form.owner.trim() } } })}>
        Save and continue
      </button>
    </div>
  );
}

/** What the in-app camera "sees": a shelf with room for parcels. */
function ShelfPhoto({ stamp }: { stamp?: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      <svg viewBox="0 0 300 200" className="block w-full" role="img" aria-label="Photo of the free shelf space">
        <rect width="300" height="200" fill="#e9e1d3" />
        <rect x="0" y="170" width="300" height="30" fill="#c9b99f" />
        <rect x="40" y="20" width="220" height="155" fill="#8a5a36" />
        <rect x="48" y="28" width="204" height="139" fill="#f3ead9" />
        {[70, 112].map((y) => (
          <rect key={y} x="48" y={y} width="204" height="6" fill="#8a5a36" />
        ))}
        <rect x="56" y="44" width="34" height="26" fill="#d98b3a" />
        <rect x="94" y="50" width="26" height="20" fill="#3a7bd5" />
        <rect x="56" y="88" width="30" height="24" fill="#5aa469" />
        <rect x="60" y="130" width="40" height="37" fill="#c05b5b" />
        <rect x="120" y="36" width="126" height="130" fill="none" stroke="#038d63" strokeWidth="2.5" strokeDasharray="7 5" />
        <text x="183" y="106" textAnchor="middle" fontSize="12" fontWeight="700" fill="#038d63">
          free space
        </text>
      </svg>
      {stamp && <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">{stamp}</div>}
    </div>
  );
}

function SpaceStep() {
  const { state, dispatch } = useStore();
  const [camera, setCamera] = useState(false);
  const [flash, setFlash] = useState(false);
  const photo = state.onboarding.spacePhoto;
  const stamp = photo ? `📍 ${photo.lat.toFixed(4)}°N, ${photo.lng.toFixed(4)}°E · ${fmtClock(photo.at)} · in-app camera` : undefined;

  if (camera) {
    return (
      <div className="flex min-h-[620px] flex-col bg-ink-900 p-3 text-white">
        <div className="flex items-center justify-between text-xs">
          <button className="font-semibold text-white/80" onClick={() => setCamera(false)}>
            ✕ Cancel
          </button>
          <span className="font-semibold">● Valmo in-app camera</span>
        </div>
        <div className={`mt-3 transition ${flash ? 'opacity-30' : ''}`}>
          <ShelfPhoto />
        </div>
        <div className="mt-2 text-center text-xs text-white/80">Get the whole free space in the frame, in good light.</div>
        <div className="mt-auto grid place-items-center pb-4">
          <button
            aria-label="Take photo of free space"
            className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white p-1"
            onClick={() => {
              setFlash(true);
              window.setTimeout(() => {
                dispatch({ type: 'ONBOARD', patch: { spacePhoto: { at: state.clock, lat: 22.7263, lng: 75.9025 } } });
                setFlash(false);
                setCamera(false);
              }, 220);
            }}
          >
            <span className="h-full w-full rounded-full bg-white" />
          </button>
        </div>
      </div>
    );
  }

  const e = kiranaEstimate(TYPICAL_SQFT, state.assumptions);
  return (
    <div className="space-y-3 p-3">
      <div className="text-sm font-bold text-ink-800">One photo of your free space</div>
      <div className="text-xs text-ink-600">The shelf or corner where you’ll keep parcels. No measuring: we work out the rest from the photo.</div>
      {photo ? (
        <>
          <ShelfPhoto stamp={stamp} />
          <div className="rounded-lg bg-emerald-50 p-3 text-center">
            <div className="text-xs font-bold text-emerald-800">Your space fits about</div>
            <div className="num text-2xl font-extrabold text-emerald-700">{e.capacity} parcels</div>
            <div className="text-sm text-emerald-900">
              You could earn about <b>{inr(Math.round(e.monthly / 10) * 10)} a month</b>
            </div>
          </div>
          <button className="btn-primary w-full py-3 text-base" onClick={() => dispatch({ type: 'ONBOARD', patch: { spaceOk: true } })}>
            Continue
          </button>
        </>
      ) : (
        <button className="btn-primary w-full py-3 text-base" onClick={() => setCamera(true)}>
          📷 Take the photo
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- training

interface Lesson {
  id: string;
  title: string;
  points: string[];
  practice: (done: () => void) => ReactNode;
}

function Barcode({ awb }: { awb: string }) {
  const bars = Array.from(awb).flatMap((c, i) => [(c.charCodeAt(0) + i) % 3 + 1, 1]);
  let x = 0;
  return (
    <div className="rounded-md border border-ink-300 bg-white p-2 text-center">
      <svg viewBox={`0 0 ${bars.reduce((t, b) => t + b, 0)} 20`} className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
        {bars.map((w, i) => {
          const r = i % 2 === 0 ? <rect key={i} x={x} y={0} width={w} height={20} fill="#1f1f29" /> : null;
          x += w;
          return r;
        })}
      </svg>
      <div className="num text-[11px] font-bold tracking-widest">{awb}</div>
    </div>
  );
}

function ScanPractice({ awb, label, onDone }: { awb: string; label: string; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'scanning' | 'ok'>('idle');
  return (
    <div className="space-y-2">
      <Barcode awb={awb} />
      {state === 'ok' ? (
        <Chip tone="good">✓ {awb} · {label}</Chip>
      ) : (
        <button
          className="btn-ghost w-full"
          disabled={state === 'scanning'}
          onClick={() => {
            setState('scanning');
            window.setTimeout(() => {
              setState('ok');
              onDone();
            }, 700);
          }}
        >
          {state === 'scanning' ? 'Scanning…' : '▣ Scan barcode'}
        </button>
      )}
    </div>
  );
}

function Quiz({ q, options, onDone }: { q: string; options: { t: string; right: boolean; why: string }[]; onDone: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-ink-800">{q}</div>
      {options.map((o, i) => (
        <button
          key={o.t}
          onClick={() => {
            setPick(i);
            if (o.right) onDone();
          }}
          className={`w-full rounded-lg border p-2 text-left text-xs ${pick === i ? (o.right ? 'border-emerald-400 bg-emerald-50' : 'border-rose-300 bg-rose-50') : 'border-ink-200'}`}
        >
          {o.t}
          {pick === i && <div className={`mt-0.5 font-semibold ${o.right ? 'text-emerald-700' : 'text-rose-700'}`}>{o.why}</div>}
        </button>
      ))}
    </div>
  );
}

function HandoverPractice({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [out, setOut] = useState(false);
  const ok = code === '4821';
  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-ink-50 p-2 text-xs">
        Buyer’s phone shows: <b className="num tracking-widest">4821</b>
      </div>
      <input
        className="w-full rounded-lg border border-ink-300 px-3 py-2 text-center text-lg font-extrabold tracking-[0.4em] outline-none focus:border-brand-400"
        placeholder="• • • •"
        inputMode="numeric"
        maxLength={4}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label="Practice pickup code"
      />
      {out ? (
        <Chip tone="good">✓ Code matched, parcel scanned out. Hand it over.</Chip>
      ) : (
        <button
          className="btn-ghost w-full"
          disabled={!ok}
          onClick={() => {
            setOut(true);
            onDone();
          }}
        >
          {code.length === 4 && !ok ? 'That code doesn’t match' : '▣ Scan parcel out'}
        </button>
      )}
    </div>
  );
}

const LESSONS: Lesson[] = [
  {
    id: 'receive',
    title: 'Receiving parcels',
    points: [
      'A Valmo rider drops parcels in the evening.',
      'Scan every barcode before you sign the rider’s sheet. Scanned in = in your care.',
      'Torn, wet or open box? Don’t scan it. Tap “Damaged”, take a photo, give it back to the rider.',
    ],
    practice: (done) => <ScanPractice awb="VL7421548IN" label="received, on your shelf" onDone={done} />,
  },
  {
    id: 'store',
    title: 'Keeping parcels safe',
    points: ['Keep them sealed, dry and off the floor.', 'Stack by the last 4 digits on the label, so you find them fast.', 'Never open a parcel, even if a buyer asks.'],
    practice: (done) => (
      <Quiz
        q="A buyer wants to open the box to check the size before taking it. You…"
        options={[
          { t: 'Open it for them', right: false, why: 'No: parcels stay sealed. Returns go through their Meesho app.' },
          { t: 'Keep it sealed; returns are easy in their app', right: true, why: 'Right. Sealed parcels are what make local resale work.' },
        ]}
        onDone={done}
      />
    ),
  },
  {
    id: 'handover',
    title: 'Handing a parcel over',
    points: ['Ask for the 4-digit code on the buyer’s phone.', 'Type it in. The app shows which parcel it is.', 'Scan the parcel out, then hand it over. No code, no parcel.'],
    practice: (done) => <HandoverPractice onDone={done} />,
  },
  {
    id: 'problems',
    title: 'If something goes wrong',
    points: [
      'Lost or damaged on your shelf? Report it in the app within 24 hours, with a photo.',
      'Unsold after 4 weeks: a Valmo rider collects it. Scan it out to the rider.',
      'Stuck? Call the partner helpline from the app, 8 am to 10 pm.',
    ],
    practice: (done) => (
      <Quiz
        q="Someone says they’re the buyer’s brother, but has no code. You…"
        options={[
          { t: 'Hand it over, they know the buyer’s name', right: false, why: 'No: without the code, the parcel stays with you and you stay liable for it.' },
          { t: 'Don’t hand it over; ask the buyer to share the code', right: true, why: 'Right. The code is the proof of pickup.' },
        ]}
        onDone={done}
      />
    ),
  },
];

function TrainingStep() {
  const { state, dispatch } = useStore();
  const done = state.onboarding.lessons;
  const [open, setOpen] = useState<string>(LESSONS.find((l) => !done.includes(l.id))?.id ?? LESSONS[0].id);
  const [practised, setPractised] = useState<Record<string, boolean>>({});
  const finish = (id: string) => {
    const lessons = done.includes(id) ? done : [...done, id];
    dispatch({ type: 'ONBOARD', patch: { lessons } });
    const next = LESSONS.find((l) => !lessons.includes(l.id));
    if (next) setOpen(next.id);
  };
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-bold text-ink-800">Quick training</div>
        <div className="text-xs font-bold text-ink-600">
          {done.length} of {LESSONS.length} done · ~10 min
        </div>
      </div>
      <ul className="space-y-2">
        {LESSONS.map((l, i) => {
          const isDone = done.includes(l.id);
          const isOpen = open === l.id;
          return (
            <li key={l.id} className={`rounded-lg border ${isOpen ? 'border-brand-300' : 'border-ink-200'}`}>
              <button className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setOpen(l.id)}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isDone ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-600'}`}>{isDone ? '✓' : i + 1}</span>
                <span className="text-sm font-bold">{l.title}</span>
              </button>
              {isOpen && (
                <div className="space-y-3 px-3 pb-3">
                  <ul className="space-y-1 text-xs text-ink-700">
                    {l.points.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                  <div className="rounded-lg bg-brand-50 p-2">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">Try it</div>
                    {l.practice(() => setPractised((x) => ({ ...x, [l.id]: true })))}
                  </div>
                  {!isDone && (
                    <button className="btn-primary w-full" disabled={!practised[l.id]} onClick={() => finish(l.id)}>
                      Done, next lesson
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- documents & signing

const DOCS = [
  {
    id: 'agreement',
    title: 'Pados Point partner agreement',
    points: ['₹15 for every parcel you hold, ₹20 when it’s collected, ₹10 for a same-day pickup', 'Paid every Monday to your bank or UPI', 'Open at least 10 hours a day', 'No joining fee, no targets. Either side can stop with 7 days’ notice'],
  },
  {
    id: 'custody',
    title: 'Parcel custody and liability',
    points: [
      'A parcel is in your care from scan-in until you scan it out to a buyer or a Valmo rider',
      'Lost, opened or damaged in your care: its value (up to ₹1,000 a parcel) is deducted from your payouts, after a review with photos',
      'Not your liability: damage reported at scan-in, parcels never scanned in, fire, flood or theft reported to the police (covered by Valmo’s insurance)',
    ],
  },
  {
    id: 'consignment',
    title: 'Consignment and tax',
    points: ['Parcels belong to the seller, not to you or Meesho', 'Buyers pay online: you never collect cash', 'Your fees are income; GST applies only if your turnover crosses ₹20 lakh', 'A monthly statement comes in the app for your records'],
  },
];

function SignStep() {
  const { state, dispatch } = useStore();
  const o = state.onboarding;
  const owner = o.profile?.owner ?? '';
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>('custody');
  const [payout, setPayout] = useState(o.payoutTo ?? '');
  const [typed, setTyped] = useState('');
  const [kyc, setKyc] = useState<'idle' | 'busy' | 'ok'>(o.kyc ? 'ok' : 'idle');
  const [signing, setSigning] = useState(false);
  const nameOk = typed.trim().toLowerCase() === owner.toLowerCase() && owner.length > 0;
  const ready = kyc === 'ok' && payout.trim().length > 4 && DOCS.every((d) => read[d.id]) && nameOk;
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-bold text-ink-800">Documents</div>
        <button
          className="text-[11px] font-bold text-brand-600 underline"
          onClick={() => {
            setKyc('ok');
            setPayout('pooja.kirana@upi');
            setRead({ agreement: true, custody: true, consignment: true });
            setTyped(owner);
          }}
        >
          Fill for the demo
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 p-3">
        <div>
          <div className="text-sm font-bold">ID check</div>
          <div className="text-[11px] text-ink-600">{kyc === 'ok' ? 'Aadhaar and PAN verified through DigiLocker' : 'Aadhaar and PAN, through DigiLocker'}</div>
        </div>
        {kyc === 'ok' ? (
          <Chip tone="good">✓ Verified</Chip>
        ) : (
          <button
            className="btn-ghost shrink-0"
            disabled={kyc === 'busy'}
            onClick={() => {
              setKyc('busy');
              window.setTimeout(() => setKyc('ok'), 900);
            }}
          >
            {kyc === 'busy' ? 'Opening…' : 'DigiLocker'}
          </button>
        )}
      </div>
      <Input label="Where should we pay you every Monday?" value={payout} onChange={setPayout} placeholder="UPI ID or bank account" />

      <ul className="space-y-2">
        {DOCS.map((d) => (
          <li key={d.id} className="rounded-lg border border-ink-200">
            <button className="flex w-full items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(open === d.id ? null : d.id)}>
              <span className="text-sm font-bold">{d.title}</span>
              {read[d.id] ? <Chip tone="good">✓ Read</Chip> : <span className="text-xs text-ink-600">{open === d.id ? '▴' : '▾'}</span>}
            </button>
            {open === d.id && (
              <div className="space-y-2 px-3 pb-3">
                <ul className="space-y-1 text-xs text-ink-700">
                  {d.points.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-800">
                  <input type="checkbox" checked={!!read[d.id]} onChange={(e) => setRead({ ...read, [d.id]: e.target.checked })} /> I have read and accept this
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="text-xs font-bold text-amber-900">I take responsibility for every parcel I scan in, until I scan it out.</div>
        <div className="mt-2">
          <Input label={`Type your full name to sign (${owner})`} value={typed} onChange={setTyped} placeholder={owner} />
        </div>
      </div>
      <button
        className="btn-primary w-full py-3 text-base"
        disabled={!ready || signing}
        onClick={() => {
          setSigning(true);
          window.setTimeout(() => {
            dispatch({ type: 'ONBOARD', patch: { kyc: true, payoutTo: payout.trim(), signed: { at: state.clock, name: typed.trim() } } });
            setSigning(false);
          }, 900);
        }}
      >
        {signing ? 'Checking Aadhaar OTP…' : 'Sign with Aadhaar OTP'}
      </button>
    </div>
  );
}

function LiveStep() {
  const { state, dispatch } = useStore();
  const o = state.onboarding;
  const e = kiranaEstimate(TYPICAL_SQFT, state.assumptions);
  const p = o.profile!;
  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg bg-emerald-50 p-4 text-center">
        <div className="text-3xl">🎉</div>
        <div className="text-base font-extrabold text-emerald-800">{p.name} is a Pados Point</div>
        <div className="mt-1 text-sm text-emerald-900">
          About <b>{e.capacity} parcels</b> · about <b>{inr(Math.round(e.monthly / 10) * 10)} a month</b>
        </div>
      </div>
      <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
        A Valmo associate drops off your QR standee, then parcels for buyers near you start arriving with the evening run. Paid every Monday to {o.payoutTo}.
      </div>
      <button className="btn-ghost w-full" onClick={() => dispatch({ type: 'ONBOARD_RESET' })}>
        Start over (demo)
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- live counter

function CounterScreen() {
  const { state, dispatch } = useStore();
  const k = kiranaOf(COUNTER_STORE);
  const st = holdingPointStats(state, k);
  const toHand = state.world.parcels.filter((p) => p.status === 'sold' && p.resale?.mode === 'pickup' && p.kiranaId === COUNTER_STORE);
  const waiting = state.world.parcels.filter((p) => p.status === 'held' && p.kiranaId === COUNTER_STORE);
  const [codes, setCodes] = useState<Record<string, string>>({});
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-50 p-2">
          <div className="num text-xl font-extrabold">{st.holds}</div>
          <div className="text-[10px] font-bold text-ink-600">held this week</div>
        </div>
        <div className="rounded-lg bg-ink-50 p-2">
          <div className="num text-xl font-extrabold">{st.pickups}</div>
          <div className="text-[10px] font-bold text-ink-600">pickups</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2">
          <div className="num text-xl font-extrabold text-emerald-700">{inr(st.earned)}</div>
          <div className="text-[10px] font-bold text-emerald-700">earned</div>
        </div>
      </div>

      <div className="px-1 text-xs font-bold uppercase tracking-wide text-ink-600">Buyers coming to collect</div>
      {toHand.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 p-3 text-center text-xs text-ink-600">No pickups waiting right now.</div>
      ) : (
        <ul className="space-y-2">
          {toHand.map((p) => {
            const buyer = state.world.buyers.find((b) => b.id === p.resale!.buyerId)!;
            const typed = codes[p.id] ?? '';
            const match = typed === p.resale!.pickupCode;
            return (
              <li key={p.id} className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3">
                <div className="flex items-start gap-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-2xl">{emojiFor(p.title)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{p.title}</div>
                    <div className="text-[11px] text-ink-600">
                      For {buyer.name} · paid online · {p.awb}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-center text-lg font-extrabold tracking-[0.4em] outline-none focus:border-brand-400"
                    placeholder="• • • •"
                    inputMode="numeric"
                    maxLength={4}
                    value={typed}
                    onChange={(e) => setCodes({ ...codes, [p.id]: e.target.value.replace(/\D/g, '') })}
                    aria-label="Buyer’s pickup code"
                  />
                  <button className="btn-primary shrink-0" disabled={!match} onClick={() => dispatch({ type: 'COMPLETE_LOCAL', parcelId: p.id })}>
                    Scan out
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-ink-600">
                  Ask for the 4-digit code on their phone{typed.length === 4 && !match ? '. That code doesn’t match.' : '.'}{' '}
                  <button className="font-bold text-brand-600 underline" onClick={() => setCodes({ ...codes, [p.id]: p.resale!.pickupCode ?? '' })}>
                    Demo: buyer shows code
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-1 text-xs font-bold uppercase tracking-wide text-ink-600">On your shelf</div>
      {waiting.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 p-3 text-center text-xs text-ink-600">Shelf is empty. New parcels arrive with the evening Valmo run.</div>
      ) : (
        <ul className="space-y-2">
          {waiting.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-ink-200 p-3 text-sm">
              <span className="truncate font-bold">{p.title}</span>
              <span className="shrink-0 text-xs text-ink-600">since {fmtClock(p.refusedAt ?? 0).split(' ·')[0]}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg bg-ink-50 p-3 text-[11px] text-ink-600">Paid every Monday: ₹{state.assumptions.handling} for every parcel you hold, ₹{state.assumptions.commission} when it’s collected, ₹10 for a same-day pickup.</div>
    </div>
  );
}

// ---------------------------------------------------------------- right-hand panels

function HowJoiningWorks() {
  const steps: [string, string][] = [
    ['Profile', 'Store type, owner, mobile verified by OTP, address, pincode and opening hours.'],
    ['Space photo', 'One photo of the free shelf from the in-app camera gives an instant estimate: how many parcels fit and what the store can earn. No measuring, and only asked once.'],
    ['Training', 'Four short lessons with hands-on practice: scanning parcels in, keeping them sealed, handing over against a code, and what to do if something goes wrong.'],
    ['Sign', 'ID check through DigiLocker, a payout account, and three documents: the partner agreement, custody and liability, consignment and tax. Signed with Aadhaar OTP.'],
    ['Live', 'Right after signing. A Valmo associate drops off a QR standee and parcels start arriving.'],
  ];
  return (
    <Card title="How a store joins, in about 20 minutes" sub="Everything happens on the Valmo Partner app. No visit or paperwork needed to start.">
      <ol className="space-y-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
            <div>
              <div className="text-sm font-bold text-ink-800">{t}</div>
              <div className="text-sm text-ink-600">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Who owns a parcel, when.</b> From scan-in to scan-out the store is responsible. If it’s lost or damaged in their care, its value (up to ₹1,000) is deducted after a
        review with photos. Damage reported at scan-in, and fire, flood or police-reported theft, are on Valmo’s insurance instead.
      </div>
    </Card>
  );
}

function HowCounterWorks() {
  return (
    <Card title="At the counter" sub="What Rakesh does when a buyer walks in to collect">
      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          ['Ask for the code', 'The buyer shows a 4-digit code from their Meesho app.'],
          ['Scan it out', 'The code must match. Scanning out ends the store’s responsibility for it.'],
          ['Hand it over', 'The order counts as delivered. The parcel never went back up the network.'],
        ].map(([t, d], i) => (
          <li key={t} className="rounded-lg border border-ink-200 p-3">
            <div className="text-xs font-bold text-brand-600">Step {i + 1}</div>
            <div className="text-sm font-bold text-ink-800">{t}</div>
            <div className="text-xs text-ink-600">{d}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function WhyJoin() {
  const { state } = useStore();
  const e = kiranaEstimate(TYPICAL_SQFT, state.assumptions);
  const walkIns = Math.round(e.pickupsPerDay * 30);
  const gains = [`~${walkIns} more people walking into the shop every month`, 'Paid weekly; no targets, no minimums', 'Free training and a QR standee'];
  const notNeeded = ['Rent or deposit', 'Buying stock', 'Staff or a vehicle', 'Any fee to join'];
  return (
    <Card title="Why a store joins" sub={`For a typical ${TYPICAL_SQFT} sq ft shelf holding about ${e.capacity} parcels`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="rounded-lg bg-emerald-50 p-4">
          <div className="label text-emerald-700">Likely earnings</div>
          <div className="num text-4xl font-extrabold text-emerald-700">
            {inr(Math.round(e.monthly / 10) * 10)}
            <span className="text-base font-bold"> / month</span>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
            <li>
              ~{num(e.holdsPerDay, 1)} parcels a day to hold × ₹{state.assumptions.handling}
            </li>
            <li>
              ~{num(e.heldPickupsPerDay, 1)} collected from the shelf × ₹{state.assumptions.commission}
            </li>
            <li>~{num(e.flashPickupsPerDay, 1)} same-day pickups × ₹10</li>
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="label mb-1">What they get</div>
            <ul className="space-y-1 text-sm text-ink-800">
              {gains.map((g) => (
                <li key={g}>✓ {g}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="label mb-1">Not needed</div>
            <ul className="space-y-1 text-sm text-ink-600">
              {notNeeded.map((c) => (
                <li key={c}>✕ {c}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-600">Proven at scale: Amazon India’s “I Have Space” runs about 28,000 partner stores handling 30–40 parcels a day.</p>
    </Card>
  );
}
