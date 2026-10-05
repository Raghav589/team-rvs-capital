# Team RVS Capital · Reducing RTO at Meesho

**Meesho DICE Challenge, Season 3 · Reducing RTO: getting more orders delivered**
Team RVS Capital, IIT Madras: Raghav Ramnath, Vedika Warrier, Shreyas Kini

- **Live prototype:** https://second-chance-snowy.vercel.app (press **▶ Play demo** for the guided walkthrough)
- **Deck:** [`docs/deck.pdf`](docs/deck.pdf)
- **The math behind every number:** [`docs/MODEL.md`](docs/MODEL.md)

---

## The idea

About 17% of what Meesho ships is never delivered. Each of those parcels costs about ₹121: the trip to the buyer, up to three door attempts, and the trip all the way back to the seller. That comes to **₹4,720 Cr a year**.

Our solution attacks it in three places:

1. **Prevent** refusals before dispatch. Paying online is ₹30 cheaper than cash on delivery. Buyers are tiered by TrustMesh and their own refusal history (COD as usual, COD with a ₹30 deposit, or prepaid only). Checkout adds delivery slots and a backup contact, and the buyer can cancel for free until dispatch.
2. **Prove** every delivery attempt. The rider can mark an outcome only within 100 m of the door, after a logged call and an in-app doorstep photo. Every failure gets a reason code: the buyer's fault or the courier's.
3. **Recover** what is still refused. Meesho buys the parcel from the seller on the spot, at a price set from the seller's estimated margin (with a 0% second offer for fast-selling items). It then sells the parcel to a neighbour in the same pincode within 24 hours, delivered in 3 hours or collected from a kirana. If it doesn't sell, it goes to the city, then all of India, then bulk. It never travels back.

**Result, full-scale year on Valmo: about ₹326 Cr**, or ₹17 better per refused parcel than today. The 2-try cap, tested separately, could add up to ₹118 Cr. Every stress test stays positive. See [`docs/MODEL.md`](docs/MODEL.md).

## The prototype: five tabs, one page

| Tab | Whose phone | What it shows |
|---|---|---|
| **Keshav** | Buyer app | Checkout with address verification, delivery slot, weekend delivery and backup contact; payment options set by risk tier, with a reason and a one-tap appeal. Switch to Harshita (next door) to see a refused parcel listed as "Near you", with 3-hour delivery or ₹5 off at a kirana. |
| **Archit** | Valmo rider app | Outcomes locked until GPS is within 100 m; "Not home" needs a logged call and an in-app photo; fixed reason codes; fake attempts blocked; a route for wrong location pins. |
| **Sara** | Seller app | Money received, Meesho's offer for each refused parcel, the seller's maximum discount, and every return with its reason and proof. |
| **Pricing** | How the price is set | Margin estimate → Meesho's offer → the seller accepts, declines (with a 0% second offer for fast sellers) or takes it back → flash sale → widening the circle. Compares Meesho's result with today's, across the catalogue. |
| **Pados Point** | Valmo Partner app | A kirana creates a profile, photographs its shelf (instant capacity and earnings estimate), takes a 10-minute training, signs custody terms and goes live; the counter hands parcels over against the buyer's 4-digit code. |

Everything runs in the browser: no backend, no external APIs, deterministic seed data.

## Run it

Requires Node 18 or later.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 117 tests: the model, the store, the seed data and a full demo play-through
npm run numbers    # prints every number used in the deck, from the model
npm run build      # type-check + production build into dist/
```

## Repository map

```
src/
  model.ts         per-parcel economics: unit costs, buyer tiers, margin estimate, the seller's walk-away,
                   the two-step offer, flash-sale demand, widening the circle, kirana pickup economics
  annual.ts        the full-scale year on Valmo, the 2-try cap test, stress tests, five-year view, kirana earnings
  seed.ts          the demo world: buyers, sellers, riders, kiranas, catalogue, listing signals
  store.tsx        app state and actions (place order, attempt, refuse, list nearby, buy, hand over, pay the seller)
  demo.tsx         the guided demo script
  views/           Checkout (buyer) · Rider · Seller · Pricing · Partners (kirana)
  *.test.ts        117 tests
scripts/
  deck-numbers.ts  reproduces every figure in the deck (npm run numbers)
docs/
  MODEL.md         the math, step by step, with sources and assumptions
  numbers.json     the same figures in machine-readable form
  deck.pdf         the submitted deck
```

## Assumptions to test in the pilot

The key inputs that aren't from Meesho's filings or the case brief: 40% of refused parcels sell in the 24-hour flash sale; 85% are resaleable; 70% of sellers sell to Meesho; an average 12% discount; and half of resales are new orders. Each is a metric in the 30-60-90 day pilot. [`docs/MODEL.md`](docs/MODEL.md) shows how the result moves when each one changes.

## Stack

React 18, TypeScript, Vite, Tailwind CSS, Recharts, Vitest. Deployed on Vercel as a static single-page app (`vercel.json`).
