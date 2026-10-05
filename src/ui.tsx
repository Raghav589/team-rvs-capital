/** Shared formatting and UI pieces: ₹ in Indian format, cards, phone frame, pincode map. */
import type { ReactNode } from 'react';
import type { Tier } from './model';
import { HUBS, KIRANAS, PINCODES, type Parcel, type ParcelStatus } from './seed';

// ---------------------------------------------------------------- formatting

const nf = (dp: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** ₹2,33,860 · ₹43.50 */
export const inr = (n: number, dp = 0) => `${n < 0 ? '−' : ''}₹${nf(dp).format(Math.abs(n))}`;
/** +₹106 / −₹24 */
export const inrSigned = (n: number, dp = 0) => `${n >= 0 ? '+' : '−'}₹${nf(dp).format(Math.abs(n))}`;
/** ₹1,607 Cr */
export const cr = (n: number, dp = 0) => `${inr(n, dp)} Cr`;
export const crSigned = (n: number, dp = 0) => `${inrSigned(n, dp)} Cr`;
export const num = (n: number, dp = 0) => nf(dp).format(n);
export const pct = (n: number, dp = 0) => `${nf(dp).format(n * 100)}%`;
export const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// ---------------------------------------------------------------- primitives

export function Card({ title, sub, right, children, className = '' }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[17px] font-extrabold text-ink-800">{title}</h2>}
            {sub && <p className="mt-0.5 text-sm text-ink-600">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'default', big = false }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'brand' | 'good' | 'bad'; big?: boolean }) {
  const color = { default: 'text-ink-900', brand: 'text-brand-700', good: 'text-emerald-700', bad: 'text-rose-700' }[tone];
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`num mt-1 font-extrabold tracking-tight ${color} ${big ? 'text-4xl' : 'text-2xl'}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
    </div>
  );
}

export function Chip({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'brand' | 'good' | 'bad' | 'warn' | 'info' }) {
  const c = {
    ink: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-100 text-brand-800',
    good: 'bg-emerald-100 text-emerald-800',
    bad: 'bg-rose-100 text-rose-800',
    warn: 'bg-amber-100 text-amber-800',
    info: 'bg-sky-100 text-sky-800',
  }[tone];
  return <span className={`chip ${c}`}>{children}</span>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  const tone = tier === 1 ? 'good' : tier === 2 ? 'warn' : 'bad';
  return <Chip tone={tone}>Tier {tier}</Chip>;
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-ink-200 bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md font-bold transition ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} ${
            value === o.value ? 'bg-brand-100 text-brand-600' : 'text-ink-600 hover:text-brand-600'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- phone frame

/**
 * accent 'brand' = a coloured app bar (rider app). 'shop' = the white shopping-app
 * header with wordmark and search, like Meesho's own app.
 */
export function PhoneFrame({ children, title, accent = 'brand' }: { children: ReactNode; title?: ReactNode; accent?: 'brand' | 'ink' | 'shop' }) {
  const bar = accent === 'brand' ? 'bg-brand-900 text-white' : accent === 'ink' ? 'bg-ink-900 text-white' : 'bg-white text-ink-800';
  return (
    <div className="mx-auto w-full min-w-0 max-w-[390px]">
      <div className="overflow-hidden rounded-[2.2rem] border-[10px] border-ink-900 bg-white shadow-2xl">
        <div className={`flex items-center justify-between px-5 pb-2 pt-2 text-[11px] font-bold ${bar}`}>
          <span>10:42</span>
          <span className="h-4 w-20 rounded-full bg-ink-900" />
          <span>4G ▮▮▮</span>
        </div>
        {accent === 'shop' ? (
          <div className="border-b border-ink-200 bg-white px-4 pb-3 pt-1">
            <div className="flex items-center justify-between">
              <Wordmark className="text-[26px]" />
              <div className="flex items-center gap-4 text-lg text-ink-800">
                <span aria-hidden>♡</span>
                <span aria-hidden>🛒</span>
              </div>
            </div>
            {title}
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-400">
              <span aria-hidden>🔍</span> Search by keyword or product ID
            </div>
          </div>
        ) : (
          title && <div className={`px-4 pb-3 pt-1 ${bar}`}>{title}</div>
        )}
        <div className="h-[680px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- meesho.com pieces

/** Lowercase wordmark set in the site's deep purple. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`select-none font-extrabold lowercase leading-none tracking-[-0.03em] text-brand-900 ${className}`}>meesho</span>;
}

/** The "7 Days Easy Return · Cash on Delivery · Lowest Prices" strip. */
export function TrustStrip({ items = ['7 Days Easy Return', 'Cash on Delivery', 'Lowest Prices'] }: { items?: string[] }) {
  const icons = ['↩️', '💵', '🏷️'];
  return (
    <div className="flex items-center justify-around gap-2 rounded-lg border border-brand-100 bg-brand-50 px-2 py-2 text-[11px] font-bold text-ink-800">
      {items.map((t, i) => (
        <span key={t} className="flex items-center gap-1">
          <span aria-hidden>{icons[i] ?? '✓'}</span>
          {t}
        </span>
      ))}
    </div>
  );
}

export function RatingPill({ rating }: { rating: number }) {
  return (
    <span className="rating-pill">
      {rating.toFixed(1)} <span aria-hidden>★</span>
    </span>
  );
}

/** A deterministic rating and review count per title, so listings look alive but never change. */
export function ratingFor(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { rating: 3.8 + (h % 8) / 10, reviews: 300 + (h % 4700) };
}

// ---------------------------------------------------------------- doorstep photo

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const WALLS = ['#f3e3c3', '#e8d5e0', '#d9e6ef', '#efe0cf', '#e3ecd9', '#f1d9c9'];
const GATE_WORDS: [RegExp, string][] = [
  [/green/i, '#2f7d4f'],
  [/blue/i, '#2f5d9a'],
  [/yellow/i, '#d4a017'],
  [/red/i, '#a8322d'],
];

/**
 * A rider's doorstep photo. The stamp is burned into the image, the way
 * GPS-camera apps do it, so a cropped screenshot still carries its proof.
 */
export function DoorstepPhoto({
  seed,
  landmark,
  houseNo,
  stamp,
  live = false,
  className = '',
}: {
  seed: string;
  landmark: string;
  houseNo: string;
  stamp?: { lat: number; lng: number; time: string; distanceM: number };
  live?: boolean;
  className?: string;
}) {
  const h = hash(seed);
  const wall = WALLS[h % WALLS.length];
  const gate = GATE_WORDS.find(([re]) => re.test(landmark))?.[1] ?? '#6b4f3a';
  const twoStorey = h % 3 !== 0;
  return (
    <svg viewBox="0 0 320 240" className={`block w-full ${className}`} role="img" aria-label={`Doorstep photo, ${landmark}`}>
      <rect width="320" height="240" fill="#bcd6e8" />
      <rect y="170" width="320" height="70" fill="#9b958c" />
      <rect x="40" y={twoStorey ? 40 : 80} width="240" height={twoStorey ? 140 : 100} fill={wall} stroke="#00000022" />
      {twoStorey && (
        <>
          <rect x="70" y="58" width="44" height="34" fill="#4b5563" opacity=".8" />
          <rect x="206" y="58" width="44" height="34" fill="#4b5563" opacity=".8" />
          <rect x="40" y="104" width="240" height="6" fill="#00000018" />
        </>
      )}
      <rect x="140" y="118" width="40" height="62" fill="#5b4636" />
      <circle cx="173" cy="150" r="2" fill="#e5c07b" />
      <rect x="70" y="124" width="40" height="30" fill="#4b5563" opacity=".75" />
      <rect x="210" y="124" width="40" height="30" fill="#4b5563" opacity=".75" />
      <rect x="186" y="122" width="22" height="12" rx="2" fill="#fff" stroke="#00000033" />
      <text x="197" y="131" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1f2937">
        {houseNo}
      </text>
      {/* gate */}
      <g stroke={gate} strokeWidth="3">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={112 + i * 12} y1="176" x2={112 + i * 12} y2="208" />
        ))}
        <line x1="108" y1="180" x2="212" y2="180" />
        <line x1="108" y1="204" x2="212" y2="204" />
      </g>
      <rect x="20" y="150" width="14" height="58" fill="#7a8b5a" rx="6" />
      {live && (
        <g>
          <rect x="0" y="0" width="320" height="240" fill="none" stroke="#fff" strokeOpacity=".5" strokeDasharray="2 6" />
          <path d="M20 40 V20 H40 M280 20 H300 V40 M300 200 V220 H280 M40 220 H20 V200" stroke="#fff" strokeWidth="2.5" fill="none" />
        </g>
      )}
      {stamp && (
        <g>
          <rect y="208" width="320" height="32" fill="#000" opacity=".62" />
          <text x="8" y="221" fontSize="9.5" fontWeight="700" fill="#fff">
            📍 {stamp.lat.toFixed(4)}°N, {stamp.lng.toFixed(4)}°E · {stamp.distanceM} m from address
          </text>
          <text x="8" y="234" fontSize="9" fill="#fff" opacity=".85">
            {stamp.time} · Valmo Rider in-app camera · gallery disabled
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------- pincode map

const STATUS_COLOR: Partial<Record<ParcelStatus, string>> = {
  out_for_delivery: '#616173',
  retry: '#d97706',
  delivered: '#06996d',
  in_queue: '#e11d48',
  flash: '#9f2089',
  held: '#7c3aed',
  sold: '#0ea5e9',
  resold_delivered: '#038d63',
  returning: '#94a3b8',
};

export const STATUS_LABEL: Record<ParcelStatus, string> = {
  out_for_delivery: 'Out for delivery',
  retry: 'Retry pending',
  delivered: 'Delivered',
  in_queue: 'Being listed',
  flash: '24h flash sale',
  held: 'Local hold',
  sold: 'Resold',
  resold_delivered: 'Resold · handed over',
  returning: 'Returning to seller',
  salvaged: 'Salvaged',
};

const S = 10; // px per km in the SVG's own units

export function PincodeMap({
  parcels,
  selectedId,
  onSelect,
  rider,
  focusPincode,
  showKiranas = true,
  showLegend = true,
  className = '',
}: {
  parcels: Parcel[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  rider?: { x: number; y: number; label?: string };
  focusPincode?: string;
  showKiranas?: boolean;
  showLegend?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <svg viewBox={`-2 -2 ${20 * S + 4} ${12 * S + 4}`} className="h-auto w-full select-none" role="img" aria-label="Pincode map of Indore">
        <defs>
          <pattern id="grid" width={S} height={S} patternUnits="userSpaceOnUse">
            <path d={`M ${S} 0 L 0 0 0 ${S}`} fill="none" stroke="#f3f3f8" strokeWidth={0.5} />
          </pattern>
        </defs>
        {PINCODES.map((p) => {
          const focus = focusPincode === p.code;
          return (
            <g key={p.code}>
              <rect x={p.x * S} y={p.y * S} width={p.w * S} height={p.h * S} fill={focus ? '#fff5fc' : '#fff'} />
              <rect x={p.x * S} y={p.y * S} width={p.w * S} height={p.h * S} fill="url(#grid)" stroke={focus ? '#bf3aa0' : '#eaeaf2'} strokeWidth={focus ? 1.2 : 0.6} />
              <text x={p.x * S + 3} y={p.y * S + 7} fontSize={5} fontWeight={700} fill={focus ? '#861b74' : '#8b8ba3'}>
                {p.code}
              </text>
              <text x={p.x * S + 3} y={p.y * S + 12.5} fontSize={3.6} fill="#8b8ba3">
                {p.area}
              </text>
            </g>
          );
        })}
        {showKiranas &&
          KIRANAS.map((k) => (
            <g key={k.id} transform={`translate(${k.x * S} ${k.y * S})`}>
              <title>{`${k.name} · ${k.kind === 'depot' ? 'courier depot' : 'partner kirana'}`}</title>
              {k.kind === 'depot' ? (
                <rect x={-3.5} y={-3} width={7} height={6} rx={1} fill="#0284c7" opacity={0.9} />
              ) : (
                <path d="M -3 -1 L 0 -3.5 L 3 -1 L 3 3 L -3 3 Z" fill="#7c3aed" opacity={0.85} />
              )}
            </g>
          ))}
        {HUBS.map((h) => (
          <g key={h.id} transform={`translate(${h.x * S} ${h.y * S})`}>
            <title>{h.name}</title>
            <rect x={-4} y={-4} width={8} height={8} rx={1.5} fill="#353543" />
            <text y={1.6} textAnchor="middle" fontSize={4} fill="#fff" fontWeight={700}>
              H
            </text>
          </g>
        ))}
        {parcels.map((p) => {
          const sel = p.id === selectedId;
          const c = STATUS_COLOR[p.status] ?? '#616173';
          return (
            <g key={p.id} transform={`translate(${p.x * S} ${p.y * S})`} onClick={onSelect ? () => onSelect(p.id) : undefined} className={onSelect ? 'cursor-pointer' : ''}>
              <title>{`${p.awb} · ${STATUS_LABEL[p.status]}`}</title>
              {sel && (
                <circle r={6} fill="none" stroke={c} strokeWidth={1}>
                  <animate attributeName="r" from="3" to="9" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="1" to="0" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={sel ? 3.2 : 2.3} fill={c} stroke="#fff" strokeWidth={0.8} />
            </g>
          );
        })}
        {rider && (
          <g transform={`translate(${rider.x * S} ${rider.y * S})`}>
            <circle r={4.2} fill="#9f2089" stroke="#fff" strokeWidth={1.2} />
            <text y={1.5} textAnchor="middle" fontSize={4} fill="#fff" fontWeight={800}>
              A
            </text>
          </g>
        )}
      </svg>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ink-800" /> Valmo hub
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 bg-violet-600" style={{ clipPath: 'polygon(50% 0, 100% 40%, 100% 100%, 0 100%, 0 40%)' }} /> Partner kirana
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-600" /> Courier depot
          </span>
          {(['out_for_delivery', 'in_queue', 'flash', 'held', 'sold', 'resold_delivered', 'returning'] as ParcelStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} /> {STATUS_LABEL[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
