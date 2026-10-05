import { useEffect, useRef, useState } from 'react';
import { tierPolicy } from '../model';
import { PERSONAS, REASONS, toLatLng, type Outcome, type Parcel, type ReasonCode } from '../seed';
import { FAR_BONUS, FAR_KM, GPS_RADIUS_M, buyerTier, fmtClock, hubOf, outcomeBlocker, riderDistanceM, riderTrust, useStore } from '../store';
import { Card, Chip, DoorstepPhoto, PhoneFrame, PincodeMap, inr, km, pct } from '../ui';

const OUTCOMES: { key: Outcome; label: string; icon: string }[] = [
  { key: 'delivered', label: 'Delivered', icon: '✓' },
  { key: 'refused', label: 'Refused', icon: '✕' },
  { key: 'not_home', label: 'Not home', icon: '⌂' },
  { key: 'address_not_found', label: 'Address not found', icon: '?' },
];

const ACTIVE: Parcel['status'][] = ['out_for_delivery', 'retry'];

export default function Rider() {
  const { state } = useStore();
  const route = state.world.parcels
    .filter((p) => p.riderId === state.rider.id)
    .filter((p) => ACTIVE.includes(p.status) || state.world.logs.some((l) => l.parcelId === p.id && !l.historical))
    .sort((a, b) => Number(!ACTIVE.includes(a.status)) - Number(!ACTIVE.includes(b.status)) || a.distanceKm - b.distanceKm);
  const active = state.world.parcels.find((p) => p.id === state.rider.activeParcelId);
  const trust = riderTrust(state, state.rider.id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <PhoneFrame
        title={
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80">Valmo Rider · Malwa Express</div>
              <div className="text-lg font-bold">Archit Sharma</div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-80">Trust score</div>
              <div className="num text-lg font-extrabold">{pct(trust.score)}</div>
            </div>
          </div>
        }
      >
        {active ? <ParcelScreen p={active} /> : <RouteList route={route} />}
      </PhoneFrame>

      <div className="space-y-5">
        <Card title="Archit’s day" sub={PERSONAS.archit.line}>
          <PincodeMap
            parcels={route}
            selectedId={active?.id}
            rider={state.rider.pos}
            focusPincode={active ? state.world.buyers.find((b) => b.id === active.buyerId)?.pincode : undefined}
            showLegend={false}
          />
          <div className="mt-2 text-xs text-ink-600">Pink “A” is Archit’s live GPS. The pulse is the parcel he is working on.</div>
        </Card>
        <Card title="Fake attempts blocked" sub={`Outcomes logged without being at the door. Archit’s trust score is ${pct(trust.score)}; his incentives are tied to it.`}>
          {state.world.blocked.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-300 p-4 text-center text-sm text-ink-600">None today.</div>
          ) : (
            <ul className="space-y-2">
              {state.world.blocked.slice(0, 4).map((x) => {
                const bp = state.world.parcels.find((q) => q.id === x.parcelId);
                const who = bp ? state.world.buyers.find((b) => b.id === bp.buyerId)?.name.split(' ')[0] : undefined;
                return (
                  <li key={x.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <b className="text-rose-800">
                        Tried “{x.tried.replace('_', ' ')}”{who ? ` on ${who}’s parcel` : ''}
                      </b>
                      <span className="num shrink-0 text-xs text-rose-700">{fmtClock(x.at)}</span>
                    </div>
                    <div className="text-rose-700">{x.why}. Not counted against the buyer; logged for review with his courier.</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- route list

function RouteList({ route }: { route: Parcel[] }) {
  const { state, dispatch } = useStore();
  const hub = hubOf('H1');
  const open = route.filter((p) => ACTIVE.includes(p.status));
  const bonus = open.filter((p) => p.distanceKm > FAR_KM).length * FAR_BONUS;
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">Today’s route</div>
          <div className="text-xs text-ink-500">{hub.name}</div>
        </div>
        <div className="text-right text-xs">
          <div className="font-bold">{open.length} left</div>
          {bonus > 0 && <div className="font-semibold text-emerald-700">+{inr(bonus)} far-drop bonus</div>}
        </div>
      </div>
      <ul className="space-y-2">
        {route.map((p) => {
          const b = state.world.buyers.find((x) => x.id === p.buyerId)!;
          const done = !ACTIVE.includes(p.status);
          return (
            <li key={p.id}>
              <button
                disabled={done}
                onClick={() => dispatch({ type: 'RIDER_SELECT', parcelId: p.id })}
                className={`w-full rounded-lg border p-3 text-left transition ${done ? 'border-ink-100 bg-ink-50 opacity-60' : 'border-ink-200 bg-white hover:border-brand-300'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{b.name}</span>
                  <span className="num text-xs font-semibold text-ink-500">{p.distanceKm} km</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-500">{b.address}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Chip tone={p.payment === 'COD' ? 'warn' : 'good'}>{p.payment === 'COD' ? `COD ${inr(p.price - (p.codToken ?? 0))}` : 'Prepaid'}</Chip>
                  {p.distanceKm > FAR_KM && <Chip tone="good">+{inr(FAR_BONUS)} far drop</Chip>}
                  {p.deliveryWindow && <Chip tone="brand">🕘 {p.deliveryWindow.split(',')[0]}</Chip>}
                  {p.attemptsMade > 0 && ACTIVE.includes(p.status) && (
                    <Chip tone="info">
                      Attempt {p.attemptsMade + 1}/{p.maxAttempts}
                    </Chip>
                  )}
                  {done && <Chip>{p.status === 'delivered' ? 'Delivered' : 'Logged, back to hub'}</Chip>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- one parcel

function ParcelScreen({ p }: { p: Parcel }) {
  const { state, dispatch } = useStore();
  const b = state.world.buyers.find((x) => x.id === p.buyerId)!;
  const tier = buyerTier(state, b);
  const d = riderDistanceM(state, p);
  const near = d <= GPS_RADIUS_M;
  const callAt = state.rider.calls[p.id];
  const [walking, setWalking] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [picking, setPicking] = useState<Outcome | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  const [camera, setCamera] = useState(false);
  const [pinIssue, setPinIssue] = useState<'closed' | 'open' | 'sent'>('closed');
  const [pinWhy, setPinWhy] = useState(PIN_ISSUES[0]);
  const photo = state.rider.photos[p.id];
  const timer = useRef<number>();

  useEffect(() => () => window.clearInterval(timer.current), []);

  const walk = () => {
    const from = { ...state.rider.pos };
    const to = { x: p.x - 0.028, y: p.y + 0.021 }; // ≈ 35 m short of the door
    // Time-based, so throttled timers (background tab, screen share) still arrive on schedule.
    const start = performance.now();
    const duration = 1500;
    setWalking(true);
    timer.current = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      dispatch({ type: 'RIDER_MOVE', x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t >= 1) {
        window.clearInterval(timer.current);
        setWalking(false);
      }
    }, 50);
  };

  const call = () => {
    setDialing(true);
    window.setTimeout(() => {
      dispatch({ type: 'RIDER_CALL', parcelId: p.id });
      setDialing(false);
    }, 1200);
  };

  /** Rider-facing wording for the store's lock rule (outcomeBlocker). */
  const lockReason = (o: Outcome) => {
    const why = outcomeBlocker(state, p, o);
    if (!why) return null;
    if (!near) return `You are ${km(d)} away. Get within ${GPS_RADIUS_M} m.`;
    if (why.startsWith('No call')) return 'Call the customer first.';
    if (why.startsWith('No doorstep')) return 'Take a doorstep photo first.';
    return why;
  };

  if (camera) {
    return (
      <CameraScreen
        p={p}
        onCancel={() => setCamera(false)}
        onCapture={() => {
          dispatch({ type: 'RIDER_PHOTO', parcelId: p.id });
          setCamera(false);
        }}
      />
    );
  }

  const tryOutcome = (o: Outcome) => {
    const why = lockReason(o);
    if (why) {
      // The attempt is refused and logged for review; a pattern of these, not one tap, is what counts.
      dispatch({ type: 'RIDER_OUTCOME', parcelId: p.id, outcome: o });
      setToast({ text: `Blocked and logged for review. ${why}`, bad: true });
      return;
    }
    if (o === 'delivered') {
      dispatch({ type: 'RIDER_OUTCOME', parcelId: p.id, outcome: o });
      dispatch({ type: 'RIDER_SELECT' });
      return;
    }
    setPicking(o);
  };

  const submit = (reason: ReasonCode) => {
    if (!picking) return;
    dispatch({ type: 'RIDER_OUTCOME', parcelId: p.id, outcome: picking, reason });
    setPicking(null);
    dispatch({ type: 'RIDER_SELECT' });
  };

  const policy = tierPolicy(tier.tier);
  const codDue = p.payment === 'COD' ? p.price - (p.codToken ?? 0) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-ink-100 p-4">
        <button className="mb-2 text-xs font-semibold text-brand-700" onClick={() => dispatch({ type: 'RIDER_SELECT' })}>
          ← Route
        </button>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold">{b.name}</div>
            <div className="text-sm text-ink-600">{b.address}</div>
            <div className="mt-1 text-sm font-semibold text-ink-800">📍 {b.landmark}</div>
            {p.deliveryWindow && <div className="mt-1 text-xs font-bold text-brand-600">🕘 Deliver: {p.deliveryWindow}</div>}
            {p.altDelivery && <div className="mt-1 text-xs text-ink-600">If not home: {p.altDelivery}</div>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip tone={p.payment === 'COD' ? 'warn' : 'good'}>{p.payment === 'COD' ? `Collect ${inr(codDue)}` : 'Prepaid'}</Chip>
          {p.codToken ? <Chip tone="good">₹{p.codToken} token paid</Chip> : null}
          <Chip>
            Attempt {p.attemptsMade + 1} of {p.maxAttempts}
          </Chip>
          {p.distanceKm > FAR_KM && <Chip tone="good">+{inr(FAR_BONUS)} far drop</Chip>}
          {policy.selfPickupAfterAttempts && <Chip tone="info">Self-pickup after 2 tries</Chip>}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className={`rounded-lg p-3 ${near ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Distance to door (GPS)</div>
              <div className={`num text-2xl font-extrabold ${near ? 'text-emerald-700' : 'text-amber-700'}`}>{km(d)}</div>
            </div>
            {near ? (
              <Chip tone="good">✓ Within {GPS_RADIUS_M} m</Chip>
            ) : (
              <button className="btn-primary" disabled={walking} onClick={walk}>
                {walking ? 'Riding…' : 'Ride to address'}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-ink-50 p-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Call customer</div>
            <div className="text-sm">{callAt !== undefined ? <span className="font-semibold text-emerald-700">Called at {fmtClock(callAt)} · no answer</span> : b.phone}</div>
          </div>
          <button className="btn-ghost" disabled={dialing || callAt !== undefined} onClick={call}>
            {dialing ? 'Ringing…' : callAt !== undefined ? 'Logged' : '📞 Call'}
          </button>
        </div>

        <div className="rounded-lg bg-ink-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">Doorstep photo</div>
              <div className="text-sm">
                {photo ? (
                  <span className="font-semibold text-emerald-700">Captured {fmtClock(photo.at)} · geotagged</span>
                ) : (
                  <span className="text-ink-600">Needed for “Not home”</span>
                )}
              </div>
            </div>
            <button className="btn-ghost" disabled={!near || !!photo} onClick={() => setCamera(true)} title={near ? undefined : `Camera opens within ${GPS_RADIUS_M} m of the address`}>
              {photo ? 'Saved' : near ? '📷 Open camera' : '📷 Locked'}
            </button>
          </div>
          {photo && (
            <div className="mt-2 overflow-hidden rounded-xl">
              <DoorstepPhoto
                seed={b.id}
                landmark={b.landmark}
                houseNo={houseNo(b.address)}
                stamp={{ lat: photo.lat, lng: photo.lng, distanceM: photo.distanceM, time: fmtClock(photo.at) }}
              />
            </div>
          )}
        </div>

        {picking ? (
          <div className="rounded-lg border border-brand-200 p-3">
            <div className="mb-2 text-sm font-bold">Why? Pick a reason code</div>
            <div className="space-y-1.5">
              {REASONS.filter((r) => r.outcome === picking && r.code !== 'OUT_OF_TIME').map((r) => (
                <button key={r.code} onClick={() => submit(r.code)} className="flex w-full items-center justify-between rounded-xl border border-ink-200 px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50">
                  <span>{r.label}</span>
                  <Chip tone={r.blame === 'buyer' ? 'warn' : 'info'}>{r.blame === 'buyer' ? 'Buyer' : 'Partner'}</Chip>
                </button>
              ))}
            </div>
            <button className="mt-2 text-xs font-semibold text-ink-500" onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {OUTCOMES.map((o) => {
              const locked = lockReason(o.key);
              return (
                <button
                  key={o.key}
                  onClick={() => tryOutcome(o.key)}
                  className={`rounded-lg border p-3 text-left transition ${
                    locked ? 'border-ink-200 bg-ink-100 text-ink-400' : o.key === 'delivered' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-ink-200 bg-white text-ink-800 hover:border-brand-300'
                  }`}
                >
                  <div className="text-lg">{locked ? '🔒' : o.icon}</div>
                  <div className="text-sm font-bold">{o.label}</div>
                  {locked && <div className="mt-0.5 text-[11px] leading-tight">{locked}</div>}
                </button>
              );
            })}
          </div>
        )}

        {!near && !picking && (
          <PinIssue state={pinIssue} setState={setPinIssue} why={pinWhy} setWhy={setPinWhy} called={callAt !== undefined} onCall={call} dialing={dialing} />
        )}

        {toast && (
          <div className={`rounded-lg p-3 text-sm ${toast.bad ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`} onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- wrong pin: an exception, not a failed attempt

const PIN_ISSUES = ['Pin is in the wrong place', 'Building or gate can’t be reached', 'No GPS or network here'];

/**
 * When the saved pin is wrong the rider can never get within 100 m, so the normal
 * outcomes stay locked. This route goes to a supervisor instead: it needs a logged
 * call and a landmark note. It counts as an attempt but isn't held against
 * the buyer until it's reviewed.
 */
function PinIssue({ state, setState, why, setWhy, called, onCall, dialing }: { state: 'closed' | 'open' | 'sent'; setState: (s: 'closed' | 'open' | 'sent') => void; why: string; setWhy: (w: string) => void; called: boolean; onCall: () => void; dialing: boolean }) {
  const [note, setNote] = useState('');
  if (state === 'sent') {
    return (
      <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
        <b>Sent to your supervisor.</b> It counts as an attempt, but isn’t held against the buyer until it’s reviewed. The buyer is asked to fix the pin; you get the corrected address on your next run.
      </div>
    );
  }
  if (state === 'closed') {
    return (
      <button className="w-full rounded-lg border border-dashed border-ink-300 p-2.5 text-left text-sm font-semibold text-brand-700" onClick={() => setState('open')}>
        📍 Pin wrong or can’t get in? Report it
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-brand-200 p-3 text-sm">
      <div className="font-bold">Report a pin problem</div>
      <div className="flex flex-wrap gap-1.5">
        {PIN_ISSUES.map((w) => (
          <button key={w} onClick={() => setWhy(w)} className={`chip border px-2 py-1 text-xs ${why === w ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-ink-200'}`}>
            {w}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-lg bg-ink-50 px-2 py-1.5 text-xs">
        <span>{called ? '✓ Call to the buyer logged' : 'Call the buyer first'}</span>
        {!called && (
          <button className="font-bold text-brand-700" disabled={dialing} onClick={onCall}>
            {dialing ? 'Ringing…' : '📞 Call'}
          </button>
        )}
      </div>
      <input className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs" placeholder="Where is it really? e.g. lane behind the pharmacy" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn-primary w-full py-2 text-sm" disabled={!called || note.trim().length < 4} onClick={() => setState('sent')}>
        Send for review
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- in-app camera

/** "Flat 302, Sai Residency" → "302"; "118, Sector C" → "118". */
const houseNo = (address: string) => address.match(/\d+[A-Z]?/)?.[0] ?? '—';

/**
 * The only way a doorstep photo enters the system. There is deliberately no
 * gallery or upload option, and the stamp is taken from live GPS at capture.
 */
function CameraScreen({ p, onCapture, onCancel }: { p: Parcel; onCapture: () => void; onCancel: () => void }) {
  const { state } = useStore();
  const b = state.world.buyers.find((x) => x.id === p.buyerId)!;
  const gps = toLatLng(state.rider.pos.x, state.rider.pos.y);
  const d = riderDistanceM(state, p);
  const [flash, setFlash] = useState(false);

  const shoot = () => {
    setFlash(true);
    window.setTimeout(onCapture, 220);
  };

  return (
    <div className="relative flex min-h-full flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3 text-xs">
        <button className="font-semibold text-white/80" onClick={onCancel}>
          ✕ Cancel
        </button>
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Valmo in-app camera
        </span>
      </div>
      <div className="px-3">
        <div className="overflow-hidden rounded-xl">
          <DoorstepPhoto seed={b.id} landmark={b.landmark} houseNo={houseNo(b.address)} live stamp={{ ...gps, distanceM: d, time: fmtClock(state.clock) }} />
        </div>
        <div className="mt-3 space-y-1 text-center text-xs text-white/70">
          <div>Frame the door and house number of {b.name.split(' ')[0]}’s address.</div>
          <div className="font-semibold text-emerald-400">
            GPS lock · {d} m from address · stamped at capture
          </div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between px-8 pb-8 pt-6">
        <div className="w-16 text-center text-[10px] leading-tight text-white/50">
          Gallery
          <br />
          disabled
        </div>
        <button onClick={shoot} className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white p-1" aria-label="Capture doorstep photo">
          <span className="block h-14 w-14 rounded-full bg-white transition active:scale-90" />
        </button>
        <div className="w-16" />
      </div>
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/90" />}
    </div>
  );
}