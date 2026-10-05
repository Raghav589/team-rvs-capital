/**
 * Deterministic seed data for the demo.
 * Same seed → same world every run. Coordinates are in km on a 20 × 12 km
 * grid of Indore; (0,0) is the north-west corner.
 */
import { decideTier, tierPolicy } from './model';

// ---------------------------------------------------------------- PRNG

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- types

export type Category = 'jewellery' | 'clothes' | 'shoes';
export type Blame = 'buyer' | 'partner';
export type Cause = 'commitment' | 'unreachable' | 'distribution';
export type Outcome = 'delivered' | 'refused' | 'not_home' | 'address_not_found';

export interface Pincode {
  code: string;
  area: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Hub {
  id: string;
  name: string;
  pincode: string;
  x: number;
  y: number;
}

export interface Kirana {
  id: string;
  name: string;
  owner: string;
  pincode: string;
  landmark: string;
  x: number;
  y: number;
  capacity: number; // parcels it can hold
  kind: 'kirana' | 'depot'; // depot = a courier partner's spare storage
  partnerId?: string; // depots belong to a courier partner
  onboardedDaysAgo: number;
  weekHolds: number; // parcels it took in over the last 7 days (before today's demo)
  weekPickups: number; // buyers who collected here over the last 7 days
}

/** Holding points still being signed up for the pilot (deck: "onboard 25–30 kiranas"). */
export type ProspectStage = 'Applied' | 'KYC & shelf check' | 'Training' | 'Agreement signed' | 'Live';
export const PROSPECT_STAGES: ProspectStage[] = ['Applied', 'KYC & shelf check', 'Training', 'Agreement signed', 'Live'];

export type StoreType = 'Kirana' | 'Courier store' | 'Medical store' | 'Mobile & recharge' | 'Other';

/** A store applying to become a Pados Point (a partner kirana or local courier store). */
export interface Prospect {
  id: string;
  name: string;
  owner: string;
  phone: string;
  storeType: StoreType;
  address: string;
  landmark: string;
  pincode: string;
  shelfSqft: number; // spare shelf space offered
  opens: string; // e.g. "8 am"
  closes: string; // e.g. "10 pm"
  sundays: boolean;
  stage: ProspectStage;
  appliedDaysAgo: number;
}

export interface Partner {
  id: string;
  name: string;
  short: string;
}

export interface Rider {
  id: string;
  name: string;
  age: number;
  partnerId: string;
  hubId: string;
  persona?: boolean;
}

export interface Seller {
  id: string;
  name: string;
  shop: string;
  city: string;
  category: Category;
  optIn: boolean;
  floor: number; // max discount the seller approves for local resale
  exclusions: string[]; // product types kept out of resale
  note: string;
  persona?: boolean;
}

export interface Buyer {
  id: string;
  name: string;
  age: number;
  occupation: string;
  pincode: string;
  address: string;
  landmark: string;
  phone: string;
  x: number;
  y: number;
  orders: number; // completed history
  customerCausedRtos: number;
  trustMesh: number; // 0–1, TrustMesh predicted RTO probability for their next order
  persona?: 'keshav' | 'harshita';
}

export type ReasonCode =
  | 'REFUSED_CHANGED_MIND'
  | 'REFUSED_NO_CASH'
  | 'REFUSED_LATE'
  | 'NOT_HOME_NO_ANSWER'
  | 'NOT_HOME_SWITCHED_OFF'
  | 'NOT_HOME_ASKED_LATER'
  | 'ADDRESS_INCOMPLETE'
  | 'ADDRESS_NOT_LOCATED'
  | 'OUT_OF_TIME'
  | 'MISROUTED';

export interface ReasonInfo {
  code: ReasonCode;
  outcome: Exclude<Outcome, 'delivered'>;
  label: string;
  blame: Blame;
  cause: Cause;
}

export const REASONS: ReasonInfo[] = [
  { code: 'REFUSED_CHANGED_MIND', outcome: 'refused', label: 'Changed mind, did not want it', blame: 'buyer', cause: 'commitment' },
  { code: 'REFUSED_NO_CASH', outcome: 'refused', label: 'No cash / would not pay COD', blame: 'buyer', cause: 'commitment' },
  // Arrived after the promised date: that's on the network, not the buyer.
  { code: 'REFUSED_LATE', outcome: 'refused', label: 'Arrived late, bought elsewhere', blame: 'partner', cause: 'distribution' },
  { code: 'NOT_HOME_NO_ANSWER', outcome: 'not_home', label: 'Called, no answer', blame: 'buyer', cause: 'unreachable' },
  { code: 'NOT_HOME_SWITCHED_OFF', outcome: 'not_home', label: 'Phone switched off', blame: 'buyer', cause: 'unreachable' },
  { code: 'NOT_HOME_ASKED_LATER', outcome: 'not_home', label: 'Asked to come another day', blame: 'buyer', cause: 'unreachable' },
  { code: 'ADDRESS_INCOMPLETE', outcome: 'address_not_found', label: 'Address incomplete or wrong', blame: 'buyer', cause: 'distribution' },
  { code: 'ADDRESS_NOT_LOCATED', outcome: 'address_not_found', label: 'Could not locate (address was fine)', blame: 'partner', cause: 'distribution' },
  { code: 'OUT_OF_TIME', outcome: 'not_home', label: 'Did not reach before hub cut-off', blame: 'partner', cause: 'distribution' },
  { code: 'MISROUTED', outcome: 'address_not_found', label: 'Mis-sorted, wrong route', blame: 'partner', cause: 'distribution' },
];

export const reasonInfo = (code: ReasonCode) => REASONS.find((r) => r.code === code)!;

export interface AttemptLog {
  id: string;
  parcelId: string;
  riderId: string;
  partnerId: string;
  at: number; // minutes since demo day 00:00 (negative = previous days)
  outcome: Outcome;
  reason?: ReasonCode;
  gpsDistanceM: number;
  callAt?: number;
  photo?: DoorPhoto; // required for "not home"
  verified: boolean; // GPS within 100 m (+ call and doorstep photo for not-home)
  historical?: boolean;
}

/**
 * Doorstep photo from the rider app's own camera. There is no gallery path:
 * the stamp (GPS, time, distance to address) is written at the moment of capture.
 */
export interface DoorPhoto {
  at: number; // minute of capture
  lat: number;
  lng: number;
  distanceM: number; // rider GPS to the buyer's address at capture
  source: 'in_app_camera';
}

/** Map-grid km → approximate Indore lat/lng for photo stamps. */
export const toLatLng = (x: number, y: number) => ({
  lat: Math.round((22.785 - y / 110.6) * 1e4) / 1e4,
  lng: Math.round((75.79 + x / 102.7) * 1e4) / 1e4,
});

export interface BlockedAttempt {
  id: string;
  parcelId: string;
  riderId: string;
  at: number;
  tried: Outcome;
  gpsDistanceM: number;
  why: string;
}

export type ParcelStatus =
  | 'out_for_delivery'
  | 'delivered'
  | 'retry' // failed attempt, will be retried
  | 'in_queue' // refused / exhausted, awaiting disposition
  | 'flash' // listed in 24h flash sale
  | 'held' // at partner kirana on the weekly ladder
  | 'sold' // resold, awaiting local handover
  | 'resold_delivered'
  | 'returning' // on the reverse leg to seller
  | 'salvaged';

export interface Parcel {
  id: string;
  awb: string;
  title: string;
  category: Category;
  price: number;
  sellerId: string;
  buyerId: string;
  payment: 'COD' | 'Prepaid';
  hubId: string;
  riderId: string;
  partnerId: string;
  x: number;
  y: number;
  distanceKm: number; // from hub
  status: ParcelStatus;
  attemptsMade: number;
  maxAttempts: number;
  refusedAt?: number;
  flashEndsAt?: number; // minutes
  kiranaId?: string;
  resale?: {
    buyerId: string;
    price: number;
    mode: 'delivery' | 'pickup';
    pickupCode?: string;
    at: number;
  };
  sellerPayout?: { amount: number; at: number; label: string };
  codToken?: number; // ₹ paid up front by UPI on a Tier 2 COD order
  altDelivery?: string; // e.g. "Neighbour · Aman Verma, Room 12 · 98260 11223"
  deliveryWindow?: string; // when someone can take delivery, e.g. "Evening, 6–9 pm"
}

// ---------------------------------------------------------------- places

export const CITY = 'Indore';

export const PINCODES: Pincode[] = [
  { code: '452002', area: 'Rajwada · Old City', x: 0, y: 0, w: 10, h: 6 },
  { code: '452010', area: 'Vijay Nagar', x: 10, y: 0, w: 10, h: 6 },
  { code: '452009', area: 'Sudama Nagar', x: 0, y: 6, w: 10, h: 6 },
  { code: '452016', area: 'Khajrana', x: 10, y: 6, w: 10, h: 6 },
];

export const HUBS: Hub[] = [
  { id: 'H1', name: 'Valmo LM hub · Vijay Nagar', pincode: '452010', x: 13.2, y: 2.4 },
  { id: 'H2', name: 'Valmo LM hub · Rajwada', pincode: '452002', x: 5.1, y: 3.0 },
  { id: 'H3', name: 'Valmo LM hub · Sudama Nagar', pincode: '452009', x: 3.6, y: 9.1 },
];

/** Every place a refused parcel can wait locally: partner kiranas, and courier partners' spare storage. */
export const KIRANAS: Kirana[] = [
  { id: 'K1', kind: 'kirana', onboardedDaysAgo: 26, weekHolds: 21, weekPickups: 34, name: 'Sharma General Store', owner: 'Rakesh Sharma', pincode: '452010', landmark: 'Scheme 54, opposite SBI ATM', x: 15.1, y: 3.3, capacity: 40 },
  { id: 'K2', kind: 'kirana', onboardedDaysAgo: 19, weekHolds: 14, weekPickups: 22, name: 'Jain Kirana & Dairy', owner: 'Sunita Jain', pincode: '452010', landmark: 'Near C21 Mall back gate', x: 12.4, y: 2.0, capacity: 30 },
  { id: 'K3', kind: 'kirana', onboardedDaysAgo: 24, weekHolds: 17, weekPickups: 26, name: 'Balaji Provision', owner: 'Mahesh Patidar', pincode: '452002', landmark: 'Beside Bada Ganpati temple', x: 3.2, y: 2.1, capacity: 35 },
  { id: 'K4', kind: 'kirana', onboardedDaysAgo: 12, weekHolds: 9, weekPickups: 13, name: 'Maa Annapurna Store', owner: 'Kamla Rathore', pincode: '452002', landmark: 'Jawahar Marg, near Rajwada', x: 7.4, y: 4.6, capacity: 25 },
  { id: 'K5', kind: 'kirana', onboardedDaysAgo: 22, weekHolds: 16, weekPickups: 19, name: 'Qureshi Mobile & General', owner: 'Salim Qureshi', pincode: '452016', landmark: 'Khajrana Ganesh temple road', x: 14.6, y: 8.2, capacity: 30 },
  { id: 'K6', kind: 'kirana', onboardedDaysAgo: 8, weekHolds: 6, weekPickups: 8, name: 'Shri Ganesh Traders', owner: 'Dinesh Verma', pincode: '452016', landmark: 'Ring Road, next to petrol pump', x: 18.1, y: 10.4, capacity: 30 },
  { id: 'K7', kind: 'kirana', onboardedDaysAgo: 17, weekHolds: 13, weekPickups: 18, name: 'Rathore Medical & General', owner: 'Pradeep Rathore', pincode: '452009', landmark: 'Sudama Nagar main road, near water tank', x: 2.4, y: 8.2, capacity: 35 },
  { id: 'K8', kind: 'kirana', onboardedDaysAgo: 5, weekHolds: 4, weekPickups: 5, name: 'Patel Kirana Kendra', owner: 'Jignesh Patel', pincode: '452009', landmark: 'Opposite govt. school, Sector D', x: 7.8, y: 10.6, capacity: 30 },
  // Courier partners' spare storage (deck roadmap: "sign 3PL partners with spare capacity").
  { id: 'D1', kind: 'depot', partnerId: 'P1', onboardedDaysAgo: 28, weekHolds: 58, weekPickups: 0, name: 'Malwa Express depot', owner: 'Malwa Express Logistics', pincode: '452010', landmark: 'Behind Vijay Nagar hub, gate 2', x: 13.9, y: 3.4, capacity: 200 },
  { id: 'D2', kind: 'depot', partnerId: 'P2', onboardedDaysAgo: 21, weekHolds: 41, weekPickups: 0, name: 'Shree Balaji depot', owner: 'Shree Balaji Couriers', pincode: '452002', landmark: 'Siyaganj godown lane', x: 5.9, y: 1.4, capacity: 150 },
  { id: 'D3', kind: 'depot', partnerId: 'P3', onboardedDaysAgo: 14, weekHolds: 33, weekPickups: 0, name: 'Narmada Parcel depot', owner: 'Narmada Parcel Services', pincode: '452009', landmark: 'Sudama Nagar transport nagar', x: 5.2, y: 7.6, capacity: 150 },
];

/** Next in line for the 30-day pilot. */
export const PROSPECTS: Prospect[] = [
  { id: 'PR1', name: 'Verma Kirana Store', owner: 'Anil Verma', phone: '98270 44 118', storeType: 'Kirana', address: '41, Azad Nagar main road', landmark: 'Opposite Khajrana police chowki', pincode: '452016', shelfSqft: 6, opens: '7 am', closes: '10 pm', sundays: true, stage: 'Agreement signed', appliedDaysAgo: 16 },
  { id: 'PR2', name: 'Khan General & Dairy', owner: 'Rafiq Khan', phone: '99260 31 402', storeType: 'Kirana', address: '12, Tanzeem Nagar', landmark: 'Next to Madina masjid', pincode: '452016', shelfSqft: 5, opens: '6 am', closes: '11 pm', sundays: true, stage: 'Training', appliedDaysAgo: 12 },
  { id: 'PR3', name: 'Agrawal Provision', owner: 'Seema Agrawal', phone: '98930 72 551', storeType: 'Kirana', address: '7, Chhatribagh', landmark: 'Near Gopal Mandir', pincode: '452002', shelfSqft: 4, opens: '8 am', closes: '9 pm', sundays: false, stage: 'Training', appliedDaysAgo: 11 },
  { id: 'PR4', name: 'Sai Mobile Point', owner: 'Ravi Patel', phone: '97550 18 336', storeType: 'Mobile & recharge', address: 'Shop 3, Scheme 78 market', landmark: 'Beside Vishal Mega Mart', pincode: '452010', shelfSqft: 3, opens: '10 am', closes: '10 pm', sundays: true, stage: 'KYC & shelf check', appliedDaysAgo: 8 },
  { id: 'PR5', name: 'Gupta Medical & General', owner: 'Deepak Gupta', phone: '98266 90 224', storeType: 'Medical store', address: '88, Dwarkapuri', landmark: 'Opposite Dwarkapuri thana', pincode: '452009', shelfSqft: 4, opens: '8 am', closes: '11 pm', sundays: true, stage: 'KYC & shelf check', appliedDaysAgo: 7 },
  { id: 'PR6', name: 'New Bharat Kirana', owner: 'Sunil Mandloi', phone: '99070 55 610', storeType: 'Kirana', address: '5, Bicholi Hapsi road', landmark: 'Near ISKCON gate', pincode: '452016', shelfSqft: 5, opens: '7 am', closes: '10 pm', sundays: true, stage: 'KYC & shelf check', appliedDaysAgo: 6 },
  { id: 'PR7', name: 'Choudhary Traders', owner: 'Mukesh Choudhary', phone: '98272 18 903', storeType: 'Kirana', address: '19, Scheme 114', landmark: 'Behind Apollo DB City', pincode: '452010', shelfSqft: 6, opens: '8 am', closes: '10 pm', sundays: false, stage: 'Applied', appliedDaysAgo: 3 },
  { id: 'PR8', name: 'Mahalaxmi Stores', owner: 'Kiran Rathore', phone: '97533 40 772', storeType: 'Kirana', address: '26, MG Road', landmark: 'Near Krishnapura chhatri', pincode: '452002', shelfSqft: 4, opens: '9 am', closes: '9 pm', sundays: true, stage: 'Applied', appliedDaysAgo: 2 },
  { id: 'PR9', name: 'Speed Link Couriers', owner: 'Imran Ali', phone: '98931 60 485', storeType: 'Courier store', address: 'Shop 11, Sudama Nagar complex', landmark: 'Opposite Sector E bus stop', pincode: '452009', shelfSqft: 12, opens: '9 am', closes: '8 pm', sundays: false, stage: 'Applied', appliedDaysAgo: 2 },
  { id: 'PR10', name: 'Yadav Dairy & Kirana', owner: 'Ramesh Yadav', phone: '99261 22 147', storeType: 'Kirana', address: '3, Khajrana Nayta Mundla road', landmark: 'Next to Hanuman mandir', pincode: '452016', shelfSqft: 5, opens: '6 am', closes: '10 pm', sundays: true, stage: 'Applied', appliedDaysAgo: 1 },
];

/** Pilot target from the deck's 30-day roadmap. */
export const PILOT_KIRANA_TARGET = { min: 25, max: 30 };

export const PARTNERS: Partner[] = [
  { id: 'P1', name: 'Malwa Express Logistics', short: 'Malwa Express' },
  { id: 'P2', name: 'Shree Balaji Couriers', short: 'Shree Balaji' },
  { id: 'P3', name: 'Narmada Parcel Services', short: 'Narmada Parcel' },
];

export const RIDERS: Rider[] = [
  { id: 'R1', name: 'Archit Sharma', age: 32, partnerId: 'P1', hubId: 'H1', persona: true },
  { id: 'R2', name: 'Ramesh Yadav', age: 38, partnerId: 'P1', hubId: 'H1' },
  { id: 'R3', name: 'Irfan Khan', age: 27, partnerId: 'P2', hubId: 'H2' },
  { id: 'R4', name: 'Sunil Chouhan', age: 30, partnerId: 'P2', hubId: 'H2' },
  { id: 'R5', name: 'Manoj Malviya', age: 35, partnerId: 'P3', hubId: 'H3' },
  { id: 'R6', name: 'Gopal Kushwah', age: 29, partnerId: 'P3', hubId: 'H3' },
];

export const SELLERS: Seller[] = [
  { id: 'S1', name: 'Sara', shop: 'StepUp Footwear', city: 'Agra', category: 'shoes', optIn: true, floor: 0.12, exclusions: [], note: 'Sells shoes online; sees RTO counts but never reasons', persona: true },
  { id: 'S2', name: 'Meenakshi Soni', shop: 'Rangoli Jewels', city: 'Jaipur', category: 'jewellery', optIn: true, floor: 0.2, exclusions: [], note: 'High margin, happy at the top of the band' },
  { id: 'S3', name: 'Hitesh Patel', shop: 'Kundan Kraft', city: 'Rajkot', category: 'jewellery', optIn: true, floor: 0.18, exclusions: [], note: 'High margin' },
  { id: 'S4', name: 'Nikhil Agarwal', shop: 'Surat Saree House', city: 'Surat', category: 'clothes', optIn: true, floor: 0.1, exclusions: ['Bridal'], note: 'Thin margin, high volume: bottom of the band' },
  { id: 'S5', name: 'Selvi Murugan', shop: 'Tiruppur Knits', city: 'Tiruppur', category: 'clothes', optIn: true, floor: 0.1, exclusions: [], note: 'Thin margin, high volume: bottom of the band' },
  { id: 'S6', name: 'Rohan Bansal', shop: 'Karol Bagh Kicks', city: 'Delhi', category: 'shoes', optIn: false, floor: 0.1, exclusions: [], note: 'Wants every parcel back (Path A)' },
];

// ---------------------------------------------------------------- personas

/** Option (b): Harshita missed her own delivery AND is the nearby resale buyer. Set false for a separate persona. */
export const HARSHITA_DOUBLE_ROLE = true;

export const PERSONAS = {
  keshav: { name: 'Keshav', age: 21, role: 'Student, loves trends', line: 'Orders on impulse. COD means he never really committed.' },
  archit: { name: 'Archit', age: 32, role: 'Delivery agent, 25+ orders/day', line: 'Paid the same for 2 km or 12 km. Marking “attempted” costs him nothing.' },
  harshita: { name: 'Harshita', age: 25, role: 'IT employee, lives alone', line: 'Out 9 to 6, exactly when riders deliver.' },
  sara: { name: 'Sara', age: 28, role: 'Entrepreneur, sells shoes online', line: 'Panel shows the RTO count, never the reason.' },
} as const;

// ---------------------------------------------------------------- buyers

const BUYER_ROWS: [string, number, string, string, string, string][] = [
  // name, age, occupation, pincode, address, landmark
  ['Keshav Tiwari', 21, 'Student', '452010', 'Room 14, Shree Boys Hostel, Scheme 78', 'Near Hanuman temple, opposite SBI ATM'],
  ['Harshita Jain', 25, 'IT employee', '452010', 'Flat 302, Sai Residency, Scheme 54', 'Behind Apollo pharmacy, green gate'],
  ['Ritu Solanki', 34, 'School teacher', '452010', '118, Sector C, Sukhliya', 'Near water tank, lane beside Bank of Baroda'],
  ['Mohit Patidar', 27, 'Shop owner', '452010', '52, Nipania main road', 'Above Raj Mobile shop'],
  ['Anjali Chouhan', 23, 'Nursing student', '452010', 'B-7, Scheme 74C', 'Opposite Shiv mandir'],
  ['Farhan Qureshi', 29, 'Electrician', '452016', '31, Khajrana gali no. 4', 'Near Khajrana Ganesh temple parking'],
  ['Pooja Rathore', 31, 'Homemaker', '452016', '9, Azad Nagar', '2nd house after the masjid, blue door'],
  ['Sandeep Yadav', 36, 'Auto driver', '452016', '77, Bicholi Mardana', 'Behind petrol pump, Ring Road'],
  ['Neha Malviya', 26, 'Beautician', '452016', '14, Tilak Nagar extension', 'Near Sai Baba mandir'],
  ['Imran Sheikh', 40, 'Tailor', '452016', '203, Chandan Nagar', 'Opposite govt. dispensary'],
  ['Arjun Verma', 22, 'College student', '452002', '6, Juni Indore', 'Lane behind Bada Ganpati'],
  ['Kavita Parmar', 45, 'Homemaker', '452002', '48, Malharganj', 'Near Kanch Mandir, yellow house'],
  ['Sneha Joshi', 24, 'Bank clerk', '452002', '12, Jawahar Marg', 'Above Agrawal sweets'],
  ['Rahul Dangi', 30, 'Sales executive', '452002', '90, Siyaganj', 'Opposite Rajwada parking'],
  ['Priyanka Gehlot', 28, 'Boutique owner', '452002', '3, Kalani Nagar', 'Next to Durga temple'],
  ['Vikas Choudhary', 33, 'Mechanic', '452009', '61, Sudama Nagar sector E', 'Near Rathore Medical'],
  ['Meena Kushwah', 39, 'Anganwadi worker', '452009', '22, Gumasta Nagar', 'Behind community hall'],
  ['Aakash Mandloi', 25, 'Gym trainer', '452009', '104, Dwarkapuri', 'Opposite govt. school, Sector D'],
  ['Shalini Dubey', 29, 'Pharmacist', '452009', '15, Anoop Nagar', 'Near Hanuman temple, corner house'],
  ['Deepak Rajput', 35, 'Contractor', '452009', '88, Rau bypass road', 'After toll naka, left at tea stall'],
];

const pc = (code: string) => PINCODES.find((p) => p.code === code)!;

function buildBuyers(rand: () => number): Buyer[] {
  return BUYER_ROWS.map(([name, age, occupation, pincode, address, landmark], i) => {
    const p = pc(pincode);
    let x = p.x + 0.8 + rand() * (p.w - 1.6);
    let y = p.y + 0.8 + rand() * (p.h - 1.6);
    const orders = 3 + Math.floor(rand() * 12);
    // Most buyers are low-risk: skew both signals low (same number of random draws as before).
    let rtos = Math.floor(rand() * rand() * orders * 0.3);
    const r = rand();
    let trustMesh = Math.round((0.03 + r ** 4 * 0.45) * 100) / 100;
    let persona: Buyer['persona'];
    if (i === 0) {
      // Keshav: clean 3-order history → Tier 1 today; one refusal takes him to 25% → Tier 2.
      x = 16.8; y = 1.6; persona = 'keshav';
      rtos = 0; trustMesh = 0.12;
      return { id: 'B01', name, age, occupation, pincode, address, landmark, phone: '98260 41 723', x, y, orders: 3, customerCausedRtos: rtos, trustMesh, persona };
    }
    if (i === 1) {
      // Harshita: missed deliveries while at work → Tier 2 on history.
      x = 15.9; y = 2.9; persona = 'harshita';
      return { id: 'B02', name, age, occupation, pincode, address, landmark, phone: '99070 18 245', x, y, orders: 8, customerCausedRtos: 2, trustMesh: 0.18, persona };
    }
    const tier3Example = i === 7; // Sandeep: 7 of 10 orders came back → Tier 3
    const phone = `9${Math.floor(rand() * 9) + 1}${String(Math.floor(rand() * 1e3)).padStart(3, '0')} ${String(Math.floor(rand() * 1e5)).padStart(5, '0')}`;
    return {
      id: `B${String(i + 1).padStart(2, '0')}`,
      name, age, occupation, pincode, address, landmark, phone,
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
      orders: tier3Example ? 10 : orders,
      customerCausedRtos: tier3Example ? 7 : rtos,
      trustMesh: tier3Example ? 0.66 : trustMesh,
      persona,
    };
  });
}

// ---------------------------------------------------------------- catalogue

export interface Product {
  title: string;
  category: Category;
  price: number;
  sellerId: string;
  emoji: string;
}

export const CATALOGUE: Product[] = [
  { title: "Women's block-heel sandals, beige, size 6", category: 'shoes', price: 349, sellerId: 'S1', emoji: '👡' },
  { title: "Men's canvas sneakers, white, size 9", category: 'shoes', price: 299, sellerId: 'S1', emoji: '👟' },
  { title: 'Kolhapuri flats, tan, size 7', category: 'shoes', price: 229, sellerId: 'S1', emoji: '🩴' },
  { title: "Men's sports shoes, navy, size 8", category: 'shoes', price: 399, sellerId: 'S6', emoji: '👟' },
  { title: 'Oxidised jhumka earrings', category: 'jewellery', price: 149, sellerId: 'S2', emoji: '💍' },
  { title: 'Anklet pair, silver-plated', category: 'jewellery', price: 179, sellerId: 'S2', emoji: '📿' },
  { title: 'Kundan choker set with earrings', category: 'jewellery', price: 399, sellerId: 'S3', emoji: '💎' },
  { title: 'Georgette saree with blouse piece', category: 'clothes', price: 449, sellerId: 'S4', emoji: '🥻' },
  { title: 'Cotton printed saree', category: 'clothes', price: 329, sellerId: 'S4', emoji: '🥻' },
  { title: 'Rayon printed kurti, size M', category: 'clothes', price: 289, sellerId: 'S5', emoji: '👗' },
  { title: 'Cotton co-ord set, size L', category: 'clothes', price: 379, sellerId: 'S5', emoji: '👚' },
  { title: "Men's regular-fit cotton shirt, size 40", category: 'clothes', price: 259, sellerId: 'S5', emoji: '👔' },
];

/**
 * What Meesho knows about each listing when pricing a refused parcel: margin
 * signals, and how many people in a typical pincode shop that category and size
 * each day. Illustrative values for the prototype.
 */
export const LISTING_SIGNALS: Record<string, { wholesale?: number; sellerType: 'manufacturer' | 'reseller'; pastMaxDiscount: number; priceVsPeers: number; shoppersPerDay: number }> = {
  "Women's block-heel sandals, beige, size 6": { wholesale: 190, sellerType: 'manufacturer', pastMaxDiscount: 0.2, priceVsPeers: 1.05, shoppersPerDay: 34 },
  "Men's canvas sneakers, white, size 9": { wholesale: 175, sellerType: 'manufacturer', pastMaxDiscount: 0.12, priceVsPeers: 1.0, shoppersPerDay: 44 },
  'Kolhapuri flats, tan, size 7': { wholesale: 150, sellerType: 'manufacturer', pastMaxDiscount: 0.08, priceVsPeers: 0.9, shoppersPerDay: 18 },
  "Men's sports shoes, navy, size 8": { wholesale: 290, sellerType: 'reseller', pastMaxDiscount: 0.05, priceVsPeers: 1.0, shoppersPerDay: 40 },
  'Oxidised jhumka earrings': { wholesale: 38, sellerType: 'reseller', pastMaxDiscount: 0.3, priceVsPeers: 1.05, shoppersPerDay: 70 },
  'Anklet pair, silver-plated': { wholesale: 60, sellerType: 'manufacturer', pastMaxDiscount: 0.2, priceVsPeers: 1.0, shoppersPerDay: 30 },
  'Kundan choker set with earrings': { wholesale: 150, sellerType: 'manufacturer', pastMaxDiscount: 0.25, priceVsPeers: 1.1, shoppersPerDay: 24 },
  'Georgette saree with blouse piece': { wholesale: 230, sellerType: 'manufacturer', pastMaxDiscount: 0.2, priceVsPeers: 1.0, shoppersPerDay: 50 },
  'Cotton printed saree': { wholesale: 190, sellerType: 'reseller', pastMaxDiscount: 0.1, priceVsPeers: 0.95, shoppersPerDay: 38 },
  'Rayon printed kurti, size M': { wholesale: 150, sellerType: 'manufacturer', pastMaxDiscount: 0.15, priceVsPeers: 1.0, shoppersPerDay: 64 },
  'Cotton co-ord set, size L': { wholesale: 210, sellerType: 'reseller', pastMaxDiscount: 0.12, priceVsPeers: 1.05, shoppersPerDay: 30 },
  "Men's regular-fit cotton shirt, size 40": { wholesale: 175, sellerType: 'reseller', pastMaxDiscount: 0.05, priceVsPeers: 0.95, shoppersPerDay: 46 },
  'Leather ankle boots, size 7': { wholesale: 1500, sellerType: 'manufacturer', pastMaxDiscount: 0.2, priceVsPeers: 1.1, shoppersPerDay: 8 },
};

/** The demo order Keshav places in step 1. */
export const KESHAV_PRODUCT: Product = {
  title: "Men's canvas sneakers, white, size 9",
  category: 'shoes',
  price: 299,
  sellerId: 'S1',
  emoji: '👟',
};

// ---------------------------------------------------------------- world

/** One message in a seller's price room. Floors are max discount on the buyer's price. */
export interface PriceMsg {
  id: string;
  from: 'meesho' | 'seller';
  at: number;
  kind: 'offer' | 'counter' | 'accept' | 'reject' | 'note';
  floor?: number;
  text: string;
}

/** A live "sell below your floor, or take it back?" request on one parcel. */
export interface DealRequest {
  id: string;
  parcelId: string;
  sellerId: string;
  discount: number; // offered discount on the buyer's price
  price: number; // ₹ the nearby buyer pays
  buyerId: string; // nearby buyer who made the offer
  createdAt: number;
  status: 'open' | 'accepted' | 'declined';
}

export interface World {
  buyers: Buyer[];
  parcels: Parcel[];
  logs: AttemptLog[];
  blocked: BlockedAttempt[];
  sellers: Seller[];
  threads: Record<string, PriceMsg[]>; // sellerId → price room
  deals: DealRequest[];
  prospects: Prospect[]; // Pados Point applications, by stage
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Demo clock starts at 10:30 on the demo day. */
export const DEMO_START_MIN = 10 * 60 + 30;

const AWB = (n: number) => `VL${(7420031 + n * 37).toString()}IN`;

export function buildWorld(seed = 20261006): World {
  const rand = mulberry32(seed);
  const buyers = buildBuyers(rand);
  const parcels: Parcel[] = [];
  let n = 0;

  const make = (
    buyer: Buyer,
    product: Product,
    riderId: string,
    payment: Parcel['payment'],
    status: ParcelStatus,
    extra: Partial<Parcel> = {},
  ): Parcel => {
    const rider = RIDERS.find((r) => r.id === riderId)!;
    const hub = HUBS.find((h) => h.id === rider.hubId)!;
    const p: Parcel = {
      id: `PX${String(++n).padStart(3, '0')}`,
      awb: AWB(n),
      title: product.title,
      category: product.category,
      price: product.price,
      sellerId: product.sellerId,
      buyerId: buyer.id,
      payment,
      hubId: hub.id,
      riderId,
      partnerId: rider.partnerId,
      x: buyer.x,
      y: buyer.y,
      distanceKm: Math.round(dist(hub, buyer) * 1.3 * 10) / 10, // road ≈ 1.3 × crow-fly
      status,
      attemptsMade: 0,
      maxAttempts: tierPolicy(decideTier(buyer.customerCausedRtos, buyer.orders, buyer.trustMesh).tier).maxAttempts,
      ...extra,
    };
    parcels.push(p);
    return p;
  };

  const b = (id: string) => buyers.find((x) => x.id === id)!;
  const prod = (i: number) => CATALOGUE[i % CATALOGUE.length];

  // Archit's route today (R1, Vijay Nagar hub). Keshav's order is added live in the demo.
  make(b('B02'), prod(9), 'R1', 'COD', 'out_for_delivery'); // Harshita — not home
  make(b('B03'), prod(4), 'R1', 'Prepaid', 'out_for_delivery');
  make(b('B04'), prod(11), 'R1', 'COD', 'out_for_delivery');
  make(b('B05'), prod(5), 'R1', 'COD', 'out_for_delivery');
  make(b('B09'), prod(10), 'R1', 'COD', 'out_for_delivery');
  make(b('B08'), prod(3), 'R1', 'COD', 'out_for_delivery'); // far drop, Tier 3 buyer
  make(b('B20'), prod(8), 'R1', 'COD', 'out_for_delivery'); // > 10 km — far-drop bonus
  make(b('B06'), prod(0), 'R1', 'Prepaid', 'out_for_delivery');

  // Other riders' parcels — mix of states so every screen has something on it.
  const others: [string, string][] = [
    ['B10', 'R2'], ['B07', 'R2'], ['B11', 'R3'], ['B12', 'R3'], ['B13', 'R3'], ['B14', 'R4'],
    ['B15', 'R4'], ['B16', 'R5'], ['B17', 'R5'], ['B18', 'R6'], ['B19', 'R6'], ['B03', 'R2'],
    ['B04', 'R2'], ['B12', 'R4'], ['B16', 'R6'], ['B17', 'R6'], ['B11', 'R4'], ['B14', 'R3'],
    ['B19', 'R5'], ['B18', 'R5'], ['B13', 'R4'], ['B15', 'R3'], ['B10', 'R2'], ['B07', 'R2'],
  ];
  others.forEach(([bid, rid], i) => {
    const status: ParcelStatus = i % 5 === 0 ? 'out_for_delivery' : 'delivered';
    const pay = rand() < 0.8 ? 'COD' : 'Prepaid';
    const p = make(b(bid), prod(i + 2), rid, pay, status);
    if (status === 'delivered') p.attemptsMade = 1 + (rand() < 0.2 ? 1 : 0);
  });

  // Already-refused parcels sitting in the engine: two live in the flash sale in 452010, one held at a kirana.
  make(b('B04'), prod(6), 'R2', 'COD', 'flash', { attemptsMade: 1, refusedAt: DEMO_START_MIN - 95, flashEndsAt: DEMO_START_MIN - 95 + 24 * 60 });
  make(b('B05'), prod(7), 'R2', 'COD', 'flash', { attemptsMade: 2, refusedAt: DEMO_START_MIN - 260, flashEndsAt: DEMO_START_MIN - 260 + 24 * 60 });
  make(b('B09'), prod(1), 'R2', 'COD', 'held', { attemptsMade: 3, refusedAt: DEMO_START_MIN - 3 * 24 * 60, kiranaId: 'K5' });
  make(b('B12'), prod(10), 'R3', 'COD', 'in_queue', { attemptsMade: 2, refusedAt: DEMO_START_MIN - 20 });
  make(b('B18'), prod(3), 'R6', 'COD', 'returning', { attemptsMade: 3, refusedAt: DEMO_START_MIN - 40 }); // S6 opted out

  // Sara's history: one parcel resold last week (paid), one refused today with her offer waiting (open deal request).
  const DAY = 24 * 60;
  const saraResold = make(b('B13'), CATALOGUE[0], 'R4', 'COD', 'resold_delivered', { attemptsMade: 1, refusedAt: DEMO_START_MIN - 8 * DAY });
  saraResold.resale = { buyerId: 'B15', price: 349, mode: 'pickup', pickupCode: '4127', at: DEMO_START_MIN - 8 * DAY + 9 * 60 };
  saraResold.sellerPayout = { amount: Math.round(349 * 0.88) - 47, at: DEMO_START_MIN - 6 * DAY, label: 'Sold to Meesho · paid in 2 days' }; // her 12% maximum, less the shipping charge
  const saraStuck = make(b('B14'), CATALOGUE[2], 'R3', 'COD', 'held', { attemptsMade: 2, refusedAt: DEMO_START_MIN - 3 * 60, kiranaId: 'K4' });
  // Overflow waiting at a courier partner's depot, week 2 of its ladder.
  make(b('B03'), CATALOGUE[10], 'R2', 'COD', 'held', { attemptsMade: 2, refusedAt: DEMO_START_MIN - 9 * DAY, kiranaId: 'D1' });

  // Historical attempt logs — feed rider trust scores, cause split and partner tracking.
  const logs: AttemptLog[] = [];
  const partnerProfile: Record<string, { verify: number; partnerFail: number }> = {
    P1: { verify: 0.93, partnerFail: 0.04 },
    P2: { verify: 0.88, partnerFail: 0.06 },
    P3: { verify: 0.61, partnerFail: 0.32 }, // the outlier
  };
  // ≈ 13 : 3 commitment : unreachable among buyer-caused failures → overall ≈ 70 / 16 / 14 with partner failures
  const buyerFails: ReasonCode[] = [
    'REFUSED_CHANGED_MIND', 'REFUSED_CHANGED_MIND', 'REFUSED_NO_CASH', 'REFUSED_LATE', 'REFUSED_CHANGED_MIND',
    'REFUSED_NO_CASH', 'REFUSED_LATE', 'REFUSED_CHANGED_MIND', 'REFUSED_NO_CASH', 'REFUSED_CHANGED_MIND',
    'REFUSED_CHANGED_MIND', 'REFUSED_NO_CASH', 'REFUSED_LATE',
    'NOT_HOME_NO_ANSWER', 'NOT_HOME_SWITCHED_OFF', 'NOT_HOME_ASKED_LATER',
  ];
  const partnerFails: ReasonCode[] = ['ADDRESS_NOT_LOCATED', 'OUT_OF_TIME', 'MISROUTED', 'OUT_OF_TIME'];
  let li = 0;
  RIDERS.forEach((r) => {
    const prof = partnerProfile[r.partnerId];
    const hub = HUBS.find((h) => h.id === r.hubId)!;
    const count = r.persona ? 44 : 30 + Math.floor(rand() * 16);
    for (let k = 0; k < count; k++) {
      const failed = rand() < 0.3;
      const partnerCaused = failed && rand() < prof.partnerFail;
      const reason = !failed ? undefined : partnerCaused ? partnerFails[Math.floor(rand() * partnerFails.length)] : buyerFails[Math.floor(rand() * buyerFails.length)];
      const outcome: Outcome = reason ? reasonInfo(reason).outcome : 'delivered';
      const verified = r.persona ? rand() < 0.86 : rand() < prof.verify;
      const gps = verified ? Math.round(10 + rand() * 80) : Math.round(250 + rand() * 2400);
      const at = -(1 + Math.floor(rand() * 13)) * 24 * 60 + 9 * 60 + Math.floor(rand() * 600);
      logs.push({
        id: `L${String(++li).padStart(4, '0')}`,
        parcelId: `HIST-${li}`,
        riderId: r.id,
        partnerId: r.partnerId,
        at,
        outcome,
        reason,
        gpsDistanceM: gps,
        callAt: outcome === 'not_home' && verified ? at - 3 : undefined,
        photo:
          reason?.startsWith('NOT_HOME') && verified
            ? { at: at - 1, ...toLatLng(hub.x + (rand() - 0.5) * 8, hub.y + (rand() - 0.5) * 6), distanceM: gps, source: 'in_app_camera' }
            : undefined,
        verified,
        historical: true,
      });
    }
  });

  // Verified failure logs for parcels that were already refused when the demo starts.
  const seededReasons: ReasonCode[] = ['REFUSED_CHANGED_MIND', 'REFUSED_NO_CASH', 'REFUSED_LATE', 'REFUSED_CHANGED_MIND'];
  parcels
    .filter((p) => p.refusedAt !== undefined)
    .forEach((p, i) => {
      const reason = seededReasons[i % seededReasons.length];
      const at = p.refusedAt!;
      logs.push({
        id: `L-seed-${p.id}`,
        parcelId: p.id,
        riderId: p.riderId,
        partnerId: p.partnerId,
        at,
        outcome: 'refused',
        reason,
        gpsDistanceM: 18 + ((i * 17) % 60),
        verified: true,
        historical: true,
      });
    });

  const threads: Record<string, PriceMsg[]> = {};
  SELLERS.forEach((s) => {
    const rec = { jewellery: 0.18, clothes: 0.12, shoes: 0.15 }[s.category];
    const t0 = DEMO_START_MIN - 40 * DAY;
    threads[s.id] = [
      { id: `${s.id}-1`, from: 'meesho', at: t0, kind: 'offer', floor: rec, text: `Proposed floor for ${s.category} in your buyers’ pincodes, based on local sell-through.` },
      ...(s.floor !== rec
        ? [
            { id: `${s.id}-2`, from: 'seller' as const, at: t0 + 60, kind: 'counter' as const, floor: s.floor, text: 'Countered.' },
            { id: `${s.id}-3`, from: 'meesho' as const, at: t0 + 62, kind: 'accept' as const, floor: s.floor, text: 'Agreed. This is now your resale floor.' },
          ]
        : [{ id: `${s.id}-2`, from: 'seller' as const, at: t0 + 60, kind: 'accept' as const, floor: s.floor, text: 'Accepted.' }]),
    ];
  });
  // Sara's story: Meesho opened at 15%, she wanted 10%, they met at 12%.
  threads.S1 = [
    { id: 'S1-1', from: 'meesho', at: DEMO_START_MIN - 40 * DAY, kind: 'offer', floor: 0.15, text: 'Shoes in your buyers’ pincodes clear fastest with room to go to 15% off.' },
    { id: 'S1-2', from: 'seller', at: DEMO_START_MIN - 40 * DAY + 90, kind: 'counter', floor: 0.1, text: 'My margins on sandals are thin. 10% max.' },
    { id: 'S1-3', from: 'meesho', at: DEMO_START_MIN - 40 * DAY + 92, kind: 'counter', floor: 0.12, text: 'Meet at 12%? That’s the most we take off when we buy a refused parcel, and it never comes back.' },
    { id: 'S1-4', from: 'seller', at: DEMO_START_MIN - 39 * DAY, kind: 'accept', floor: 0.12, text: 'OK, 12%.' },
  ];

  const deals: DealRequest[] = [
    {
      id: 'D1',
      parcelId: saraStuck.id,
      sellerId: 'S1',
      discount: 0.12, // her floor: the guaranteed price if it doesn't sell in 24 hours
      price: Math.round(saraStuck.price * 0.88),
      buyerId: 'B12',
      createdAt: DEMO_START_MIN - 50,
      status: 'open',
    },
  ];

  return {
    buyers,
    parcels,
    logs,
    blocked: [],
    sellers: SELLERS.map((s) => ({ ...s, exclusions: [...s.exclusions] })),
    threads,
    deals,
    prospects: PROSPECTS.map((p) => ({ ...p })),
  };
}
