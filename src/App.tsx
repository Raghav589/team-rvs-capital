import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { fmtClock, useStore } from './store';
import { Wordmark } from './ui';
import { DemoBar, startDemo } from './demo';
import Partners from './views/Partners';
import Pricing from './views/Pricing';
import Rider from './views/Rider';
import Seller from './views/Seller';
import Checkout from './views/Checkout';

const TABS = [
  { to: '/checkout', label: 'Keshav', who: 'Customer app' },
  { to: '/rider', label: 'Archit', who: 'Rider app' },
  { to: '/seller', label: 'Sara', who: 'Seller app' },
  { to: '/partners', label: 'Pados Point', who: 'Kirana partner app' },
  { to: '/pricing', label: 'Pricing', who: 'Buy-back price model' },
];

function HeaderLink({ icon, label, onClick, title }: { icon: string; label: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[13px] font-semibold leading-tight">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} title={title} className="flex flex-col items-center gap-1 px-3 text-ink-800 transition hover:text-brand-600 md:px-4">
      {body}
    </button>
  ) : (
    <div className="num flex flex-col items-center gap-1 px-4 text-ink-800">{body}</div>
  );
}

export default function App() {
  const { state, dispatch } = useStore();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-3 md:gap-6 lg:px-6">
          <div className="flex shrink-0 items-center gap-3">
            <Wordmark className="text-[28px] md:text-[34px]" />
            <div className="hidden min-w-0 border-l border-ink-200 pl-3 leading-tight sm:block">
              <div className="text-[15px] font-extrabold text-brand-600">Team RVS Capital</div>
              <div className="hidden text-[11px] font-semibold text-ink-600 xl:block">Reducing RTO: getting more orders delivered · IIT Madras</div>
            </div>
          </div>
          <div className="ml-auto flex items-center divide-x divide-ink-200">
            <div className="pr-3 md:pr-4">
              <button className="btn-primary whitespace-nowrap px-3 py-2.5 md:px-5" onClick={() => startDemo(dispatch)}>
                ▶ {state.demo.active ? 'Restart demo' : 'Play demo'}
              </button>
            </div>
            <div className="hidden lg:block">
              <HeaderLink icon="🕒" label={fmtClock(state.clock)} />
            </div>
            <div className="hidden lg:block">
              <HeaderLink icon="⏩" label="+6 hours" onClick={() => dispatch({ type: 'TICK', minutes: 6 * 60 })} title="Advance the demo clock by 6 hours" />
            </div>
            <HeaderLink icon="↺" label="Reset demo" onClick={() => dispatch({ type: 'RESET' })} />
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-[1440px] gap-2 overflow-x-auto border-t border-ink-200 px-4 lg:px-6">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `shrink-0 border-b-[3px] px-3 pb-2 pt-2.5 text-left transition ${isActive ? 'border-brand-600 text-brand-600' : 'border-transparent text-ink-800 hover:text-brand-600'}`
              }
            >
              <div className="text-[15px] font-bold leading-tight">{t.label}</div>
              <div className="text-[11px] font-semibold leading-tight text-ink-400">{t.who}</div>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        <Routes>
          <Route path="/" element={<Navigate to="/checkout" replace />} />
          <Route path="/rider" element={<Rider />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/seller" element={<Seller />} />
          <Route path="/partners/*" element={<Partners />} />
          <Route path="/pricing" element={<Pricing />} />
          
          <Route path="*" element={<Navigate to="/checkout" replace />} />
        </Routes>
      </main>
      <footer className={`border-t border-ink-200 bg-white ${state.demo.active ? 'pb-56 md:pb-40' : ''}`}>
        <div className="mx-auto max-w-[1440px] px-4 py-4 text-xs text-ink-600 lg:px-6">
          <b className="text-ink-800">Concept prototype</b> for the Meesho DICE Challenge Season 3 by Team RVS Capital, IIT Madras (Raghav Ramnath, Vedika Warrier,
          Shreyas Kini). Not a Meesho product. All people, orders and parcels are simulated; model inputs and their sources are in the deck appendix.
        </div>
      </footer>
      <DemoBar />
    </div>
  );
}
