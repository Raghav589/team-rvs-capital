# The model: every number in the deck, and where it comes from

All of this is code, not a spreadsheet. The formulas below live in [`src/model.ts`](../src/model.ts) (per-parcel economics) and [`src/annual.ts`](../src/annual.ts) (the full-scale year), and are checked by 117 tests. `npm run numbers` prints every figure used in the deck; the output is reproduced at the end of this page.

₹ figures are rupees per parcel unless marked Cr (crore = 10 million). Inputs marked **assumption** are ours, to be tested in the pilot; everything else is from Meesho's filings or the case brief.

---

## 1. Sizing the problem

| Input | Value | Source |
|---|---|---|
| Orders placed, Q4 FY26 | 71.7 Cr → **286.8 Cr a year** | Meesho investor filing |
| GMV ÷ orders (average order value) | **₹265.75** | Meesho investor filing |
| NMV, annualised | ₹46,456 Cr | Meesho investor filing |
| Orders shipped ÷ placed | 80% | Management commentary |
| COD share of orders | 80% | Case brief |
| RTO rate, COD / prepaid | 20% / 5% | Case brief |
| Network cost per leg: hub, sort, line haul, regional | ₹6 + ₹5 + ₹8 + ₹10 = **₹29** | Case brief (node costs) |
| Last-mile attempt | ₹21 | Case brief |
| Attempts before an RTO today | 3 | Case brief |

```
blended RTO rate      = 0.8 × 20% + 0.2 × 5%                 = 17%
RTO parcels a year    = 286.8 Cr × 80% shipped × 17%          = 39.0 Cr
cost of one RTO       = 2 × ₹29 (there and back) + 3 × ₹21    = ₹121
RTO loss a year       = 39.0 Cr × ₹121                        = ₹4,720 Cr  (10.2% of NMV, ₹16.5 per order placed)
```

The RTO rate is applied to **shipped** orders, not placed ones: a parcel that never ships can't come back.

Of the ₹121, about ₹84 (₹29 forward + 2.6 attempts × ₹21) is already spent when the buyer refuses. **What a resale can still save is the ₹29 trip back**, plus whatever the parcel earns.

## 2. Prevention: buyer tiers (`decideTier`, `tierPolicy`)

```
history rate = customer-caused RTOs ÷ orders            (counted once the buyer has ≥ 3 orders)
tier         = max( band(TrustMesh score), band(history rate) )
band(x)      = 1 if x < 20%,  2 if 20% ≤ x ≤ 60%,  3 if x > 60%
```

TrustMesh, Meesho's existing pre-dispatch RTO score, is kept as one input; the stricter of the two sets the tier, so its block/allow becomes a graded response.

| Tier | Cash on delivery | Paying online | Attempts |
|---|---|---|---|
| 1 | Allowed, ₹299 | ₹269 (₹30 cheaper) | 3 |
| 2 | ₹30 deposit, then ₹269 at the door | ₹269 (₹30 cheaper) | 2, then pickup from a kirana (pilot test) |
| 3 | Not offered | ₹299, no discount | 2 |

The prepaid saving never grows with risk, so refusing parcels can never earn a better deal.

Prevention is **not** in the headline number. Each point of RTO it removes is worth about **₹116 Cr a year** on Valmo (`perPointCr`).

## 3. Recovery: what Meesho pays the seller (`estimateMargin`, `buyBackQuote`, `buyPlan`)

When a buyer refuses, the seller is offered two choices: sell the parcel to Meesho now, or have it returned as today. Once sold, the seller is done; everything after is Meesho's.

### 3a. Estimate the seller's margin

```
margin from wholesale = (price − closest wholesale match − ₹47 shipping charge) ÷ price
margin from signals   = category norm (jewellery 50%, clothes 35%, shoes 28%)
                        + 0.5 × (price ÷ median of similar listings − 1)
                        ± 6%  (makes it herself / buys to resell)
                        + 0.6 × (deepest past discount − 15%)
blended margin        = 0.6 × wholesale + 0.4 × signals
```

| Margin band | Discount Meesho asks for |
|---|---|
| Low (< 20%) | half the margin, up to 10% |
| Medium (20–40%) | 10% |
| High (> 40%) | 15% |

### 3b. Never below what the parcel is worth to the seller back

```
after fee  = price − ₹47 shipping − ₹15 repack
damage     = after fee × damage rate (8%; jewellery 10%, clothes 6%)
waiting    = (after fee − damage) × 24% a year × (21 days to return + 25–40 days to resell) ÷ 365
walk-away  = after fee − damage − waiting
```

The ask is capped so Meesho's price stays above the walk-away.

### 3c. The two-step offer

```
step 1:  Meesho pays  = price − margin-based discount − ₹47
step 2:  if the seller declines AND the parcel is a fast seller (≥ 60% expected to sell in 24 h)
         AND buying at 0% still beats −₹29:      Meesho pays = price − ₹47
otherwise the parcel goes back, as it does today.
```

**Worked example, oxidised jhumkas at ₹149:**

| | |
|---|---|
| Wholesale match ₹38 → margin (149 − 38 − 47) ÷ 149 | 43% |
| Signals (jewellery, reseller, ran 30% discounts, 5% above peers) | 56% |
| Blended → band | 48% → high → **15% off** |
| Step 1: ₹149 − ₹22 − ₹47 | **₹80** |
| Walk-away: ₹149 − ₹62 (shipping + repack) − ₹9 damage − ₹3 waiting | ₹75 → ₹80 is the better deal for the seller |
| Step 2 (63% sell in 24 h, a fast seller): ₹149 − ₹47 | ₹102 |

## 4. Selling it on (`flashSellThrough`, `WIDEN`, `ownershipPlan`)

### 4a. The 24-hour flash sale in the same pincode

```
P(sells in 24 h) = 1 − (1 − reach × conversion) ^ shoppers
```

`shoppers` = people in the pincode browsing that category and size today; `reach` = share who see the "Near you" card (70%); `conversion` = share who buy at full price (2%). Meesho already logs all three.

| | Shoppers a day | Sells in 24 h |
|---|---|---|
| Average pincode | 36 | 39.8% |
| Jhumkas (busy pincode) | 70 | 62.7% |
| Kundan choker (quiet) | 24 | 28.7% |

The buyer gets it in 3 hours (₹21 local delivery), or collects it from a kirana with ₹5 off (₹10 to the kirana + ₹4 rider stop + ₹5 discount = ₹19). Half collect.

### 4b. If nobody buys it in 24 hours: widen the circle

| When | Where | Price | Sell-through | Cost per parcel |
|---|---|---|---|---|
| Weeks 1–2 | Kirana, same pincode | 5%, then 10% off | 35% a week | ₹15 handling + ₹20 commission + ₹10.5 delivery + storage |
| Week 3 | Whole city | 10% off | 60% | ₹10 transfer + ₹21 delivery + ₹15 handling |
| Weeks 4–5 | Anywhere in India | 15% off | 60% a week | ₹50 to ship (₹29 + ₹21) |
| After week 5 | Bulk to local resellers | 35% of price | the rest | ₹10 |

Storage: ₹25 per sq ft a month ÷ 8 parcels per sq ft = ₹0.72 per parcel per week. Money tied up in bought parcels costs 24% a year.

### 4c. Meesho's result per parcel, from the moment of refusal

```
today          = −₹29                                       (pays the trip back)
Meesho buys it = P(24 h) × (price − ₹20 flash delivery)
               + Σ later stages × (stage price − stage costs)
               − price paid to the seller − money tied up − ₹3 seal check & support
```

| Counted from the refusal | Jhumkas ₹149 | Average order ₹266 |
|---|---|---|
| Today: send it back | −₹29 | −₹29 |
| Meesho buys at the step 1 price | **+₹30** | **+₹22** |
| Meesho buys at 0% off | +₹8 | −₹10 |

The jhumkas qualify for the 0% second offer. The average order (40% in 24 h) does not, which is why step 2 is limited to fast sellers.

**One jhumka sold in the flash sale, step by step:** −₹3 seal check, −₹80 to the seller, +₹144 from the neighbour (₹149 − ₹5 pickup discount), −₹14 to the kirana and rider = **+₹47**.

## 5. The full-scale year on Valmo (`annualCase`)

| Input | Value | Basis |
|---|---|---|
| Valmo's share of shipped orders | 50% | Business Standard |
| Refused parcels that can be resold (sealed, right item) | 85% | **assumption** (sellers report 8–10% damaged) |
| Sellers who sell to Meesho | 70% | **assumption**, from seller interviews |
| Average discount from the seller | 12% | **assumption**: between 10% (medium) and 15% (high) |
| Resales that are new orders | 50% | **assumption**: the rest would have bought on Meesho anyway |

```
RTO parcels on Valmo  = 286.8 × 0.8 × 0.5 × 17%  = 19.5 Cr
offered to Meesho     = 19.5 × 85% × 70%         = 11.6 Cr
```

| Line, ₹ Cr a year | How | Value |
|---|---|---|
| Trip back avoided | 11.6 Cr × ₹29 | +337 |
| ₹47 margin on flash sales | 4.6 Cr sold in 24 h × ₹47 | +217 |
| Discount kept on flash sales | 4.6 Cr × ₹32 (12% of ₹266) | +147 |
| Parcels sold after 24 h, net | ≈ ₹3 each on 7.0 Cr | +22 |
| Flash delivery and pickup | flash sales × ~₹20 | −92 |
| Seal check and support | 11.6 Cr × ₹3 | −35 |
| Resales that aren't new orders | resales × ₹47 × 50% | −268 |
| **Net a year** | **₹16.7 per RTO parcel** | **+₹326 Cr** |

Not counted: prevention (≈ ₹116 Cr per RTO point removed), the 2-try cap (below), and parcels bought through the 0% second offer.

### The 2-try cap: a separate pilot test

```
riskier RTO parcels capped   = 19.5 × 40%          = 7.80 Cr
reach a 3rd attempt today    = 7.80 ÷ (1 − 20%)    = 9.75 Cr
3rd try would deliver (20%)                         = 1.95 Cr
half collect from a kirana → lost deliveries        = 0.98 Cr
net = 7.80 × ₹21 saved − 0.98 × ₹47 lost            = +₹118 Cr
```

It lowers delivery to the original buyer slightly (83% → 82.2%), so it is tested on its own, only where the buyer has accepted pickup.

## 6. Sensitivity, stress tests and five years

| Case, full-scale year on Valmo | ₹ Cr |
|---|---|
| Base case | 326 |
| No resale is a new order | 58 |
| Every resale is a new order | 595 |
| Flash sale sells 20%, not 40% | 201 |
| Later sales 30% slower | 253 |
| +₹4 handling per parcel unsold after 24 h | 298 |
| Only 75% of parcels resaleable | 288 |
| **All four stresses at once** | **59** |
| Same model on all Meesho shipments | 653 |

Five years: orders grow 15% a year; 20% of Valmo pincodes live in FY27, 55% in FY28, 85% in FY29, all from FY30.

| FY27 | FY28 | FY29 | FY30 | FY31 | Total |
|---|---|---|---|---|---|
| ₹75 Cr | ₹237 Cr | ₹422 Cr | ₹571 Cr | ₹656 Cr | **₹1,962 Cr** |

## 7. The kirana (Pados Point) and the ₹5 pickup discount

A kirana is paid ₹15 per parcel held, ₹20 when a held parcel is collected and ₹10 for a same-day flash-sale pickup, weekly by UPI. With about 7 kiranas per pincode at full rollout, each holds about 21 parcels (about 2.6 sq ft of shelf).

| Shelf | Holds | Earns a month |
|---|---|---|
| 3 sq ft | 24 parcels | ₹1,339 |
| 5 sq ft | 40 parcels | ₹1,632 |
| 8 sq ft | 64 parcels | ₹1,632 |

**Does the ₹5 pickup discount pay?** A home drop costs ₹21 an attempt, and some fail; a kirana pickup costs ₹10 + ₹4.

| First home attempt fails | 20% | 30% | 40% |
|---|---|---|---|
| Pickup saves | ₹11.8 | ₹14.6 | ₹17.6 |
| Meesho keeps, after the ₹5 discount | ₹6.8 | ₹9.6 | ₹12.6 |

## 8. Reproduce it

```bash
npm install
npm run numbers    # prints everything above; writes docs/numbers.json
npm test           # 117 tests, including the formulas on this page
```

> `src/model.ts` also contains earlier versions of the recovery model (consignment, with and without a seller floor), which some views of the prototype still use for illustration. The deck's base case is `ownershipPlan` + `annualCase`.
