/**
 * How Meesho agrees a price with the seller for a refused parcel, step by step:
 * estimate her margin → offer a price → she sells the parcel to Meesho or takes it
 * back. Once Meesho owns it, everything after is Meesho's: the 24h flash sale in the
 * same pincode, then kirana, city and India. It never goes back to the seller.
 */
import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULTS, DEMAND_DEFAULTS, PICKUP_DISCOUNT, WIDEN, ownershipPlan, type MarginBand } from '../model';
import { CATALOGUE, LISTING_SIGNALS, type Product } from '../seed';
import { Card, Chip, inr, pct } from '../ui';

const PICKS = [CATALOGUE[4], CATALOGUE[9], CATALOGUE[1], CATALOGUE[6]]; // jhumka, kurti, sneakers, kundan choker
const KEYS = ['jhumka', 'kurti', 'sneakers', 'choker']; // ?item= in the URL (the guided demo links here)
const BAND_LABEL: Record<MarginBand, string> = { low: 'Low margin', medium: 'Medium margin', high: 'High margin' };

function plan(p: Product, discount?: number) {
  const s = LISTING_SIGNALS[p.title];
  return ownershipPlan(DEFAULTS, p.price, { category: p.category, ...s }, { ...DEMAND_DEFAULTS, shoppersPerDay: s.shoppersPerDay }, discount);
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}₹${Math.round(Math.abs(n))}`;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">{n}</span>
        <h2 className="text-base font-extrabold text-ink-800">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-2 text-sm">{children}</div>
    </section>
  );
}

function Calc({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'brand' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'brand' ? 'text-brand-700' : '';
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'border-t-2 border-ink-800 pt-1.5 font-extrabold' : ''}`}>
      <span className="text-ink-700">{label}</span>
      <span className={`num shrink-0 ${color}`}>{value}</span>
    </div>
  );
}

export default function Pricing() {
  const [params] = useSearchParams();
  const fromUrl = () => ({ product: PICKS[Math.max(0, KEYS.indexOf(params.get('item') ?? ''))] });
  const [product, setProduct] = useState<Product>(() => fromUrl().product);
  const [shown, setShown] = useState(product.title);
  const [urlSeen, setUrlSeen] = useState(params.toString());
  if (urlSeen !== params.toString()) {
    // A new link (e.g. the next demo step) opens a different parcel.
    const next = fromUrl();
    setUrlSeen(params.toString());
    setProduct(next.product);
    setShown(next.product.title);
  } else if (shown !== product.title) {
    setShown(product.title);
  }
  const o = plan(product);
  const sig = LISTING_SIGNALS[product.title];

  return (
    <div className="space-y-5">
      <Card
        title="How Meesho agrees a price with the seller"
        sub="A buyer has refused a parcel. Meesho offers to buy it from the seller at an agreed price, paid within 2 days. Once it is Meesho’s, it is sold to a neighbour at full price or further afield, and never goes back."
      >
        <div className="flex flex-wrap gap-2">
          {PICKS.map((p) => (
            <button
              key={p.title}
              onClick={() => setProduct(p)}
              className={`chip border px-3 py-1.5 text-sm ${product.title === p.title ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-700 hover:border-brand-300'}`}
            >
              {p.emoji} {p.title.split(',')[0]} · {inr(p.price)}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Step n={1} title="Guess the seller’s margin">
          {sig.wholesale !== undefined && (
            <div className="rounded-lg bg-ink-50 p-2.5">
              <div className="text-xs text-ink-600">Same item found wholesale (photo match)</div>
              <div className="font-bold">
                {inr(sig.wholesale)} <span className="font-normal text-ink-600">vs the seller’s {inr(product.price)}</span>
              </div>
            </div>
          )}
          <ul className="space-y-1 text-ink-700">
            <li>• {sig.sellerType === 'manufacturer' ? 'Makes it herself' : 'Buys it to resell'}</li>
            <li>• Has run discounts up to {pct(sig.pastMaxDiscount)}</li>
            <li>• Priced {sig.priceVsPeers >= 1 ? `${pct(sig.priceVsPeers - 1)} above` : `${pct(1 - sig.priceVsPeers)} below`} similar listings</li>
          </ul>
          <div className="mt-auto rounded-lg bg-brand-50 p-3 text-center">
            <div className="text-xs font-bold text-brand-700">Estimated margin</div>
            <div className="num text-3xl font-extrabold text-brand-700">{pct(o.margin.margin)}</div>
            <Chip tone={o.margin.band === 'high' ? 'good' : o.margin.band === 'medium' ? 'info' : 'warn'}>{BAND_LABEL[o.margin.band]}</Chip>
          </div>
        </Step>

        <Step n={2} title="Suggest a price">
          <div className="text-ink-700">
            {BAND_LABEL[o.margin.band]}, so Meesho asks for <b>{pct(o.d)} off</b>.
          </div>
          <Calc label="Her price" value={inr(product.price)} />
          <Calc label={`${pct(o.d)} off`} value={`−${inr(Math.round(product.price * o.d))}`} />
          <Calc label="Usual shipping charge" value={`−${inr(o.fee)}`} />
          <Calc strong label="Meesho offers" value={inr(o.sellerNow)} tone="brand" />
          <div className="mt-auto space-y-1 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-900">
            <div>✓ Within what her margin allows</div>
            <div>✓ More than it’s worth to the seller back ({inr(Math.round(o.sellerWalkAway))} in ~2 months)</div>
          </div>
          <div className="rounded-lg bg-ink-50 p-2.5 text-xs text-ink-700">
            {o.zeroOffer ? (
              <>
                <b>If the seller declines:</b> {pct(o.flash)} are expected to sell within 24 hours, so Meesho asks once more at 0% off ({inr(o.sellerIfFlash)}).
              </>
            ) : (
              <>
                <b>If the seller declines:</b> it goes back. Only {pct(o.flash)} are expected to sell within 24 hours, too few for a 0% offer.
              </>
            )}
          </div>
        </Step>

        <Step n={3} title="The seller sells it to Meesho">
          <SellerPhone product={product} o={o} />
        </Step>

        <Step n={4} title="Sell it at full price">
          <div className="text-ink-700">
            Offered to buyers in the same pincode for 24 hours at the full <b>{inr(product.price)}</b>. {pct(o.flash)} sell in that time.
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-amber-50 p-2">
              <b>⚡ Delivered in 3 hours</b>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2">
              <b>🏪 ₹{PICKUP_DISCOUNT} off</b> at the kirana
            </div>
          </div>
          <div className="font-bold text-ink-800">If a neighbour buys it today</div>
          <Calc label="Neighbour pays" value={inr(product.price)} />
          <Calc label="Meesho paid the seller" value={`−${inr(o.sellerNow)}`} />
          <Calc strong label="Meesho keeps" value={inr(product.price - o.sellerNow)} tone="good" />
          <div className="font-bold text-ink-800">If not</div>
          <div className="text-ink-700">Meesho keeps selling it further afield (step 5). The seller was already paid.</div>
          <div className="mt-auto rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">Either way, no ₹29 trip back to the seller.</div>
        </Step>
      </div>

      <WidenCircle o={o} />
      <Compare o={o} name={product.title.split(',')[0]} />
      <Catalogue />
    </div>
  );
}

// ---------------------------------------------------------------- the seller's phone

function SellerPhone({ product, o }: { product: Product; o: ReturnType<typeof plan> }) {
  const [state, setState] = useState<'offer' | 'second' | 'done' | 'doneZero' | 'back'>('offer');
  const [stateFor, setStateFor] = useState(product.title);
  if (stateFor !== product.title) {
    setStateFor(product.title);
    setState('offer');
  }
  const name = product.title.split(',')[0];
  const outcome = (title: string, big: string, sub: string) => (
    <div className="w-full rounded-lg border-2 border-brand-400 bg-brand-50 p-2 text-left">
      <div className="font-bold text-ink-800">{title}</div>
      <div className="num text-lg font-extrabold">{big}</div>
      <div className="text-[11px] text-ink-600">{sub}</div>
    </div>
  );
  const reset = (
    <button className="mt-1 block font-bold text-brand-600" onClick={() => setState('offer')}>
      Reset
    </button>
  );
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-[1.4rem] border-[7px] border-ink-900 bg-white">
      <div className="bg-brand-900 px-3 py-1.5 text-white">
        <div className="text-[10px] opacity-80">Supplier Hub · Returns</div>
        <div className="text-xs font-bold">{name} was refused</div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5 text-xs">
        {state === 'done' || state === 'doneZero' ? (
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-900">
            <b>Sold to Meesho for {inr(state === 'done' ? o.sellerNow : o.sellerIfFlash)}. Paid within 2 days; nothing more for you to do.</b>
            {reset}
          </div>
        ) : state === 'back' ? (
          <div className="rounded-lg bg-ink-50 p-2 text-ink-700">
            <b>Coming back to you</b> in about 3 weeks.
            {reset}
          </div>
        ) : state === 'second' ? (
          <>
            <div className="font-bold text-ink-800">Meesho’s second offer:</div>
            {outcome('Sell it at 0% off', inr(o.sellerIfFlash), 'Your full price less the usual shipping charge. Paid within 2 days.')}
            <div className="text-[11px] text-ink-600">Offered because this item is expected to sell fast.</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button className="btn-primary px-1 py-1.5 text-xs" onClick={() => setState('doneZero')}>
                Accept
              </button>
              <button className="btn-ghost px-1 py-1.5 text-xs" onClick={() => setState('back')}>
                Take it back
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="font-bold text-ink-800">Meesho’s offer for this parcel:</div>
            {outcome('Sell it to Meesho', inr(o.sellerNow), 'Paid within 2 days. Meesho takes it from here; it never comes back.')}
            <div className="text-[11px] text-ink-600">Or decline: {o.zeroOffer ? 'Meesho may make one more offer' : 'the parcel is returned to you as today'}.</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button className="btn-primary px-1 py-1.5 text-xs" onClick={() => setState('done')}>
                Accept
              </button>
              <button className="btn-ghost px-1 py-1.5 text-xs" onClick={() => setState(o.zeroOffer ? 'second' : 'back')}>
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- step 5: widen the circle

function WidenCircle({ o }: { o: ReturnType<typeof plan> }) {
  const tiles = [
    { title: 'Flash sale, same pincode', when: 'First 24 hours', off: 'Full price', share: o.flash, tone: 'bg-emerald-50 border-emerald-300' },
    ...o.stages.map((s) => ({
      title: s.label,
      when: s.when,
      off: s.key === 'bulk' ? `${pct(1 - s.discount)} of price` : s.key === 'kirana' ? `${pct(WIDEN.kirana.weeks[0])}–${pct(s.discount)} off` : `${pct(s.discount)} off`,
      share: s.share,
      tone: s.key === 'bulk' ? 'bg-ink-50 border-ink-200' : 'bg-sky-50 border-sky-200',
    })),
  ];
  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">5</span>
        <h2 className="text-base font-extrabold text-ink-800">If it doesn’t sell: widen the circle, never send it back</h2>
      </div>
      <p className="mb-3 text-sm text-ink-600">Meesho owns the parcel now, so the trip back is gone for good. Each step reaches more buyers.</p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <div key={t.title} className={`relative rounded-xl border-2 p-3 ${t.tone}`}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{t.when}</div>
            <div className="text-sm font-extrabold text-ink-800">{t.title}</div>
            <div className="text-xs text-ink-600">{t.off}</div>
            <div className="num mt-2 text-2xl font-extrabold text-ink-800">{pct(t.share)}</div>
            <div className="text-[11px] text-ink-500">of refused parcels sell here</div>
            {i < tiles.length - 1 && <span className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-lg text-ink-400 lg:block">→</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500">
        City and India steps assume 60% sell a week (next-day delivery in the city; a normal listing that ships in a day, with Meesho paying the usual shipping). To be measured in the pilot.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- which deal is best

function Compare({ o, name }: { o: ReturnType<typeof plan>; name: string }) {
  const rows: { label: string; sub: string; meesho: number; sara: string; tone: string }[] = [
    { label: 'Today: send it back', sub: 'Meesho pays the trip back', meesho: o.meesho.today, sara: 'Parcel back in ~3 weeks', tone: 'bg-rose-500' },
    { label: 'Meesho buys it', sub: 'Our model: bought before the flash sale', meesho: o.meesho.buyBefore, sara: `${inr(o.sellerNow)} within 2 days`, tone: 'bg-brand-600' },
  ];
  const max = Math.max(...rows.map((r) => Math.abs(r.meesho)));
  return (
    <Card title="Which deal is best?" sub={`Meesho’s result per refused ${name.toLowerCase()}, from the moment the buyer refuses. Buying it beats sending it back.`}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[180px_minmax(0,1fr)_170px] items-center gap-3 text-sm">
            <div>
              <div className="font-bold text-ink-800">{r.label}</div>
              <div className="text-[11px] text-ink-500">{r.sub}</div>
            </div>
            <div className="relative h-7">
              <div className="absolute left-1/2 top-0 h-full w-px bg-ink-300" />
              <div
                className={`absolute top-1 h-5 rounded ${r.tone}`}
                style={r.meesho >= 0 ? { left: '50%', width: `${(r.meesho / max) * 45}%` } : { right: '50%', width: `${(-r.meesho / max) * 45}%` }}
              />
              <div
                className={`num absolute top-1 text-xs font-extrabold ${r.meesho >= 0 ? 'text-ink-800' : 'text-rose-700'}`}
                style={r.meesho >= 0 ? { left: `calc(50% + ${(r.meesho / max) * 45}% + 6px)` } : { right: `calc(50% + ${(-r.meesho / max) * 45}% + 6px)` }}
              >
                {signed(r.meesho)}
              </div>
            </div>
            <div className="text-xs text-ink-700">
              <span className="text-ink-500">Sara: </span>
              {r.sara}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Catalogue() {
  const rows = CATALOGUE.map((p) => ({ p, o: plan(p) })).sort((x, y) => y.o.flash - x.o.flash);
  return (
    <Card title="Across the catalogue" sub="Meesho’s result per refused parcel, from the moment the buyer refuses.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-600">
              <th className="pb-2 font-bold">Item</th>
              <th className="pb-2 text-right font-bold">Price</th>
              <th className="pb-2 text-right font-bold">Her margin</th>
              <th className="pb-2 text-right font-bold">Sells in 24h</th>
              <th className="pb-2 text-right font-bold">Meesho pays her</th>
              <th className="pb-2 text-right font-bold">Send back</th>
              <th className="pb-2 text-right font-bold">Meesho buys it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, o }) => (
              <tr key={p.title} className="border-t border-ink-200">
                <td className="py-2">
                  {p.emoji} {p.title.split(',')[0]}
                </td>
                <td className="num py-2 text-right">{inr(p.price)}</td>
                <td className="num py-2 text-right">
                  {pct(o.margin.margin)} <span className="text-xs text-ink-500">{o.margin.band}</span>
                </td>
                <td className="num py-2 text-right">{pct(o.flash)}</td>
                <td className="num py-2 text-right">
                  {inr(o.sellerNow)} <span className="text-xs text-ink-500">−{pct(o.d)}</span>
                </td>
                <td className="num py-2 text-right text-rose-700">{signed(o.meesho.today)}</td>
                <td className="num py-2 text-right font-bold text-emerald-700">{signed(o.meesho.buyBefore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-600">Per refused parcel, counted from the refusal, after delivery, the ₹5 pickup discount, seal check and support. The ₹47 is the usual shipping charge on the new order (illustrative). Margin signals and demand per item are illustrative.</p>
    </Card>
  );
}
