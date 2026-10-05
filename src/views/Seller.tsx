import { useState } from 'react';
import { FLOOR_BAND, sellerOutlook } from '../model';
import { CATALOGUE, PERSONAS, reasonInfo, type Parcel } from '../seed';
import { fmtClock, kiranaOf, useStore, type State } from '../store';
import { Card, Chip, DoorstepPhoto, PhoneFrame, Stat, inr, pct } from '../ui';

const SELLER_ID = 'S1';
const RETURN_DAYS_TODAY = 21; // deck: "Returned — stock back in ~3 weeks"
const TYPICAL_PRICE = 299; // a typical pair in her catalogue
const FAILED: Parcel['status'][] = ['in_queue', 'flash', 'held', 'sold', 'resold_delivered', 'returning', 'retry'];
const SARA_TYPES = ['Sandals', 'Sneakers', 'Kolhapuri'];

const emojiFor = (title: string) => CATALOGUE.find((c) => c.title === title)?.emoji ?? '📦';

function saraRtos(s: State) {
  return s.world.parcels
    .filter((p) => p.sellerId === SELLER_ID && FAILED.includes(p.status))
    .sort((a, b) => (b.refusedAt ?? 0) - (a.refusedAt ?? 0));
}

const unlockedOf = (rtos: Parcel[]) => rtos.reduce((t, p) => t + (p.sellerPayout?.amount ?? 0), 0);

/**
 * Sara's seller app: one screen, top to bottom. What needs her, what came back
 * and why, her money, and the one setting that matters (her resale floor).
 */
export default function Seller() {
  const { state } = useStore();
  const seller = state.world.sellers.find((s) => s.id === SELLER_ID)!;
  const openDeals = state.world.deals.filter((d) => d.sellerId === SELLER_ID && d.status === 'open');
  const rtos = saraRtos(state);
  const coming = rtos.filter((p) => p.status === 'returning').length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <PhoneFrame
        title={
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs opacity-80">Supplier Hub · Returns</div>
              <div className="text-lg font-bold">{seller.shop}</div>
            </div>
            <div className="text-right text-xs opacity-80">
              {seller.name}
              <br />
              {seller.city}
            </div>
          </div>
        }
      >
        <div className="space-y-4 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-emerald-50 p-2">
              <div className="num text-lg font-extrabold text-emerald-700">{inr(unlockedOf(rtos))}</div>
              <div className="text-[10px] font-bold text-emerald-800">paid to you</div>
            </div>
            <div className="rounded-lg bg-ink-50 p-2">
              <div className="num text-lg font-extrabold">{rtos.length}</div>
              <div className="text-[10px] font-bold text-ink-600">returns, all explained</div>
            </div>
            <div className="rounded-lg bg-ink-50 p-2">
              <div className="num text-lg font-extrabold">{coming}</div>
              <div className="text-[10px] font-bold text-ink-600">coming back</div>
            </div>
          </div>

          {openDeals.map((d) => (
            <DealCard key={d.id} dealId={d.id} />
          ))}

          <FloorCard />

          <section>
            <div className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-600">What came back, and why</div>
            <ul className="space-y-2">
              {rtos.map((p) => (
                <ReturnRow key={p.id} p={p} />
              ))}
            </ul>
          </section>

          <ResaleSettings />
        </div>
      </PhoneFrame>

      <div className="min-w-0 space-y-5">
        <WhatSaraSees />
        <FloorBothSides />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- phone pieces

function DealCard({ dealId }: { dealId: string }) {
  const { state, dispatch } = useStore();
  const d = state.world.deals.find((x) => x.id === dealId)!;
  const p = state.world.parcels.find((x) => x.id === d.parcelId)!;
  const seller = state.world.sellers.find((s) => s.id === d.sellerId)!;
  const offer = Math.max(d.price - state.assumptions.platformFee, 0); // her price less her floor, less the usual shipping charge
  return (
    <section className="rounded-lg border-2 border-brand-300 bg-brand-50 p-3">
      <Chip tone="brand">Needs your OK</Chip>
      <div className="mt-2 text-sm font-bold leading-snug text-ink-800">{p.title} was refused today</div>
      <p className="mt-1 text-xs text-ink-600">
        Meesho will buy it for {inr(offer)} ({pct(seller.floor)} off, your agreed maximum). Once you accept, Meesho handles the rest.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="rounded-lg border border-emerald-300 bg-white p-2.5 text-left transition hover:border-emerald-500" onClick={() => dispatch({ type: 'DEAL_RESPOND', dealId: d.id, accept: true })}>
          <div className="text-xs font-bold text-emerald-700">Sell to Meesho</div>
          <div className="num text-xl font-extrabold">{inr(offer)}</div>
          <div className="text-[11px] text-ink-600">paid within 2 days</div>
        </button>
        <button className="rounded-lg border border-ink-200 bg-white p-2.5 text-left transition hover:border-ink-400" onClick={() => dispatch({ type: 'DEAL_RESPOND', dealId: d.id, accept: false })}>
          <div className="text-xs font-bold text-ink-800">Take it back</div>
          <div className="num text-xl font-extrabold">~6 days</div>
          <div className="text-[11px] text-ink-600">to reach {seller.city}</div>
        </button>
      </div>
    </section>
  );
}

/** Her resale floor, and the one-line back-and-forth with Meesho when she changes it. */
function FloorCard() {
  const { state, dispatch } = useStore();
  const seller = state.world.sellers.find((s) => s.id === SELLER_ID)!;
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState(seller.floor);
  const thread = state.world.threads[SELLER_ID] ?? [];
  const last = thread[thread.length - 1];
  const counter = last && last.from === 'meesho' && last.kind === 'counter' ? last : null;
  const reply = last && last.from === 'meesho' ? last : null;
  return (
    <section className="rounded-lg border border-ink-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-ink-800">Meesho buys refused parcels from you</div>
          <div className="text-xs text-ink-600">Never for more than this off your price</div>
        </div>
        <div className="text-right">
          <div className="num text-2xl font-extrabold text-brand-600">{pct(seller.floor)}</div>
          <div className="text-[10px] font-bold text-ink-600">max discount</div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold">New floor</span>
            <span className="num font-extrabold">{pct(proposal)}</span>
          </div>
          <input type="range" className="w-full" min={FLOOR_BAND.min} max={FLOOR_BAND.max} step={0.01} value={proposal} onChange={(e) => setProposal(Number(e.target.value))} aria-label="New resale floor" />
          <div className="text-xs text-ink-600">
            On a {inr(TYPICAL_PRICE)} pair, Meesho would pay you {inr(Math.round(TYPICAL_PRICE * (1 - (editing ? proposal : seller.floor))) - state.assumptions.platformFee)} within 2 days.
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={Math.abs(proposal - seller.floor) < 1e-9}
              onClick={() => {
                dispatch({ type: 'PRICE_PROPOSE', sellerId: SELLER_ID, floor: proposal });
                setEditing(false);
              }}
            >
              Send to Meesho
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-ink-600">Applies to every refused parcel</div>
          <button
            className="text-xs font-bold text-brand-600"
            onClick={() => {
              setProposal(seller.floor);
              setEditing(true);
            }}
          >
            Change
          </button>
        </div>
      )}

      {reply && !editing && (
        <div className={`mt-2 rounded-lg p-2 text-xs ${reply.kind === 'accept' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          <b>Meesho:</b> {reply.text}
          {counter && (
            <button className="btn-primary mt-2 w-full" onClick={() => dispatch({ type: 'PRICE_ACCEPT', sellerId: SELLER_ID })}>
              OK, make it {pct(counter.floor!)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function statusOf(p: Parcel, clock: number) {
  if (p.sellerPayout) {
    const done = p.sellerPayout.at <= clock;
    return { tone: 'good' as const, text: done ? `Sold nearby · ${inr(p.sellerPayout.amount)} paid` : `Sold nearby · ${inr(p.sellerPayout.amount)} in 2 days` };
  }
  if (p.status === 'returning') return { tone: 'ink' as const, text: `Coming back · ~${RETURN_DAYS_TODAY} days` };
  if (p.status === 'flash') return { tone: 'brand' as const, text: 'On sale near the buyer' };
  if (p.status === 'held') return { tone: 'info' as const, text: `Waiting at ${p.kiranaId ? kiranaOf(p.kiranaId).name : 'a kirana'}` };
  return { tone: 'warn' as const, text: 'Being listed' };
}

function ReturnRow({ p }: { p: Parcel }) {
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const logs = state.world.logs.filter((l) => l.parcelId === p.id && l.reason);
  const log = logs[0];
  const info = log?.reason ? reasonInfo(log.reason) : null;
  const buyer = state.world.buyers.find((b) => b.id === p.buyerId)!;
  const st = statusOf(p, state.clock);
  const photoLog = logs.find((l) => l.photo);
  return (
    <li className="rounded-lg border border-ink-200 p-3">
      <div className="flex items-start gap-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink-50 text-2xl">{emojiFor(p.title)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink-800">{p.title}</div>
          <div className="text-xs text-ink-600">{info ? `“${info.label}”` : 'Reason being logged'}</div>
        </div>
        <span className="num shrink-0 text-sm font-bold">{inr(p.price)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone={st.tone}>{st.text}</Chip>
        {info && <Chip tone={info.blame === 'buyer' ? 'warn' : 'info'}>{info.blame === 'buyer' ? 'Buyer’s choice' : 'Courier’s fault'}</Chip>}
        {log && (
          <button className="ml-auto text-[11px] font-bold text-brand-600" onClick={() => setOpen(!open)}>
            {open ? 'Hide proof' : 'Proof'}
          </button>
        )}
      </div>
      {open && log && (
        <div className="mt-2 space-y-2 rounded-lg bg-ink-50 p-2 text-[11px] text-ink-600">
          {photoLog?.photo && (
            <DoorstepPhoto
              seed={buyer.id}
              landmark={buyer.landmark}
              houseNo={buyer.address.match(/\d+[A-Z]?/)?.[0] ?? '—'}
              stamp={{ lat: photoLog.photo.lat, lng: photoLog.photo.lng, distanceM: photoLog.photo.distanceM, time: fmtClock(photoLog.photo.at) }}
              className="rounded-md"
            />
          )}
          {logs.map((l) => (
            <div key={l.id}>
              {fmtClock(l.at)} · rider {l.gpsDistanceM} m from the door ✓{l.callAt !== undefined ? ' · called ✓' : ''}
              {l.photo ? ' · photo ✓' : ''}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function ResaleSettings() {
  const { state, dispatch } = useStore();
  const seller = state.world.sellers.find((s) => s.id === SELLER_ID)!;
  const toggle = (t: string) =>
    dispatch({
      type: 'SELLER_UPDATE',
      sellerId: SELLER_ID,
      patch: { exclusions: seller.exclusions.includes(t) ? seller.exclusions.filter((x) => x !== t) : [...seller.exclusions, t] },
    });
  return (
    <section className="rounded-lg bg-ink-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold">Resell near the buyer</div>
        <button
          role="switch"
          aria-checked={seller.optIn}
          aria-label="Resell refused parcels near the buyer"
          onClick={() => dispatch({ type: 'SELLER_UPDATE', sellerId: SELLER_ID, patch: { optIn: !seller.optIn } })}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${seller.optIn ? 'bg-brand-600' : 'bg-ink-300'}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${seller.optIn ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
      <div className="mt-1 text-xs text-ink-600">{seller.optIn ? 'Tap a product type to always get it back instead:' : 'Off: every refused parcel is shipped back to you.'}</div>
      {seller.optIn && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SARA_TYPES.map((t) => {
            const on = seller.exclusions.includes(t);
            return (
              <button key={t} onClick={() => toggle(t)} className={`chip border px-3 py-1 text-xs ${on ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-ink-200 bg-white text-ink-600'}`}>
                {on ? '↩ ' : ''}
                {t}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- right-hand panels

function WhatSaraSees() {
  const { state } = useStore();
  const seller = state.world.sellers.find((s) => s.id === SELLER_ID)!;
  const rtos = saraRtos(state);
  const before = ['Her panel shows the RTO count, never the reason', 'Capital locked for the full round trip', 'Stock comes back damaged or goes missing', 'Nothing to do but wait'];
  const now = ['Every return has a reason, who caused it, and proof', 'Resold near the buyer, she’s paid in 2 days', 'Unopened parcels never travel back to Agra', 'She sets her floor once, and okays exceptions'];
  return (
    <Card title="What Sara sees now" sub={`${PERSONAS.sara.age} · ${PERSONAS.sara.role}. One screen: what needs her, what came back and why, her money.`}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Returns, each with a reason" value={rtos.length} />
        <Stat tone="good" label="Paid to her" value={inr(unlockedOf(rtos))} />
        <Stat label="Days to cash" value="2" sub={`vs ~${RETURN_DAYS_TODAY} for stock back`} />
        <Stat tone="brand" label="Her resale floor" value={pct(seller.floor)} sub="max discount" />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <div className="label mb-2">Before</div>
          <ul className="space-y-1.5 text-sm text-ink-600">
            {before.map((t) => (
              <li key={t}>✕ {t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="label mb-2 text-emerald-700">Now</div>
          <ul className="space-y-1.5 text-sm text-ink-800">
            {now.map((t) => (
              <li key={t}>✓ {t}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function FloorBothSides() {
  const { state } = useStore();
  const rows = [0.1, 0.15, 0.2].map((f) => ({ f, o: sellerOutlook(state.assumptions, TYPICAL_PRICE, f) }));
  return (
    <Card title="Choosing a floor" sub={`What a refused ${inr(TYPICAL_PRICE)} pair is worth at each floor. Sellers told us 10–20% off is acceptable.`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-600">
            <th className="pb-2 font-bold">Max discount</th>
            <th className="pb-2 text-right font-bold">Sells nearby</th>
            <th className="pb-2 text-right font-bold">Sara gets</th>
            <th className="pb-2 text-right font-bold">Comes back</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ f, o }) => (
            <tr key={f} className="border-t border-ink-200">
              <td className="py-2 font-bold">{pct(f)}</td>
              <td className="num py-2 text-right">{pct(o.pSell)}</td>
              <td className="num py-2 text-right">{inr(o.payoutIfSold)}</td>
              <td className="num py-2 text-right">{pct(o.pBack)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-600">A deeper floor sells faster, so less comes back; she earns a little less per sale. “Sara gets” is after the usual ₹{state.assumptions.platformFee} fee per order.</p>
    </Card>
  );
}
