/**
 * Builds the starting database: the business profile, roles, staff accounts and
 * interest settings (always), plus an optional set of realistic sample records.
 *
 * Sample records are produced by running the same domain functions the app uses
 * (createLoan, collectPayment …), so every receipt, balance and audit entry is
 * consistent with the real rules. Nothing on the dashboard is hard-coded: all
 * figures are derived from these records at read time.
 */
import type { Carat, Category, Customer, Database, GoldRate, Settings, User } from './types';
import { defaultRoles, ROLE_IDS } from './permissions';
import { hashPassword } from './auth';
import { type ISODate, addDays, addMonths, cmpISO, diffDays, stampAt, todayISO } from './dates';
import { DEFAULT_POLICY, countMonths } from './interest';
import {
  type Actor,
  type Ctx,
  type CustomerInput,
  type ItemInput,
  AppError,
  calcLoan,
  collectPayment,
  createCustomer,
  createLoan,
  findLoan,
  planCode,
  pushAudit,
} from './domain';
import { GRAMS_PER_VORI } from './format';

export const DB_VERSION = 1;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_ACCOUNTS = [
  { id: 'u_owner', username: 'owner', password: 'owner123', name: 'Mahbub Alam', roleId: ROLE_IDS.owner, language: 'en' as const, mobile: '01711000101' },
  { id: 'u_manager', username: 'manager', password: 'manager123', name: 'Nusrat Jahan', roleId: ROLE_IDS.manager, language: 'en' as const, mobile: '01711000102' },
  { id: 'u_cashier', username: 'cashier', password: 'cashier123', name: 'Sohel Rana', roleId: ROLE_IDS.cashier, language: 'bn' as const, mobile: '01711000103' },
  { id: 'u_auditor', username: 'auditor', password: 'auditor123', name: 'Kamal Hossain', roleId: ROLE_IDS.auditor, language: 'bn' as const, mobile: '01711000104' },
];

function makeUsers(now: string): User[] {
  return DEMO_ACCOUNTS.map((a, i) => {
    const salt = `igh${i}salt${a.username}`;
    return {
      id: a.id,
      username: a.username,
      name: a.name,
      mobile: a.mobile,
      roleId: a.roleId,
      status: 'active' as const,
      salt,
      passwordHash: hashPassword(a.password, salt),
      language: a.language,
      createdAt: now,
      createdBy: 'u_owner',
    };
  });
}

function makeGoldRates(today: ISODate, rand: () => number): GoldRate[] {
  const out: GoldRate[] = [];
  let k22 = 221_500;
  const days = 60;
  const series: number[] = [];
  for (let i = 0; i < days; i++) {
    k22 *= 1 + (rand() - 0.46) * 0.009;
    series.push(k22);
  }
  // Rescale so today's 22K rate lands on a round figure.
  const scale = 224_500 / series[series.length - 1];
  series.forEach((v, i) => {
    const v22 = Math.round((v * scale) / 100) * 100;
    out.push({
      date: addDays(today, -(days - 1 - i)),
      k22: v22,
      k24: Math.round(((v22 * 24) / 22) / 100) * 100,
      k21: Math.round(((v22 * 21) / 22) / 100) * 100,
      k18: Math.round(((v22 * 18) / 22) / 100) * 100,
    });
  });
  return out;
}

export function defaultSettings(today: ISODate, rand: () => number = mulberry32(7)): Settings {
  return {
    business: {
      name: { en: 'Ithika Gold House', bn: 'ইথিকা গোল্ড হাউস' },
      tagline: { en: 'Gold, loan and pledge management', bn: 'স্বর্ণ, ঋণ ও বন্ধক ব্যবস্থাপনা' },
      address: { en: 'Shop 12, Gold Market Road, Dhaka 1100', bn: 'দোকান ১২, গোল্ড মার্কেট রোড, ঢাকা ১১০০' },
      phone: '+880 1700-000000',
      email: 'info@ithikagold.example',
      licenseNo: '',
      receiptFooter: {
        en: 'Pledged items are returned only against this receipt and a valid ID. Interest is charged under the 30-day rule.',
        bn: 'এই রসিদ ও বৈধ পরিচয়পত্র দেখালেই বন্ধকী অলংকার ফেরত দেওয়া হবে। সুদ ৩০ দিনের নিয়মে হিসাব করা হয়।',
      },
    },
    defaultLanguage: 'en',
    interest: {
      policy: { ...DEFAULT_POLICY },
      maxLtv: 75,
      defaultTermMonths: 6,
    },
    ratePlans: [
      { id: 'rp_standard', name: { en: 'Standard', bn: 'স্ট্যান্ডার্ড' }, rate: 5, active: true, note: { en: 'Default for new customers', bn: 'নতুন গ্রাহকদের জন্য ডিফল্ট' } },
      { id: 'rp_regular', name: { en: 'Regular customer', bn: 'নিয়মিত গ্রাহক' }, rate: 4, active: true, note: { en: 'Customers with a clean repayment record', bn: 'যাদের পরিশোধের রেকর্ড পরিষ্কার' } },
      { id: 'rp_large', name: { en: 'Large loan', bn: 'বড় ঋণ' }, rate: 3.5, active: true, note: { en: 'Principal of BDT 2,50,000 or more', bn: 'আসল ২,৫০,০০০ টাকা বা তার বেশি' } },
      { id: 'rp_short', name: { en: 'Short term', bn: 'স্বল্পমেয়াদি' }, rate: 6, active: true, note: { en: 'Terms of three months or less', bn: 'তিন মাস বা তার কম মেয়াদ' } },
    ],
    goldRates: makeGoldRates(today, rand),
    counters: { customer: 0, loan: 0, item: 0, receipt: 0 },
    backup: { autoDaily: true, keep: 7 },
  };
}

/** Users, roles and settings only — no customer records. */
export function baseDatabase(today: ISODate = todayISO()): Database {
  const rand = mulberry32(7);
  const now = stampAt(addDays(today, -400), 9, 0);
  return {
    version: DB_VERSION,
    customers: [],
    loans: [],
    items: [],
    payments: [],
    receipts: [],
    users: makeUsers(now),
    roles: defaultRoles(),
    audit: [],
    backups: [],
    settings: defaultSettings(today, rand),
    meta: { createdAt: now, demo: false },
  };
}

// ---------------------------------------------------------------------------
// Sample records
// ---------------------------------------------------------------------------
const NAMES_EN = [
  'Rahim Uddin', 'Karim Hossain', 'Nasrin Akter', 'Shirin Sultana', 'Abdul Jalil', 'Fatema Begum',
  'Mizanur Rahman', 'Rokeya Khatun', 'Jahangir Alam', 'Sumaiya Islam', 'Tanvir Ahmed', 'Rina Parvin',
  'Shafiqul Islam', 'Anwara Begum', 'Kamrul Hasan', 'Moriom Akter', 'Delwar Hossain', 'Sabina Yasmin',
  'Humayun Kabir', 'Lutfun Nahar', 'Alamgir Hossain', 'Nazma Khatun',
];
const NAMES_BN = [
  'আবুল কাশেম', 'রোকসানা পারভীন', 'মোস্তফা কামাল', 'শাহিনা আক্তার', 'নুরুল ইসলাম', 'জেসমিন আরা',
  'হাবিবুর রহমান', 'পারভীন সুলতানা', 'শাহিদুল ইসলাম', 'ফারজানা ইয়াসমিন', 'রুহুল আমিন', 'সালমা খাতুন',
  'মনির হোসেন', 'তাহমিনা বেগম',
];
const AREAS_EN = ['Mirpur-10', 'Mohammadpur', 'Uttara Sector 7', 'Dhanmondi', 'Jatrabari', 'Badda', 'Savar', 'Narayanganj', 'Gazipur', 'Tongi', 'Malibagh', 'Khilgaon'];
const AREAS_BN = ['মিরপুর-১০', 'মোহাম্মদপুর', 'উত্তরা সেক্টর ৭', 'ধানমন্ডি', 'যাত্রাবাড়ী', 'বাড্ডা', 'সাভার', 'নারায়ণগঞ্জ', 'গাজীপুর', 'টঙ্গী', 'মালিবাগ', 'খিলগাঁও'];

const DESC: Record<Category, { en: string[]; bn: string[] }> = {
  chain: { en: ['Rope chain', 'Box chain', 'Singapore chain', 'Cuban link chain', 'Plain gold chain', 'Figaro chain'], bn: ['রোপ চেইন', 'বক্স চেইন', 'সিঙ্গাপুরি চেইন', 'সাধারণ চেইন'] },
  ring: { en: ['Plain band ring', 'Stone-set ring', 'Solitaire ring', 'Gents signet ring', 'Engagement ring'], bn: ['সাধারণ আংটি', 'পাথর বসানো আংটি', 'ছেলেদের আংটি', 'বিয়ের আংটি'] },
  necklace: { en: ['Necklace with pendant', 'Bridal necklace', 'Choker necklace', 'Long haar necklace'], bn: ['পেন্ডেন্টসহ নেকলেস', 'বিয়ের হার', 'চোকার নেকলেস', 'লম্বা হার'] },
  bangle: { en: ['Pair of plain bangles', 'Carved bangle', 'Kangan', 'Pair of thick bangles'], bn: ['এক জোড়া সাধারণ চুড়ি', 'নকশা করা চুড়ি', 'কাঙ্গন', 'এক জোড়া মোটা চুড়ি'] },
  earring: { en: ['Jhumka earrings', 'Stud earrings', 'Hoop earrings', 'Drop earrings'], bn: ['ঝুমকা', 'টপ কানের দুল', 'রিং কানের দুল', 'ঝোলানো কানের দুল'] },
  other: { en: ['Pendant', 'Nose pin set'], bn: ['লকেট'] },
};
const WEIGHT: Record<Category, [number, number]> = {
  chain: [3.5, 14], ring: [1.8, 5], necklace: [9, 28], bangle: [8, 22], earring: [2, 6], other: [1.2, 4],
};

const toBn = (s: string) => s.replace(/\d/g, (x) => '০১২৩৪৫৬৭৮৯'[+x]);

/** Sample data with a believable shape on whatever day it is opened (see `shapeOk`). */
export function buildSeed(today: ISODate = todayISO()): Database {
  let last: Database | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    last = buildSeedWith(today, 20261013 + attempt * 7919);
    if (shapeOk(last, today)) return last;
  }
  return last!;
}

function shapeOk(db: Database, today: ISODate): boolean {
  const months = new Set(db.loans.map((l) => l.disbursedOn.slice(0, 7)));
  for (let i = 1; i <= 12; i++) if (!months.has(addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7))) return false;
  const overdue = db.loans.filter((l) => l.status === 'active' && cmpISO(today, l.maturityDate) > 0).length;
  const soon = db.loans.filter((l) => l.status === 'active' && cmpISO(l.maturityDate, today) >= 0 && cmpISO(l.maturityDate, addDays(today, 30)) <= 0).length;
  const partial = db.payments.some((p) => p.principal > 0 && !p.settlement);
  return overdue >= 6 && overdue <= 11 && soon >= 3 && partial && db.loans.length >= 50;
}

function buildSeedWith(today: ISODate, seed: number): Database {
  const r = mulberry32(seed);
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;

  const d = baseDatabase(today);
  d.meta.demo = true;
  d.settings.interest.approvedBy = 'u_owner';
  d.settings.interest.approvedAt = stampAt(addDays(today, -400), 11, 30);

  let idc = 0;
  const id = (p: string) => `${p}_${(++idc).toString(36).padStart(4, '0')}`;
  const actors: Actor[] = [
    { id: 'u_cashier', name: 'Sohel Rana', roleId: ROLE_IDS.cashier },
    { id: 'u_manager', name: 'Nusrat Jahan', roleId: ROLE_IDS.manager },
    { id: 'u_cashier', name: 'Sohel Rana', roleId: ROLE_IDS.cashier },
    { id: 'u_owner', name: 'Mahbub Alam', roleId: ROLE_IDS.owner },
  ];
  // Nothing recorded "today" may be stamped later than the moment the sample data is built,
  // nor earlier than the start of today.
  const builtAt = Date.now();
  const dayStart = new Date(`${today}T00:00:00`).getTime();
  const notInFuture = (at: string, salt: number): string => {
    if (Date.parse(at) <= builtAt) return at;
    const floor = Math.min(dayStart + 60_000, builtAt);
    return new Date(Math.max(floor, builtAt - (2 + (salt % 80)) * 60_000)).toISOString();
  };
  const ctxFor = (date: ISODate): Ctx => {
    const hour = int(10, 19);
    const minute = int(0, 59);
    return { actor: pick(actors), at: notInFuture(stampAt(date, hour, minute), hour * 7 + minute * 3), today, id };
  };

  // gold price drifts gently up over the period
  const rate22On = (date: ISODate) => {
    const ago = Math.max(0, diffDays(date, today));
    return d.settings.goldRates[d.settings.goldRates.length - 1].k22 * (1 - 0.00055 * ago) * (0.99 + r() * 0.02);
  };

  // --- plan customers and loans ---------------------------------------------
  interface LoanPlan {
    cIdx: number;
    date: ISODate;
    items: ItemInput[];
    principal: number;
    rate: number;
    planId?: string;
    custom: boolean;
    term: number;
    behavior: 'regular' | 'sporadic' | 'dormant' | 'partial';
    settleOn?: ISODate;
    lapseAfter: number;
    ref: { id?: string };
  }
  interface CustomerPlan { input: CustomerInput; firstDate: ISODate; ref: { id?: string }; loans: number }

  const customers: CustomerPlan[] = [];
  const total = NAMES_EN.length + NAMES_BN.length;
  const order = Array.from({ length: total }, (_, i) => i).sort(() => r() - 0.5);
  order.forEach((n) => {
    const bn = n >= NAMES_EN.length;
    const name = bn ? NAMES_BN[n - NAMES_EN.length] : NAMES_EN[n];
    const area = int(0, AREAS_EN.length - 1);
    const house = int(2, 96);
    const road = int(1, 14);
    const address = bn
      ? `বাসা ${toBn(String(house))}, রোড ${toBn(String(road))}, ${AREAS_BN[area]}, ঢাকা`
      : `House ${house}, Road ${road}, ${AREAS_EN[area]}, Dhaka`;
    const mobile = `01${pick(['3', '5', '6', '7', '7', '8', '9'])}${String(int(0, 99999999)).padStart(8, '0')}`;
    customers.push({
      input: {
        name,
        mobile,
        address,
        nid: chance(0.45) ? String(int(1000000000, 9999999999)) : undefined,
        notes: chance(0.12) ? (bn ? 'নিয়মিত গ্রাহক, প্রতি মাসে সুদ দেন।' : 'Regular customer, pays interest monthly.') : undefined,
      },
      firstDate: addDays(today, -int(8, 430)),
      ref: {},
      loans: pick([1, 1, 1, 1, 2, 2, 2, 3]),
    });
  });
  customers.sort((a, b) => cmpISO(a.firstDate, b.firstDate));

  const plans: LoanPlan[] = [];
  customers.forEach((c, cIdx) => {
    for (let k = 0; k < c.loans; k++) {
      const date = k === 0 ? c.firstDate : addDays(c.firstDate, int(18, Math.max(19, diffDays(c.firstDate, today) - 3)));
      if (cmpISO(date, addDays(today, -2)) > 0) continue;
      // items
      const count = pick([1, 1, 1, 1, 2, 2, 3]);
      const items: ItemInput[] = [];
      for (let i = 0; i < count; i++) {
        const category = pick<Category>(['chain', 'chain', 'ring', 'necklace', 'bangle', 'bangle', 'earring']);
        const [lo, hi] = WEIGHT[category];
        const net = Math.round((lo + r() * (hi - lo)) * 100) / 100;
        const stone = category === 'ring' || category === 'earring' || category === 'necklace' ? (chance(0.5) ? Math.round(r() * 80) / 100 : 0) : 0;
        const carat = pick<Carat>([22, 22, 22, 22, 22, 21, 21, 18]);
        const useBn = chance(0.25);
        const desc = useBn ? pick(DESC[category].bn) : pick(DESC[category].en);
        const perVori = (rate22On(date) * carat) / 22;
        items.push({
          category,
          description: desc,
          carat,
          grossWeight: Math.round((net + stone) * 100) / 100,
          stoneWeight: stone,
          valuation: roundTo((net / GRAMS_PER_VORI) * perVori, 500),
        });
      }
      const value = items.reduce((s, i) => s + i.valuation, 0);
      const ltv = 0.55 + r() * 0.17;
      const principal = Math.max(8000, roundTo(value * ltv, 500));
      const term = pick([3, 6, 6, 6, 12, 12]);
      let planId = 'rp_standard';
      let rate = 5;
      let custom = false;
      if (term === 3 && chance(0.5)) { planId = 'rp_short'; rate = 6; }
      else if (principal >= 250000) { planId = 'rp_large'; rate = 3.5; }
      else if (chance(0.42)) { planId = 'rp_regular'; rate = 4; }
      if (chance(0.04)) { custom = true; rate = 4.5; planId = ''; }

      const maturity = addMonths(date, term);
      const matured = cmpISO(today, maturity) > 0;
      const monthsElapsed = countMonths(date, today).chargeable;
      let settleOn: ISODate | undefined;
      const wantsSettle = matured ? chance(0.5) : chance(0.16) && monthsElapsed >= 2;
      if (wantsSettle) {
        const lo = addDays(addMonths(date, 1), 2);
        const hi = cmpISO(addDays(maturity, 55), addDays(today, -2)) < 0 ? addDays(maturity, 55) : addDays(today, -2);
        if (cmpISO(lo, hi) <= 0) settleOn = addDays(lo, int(0, diffDays(lo, hi)));
      }
      plans.push({
        cIdx,
        date,
        items,
        principal,
        rate,
        planId: planId || undefined,
        custom,
        term,
        behavior: pick(['regular', 'regular', 'regular', 'sporadic', 'dormant', 'partial']),
        settleOn,
        lapseAfter: matured ? int(1, Math.max(1, term + 1)) : 99,
        ref: {},
      });
    }
  });

  // --- turn plans into dated events --------------------------------------------
  interface Ev { date: ISODate; pri: number; seq: number; run: () => void }
  const events: Ev[] = [];
  let seq = 0;
  const add = (date: ISODate, pri: number, run: () => void) => events.push({ date, pri, seq: seq++, run });

  customers.forEach((c) => {
    add(c.firstDate, 0, () => {
      c.ref.id = createCustomer(d, ctxFor(c.firstDate), c.input);
    });
  });

  const methods = ['cash', 'cash', 'cash', 'bkash', 'bkash', 'nagad', 'bank'] as const;
  plans.forEach((p) => {
    const cust = customers[p.cIdx];
    add(p.date, 1, () => {
      if (!cust.ref.id) return;
      const res = createLoan(d, ctxFor(p.date), {
        customerId: cust.ref.id,
        date: p.date,
        principal: p.principal,
        rate: p.rate,
        ratePlanId: p.planId,
        customRate: p.custom,
        termMonths: p.term,
        items: p.items,
      });
      p.ref.id = res.loanId;
    });

    const payProb = { regular: 0.92, sporadic: 0.38, dormant: 0, partial: 0.75 }[p.behavior];
    const horizon = p.settleOn ?? today;
    const monthsToRun = countMonths(p.date, horizon).chargeable;
    const principalMonth = p.behavior === 'partial' ? int(2, Math.max(2, monthsToRun)) : -1;
    for (let m = 1; m <= monthsToRun; m++) {
      if (!p.settleOn && m > p.lapseAfter) break;
      const date = addDays(addMonths(p.date, m), int(0, p.behavior === 'sporadic' ? 3 : 2));
      if (cmpISO(date, today) > 0) break;
      if (p.settleOn && cmpISO(date, addDays(p.settleOn, -4)) >= 0) break;
      const isPrincipalMonth = m === principalMonth;
      if (!isPrincipalMonth && !chance(payProb)) continue;
      const method = pick([...methods]);
      add(date, 2, () => {
        if (!p.ref.id) return;
        const loan = findLoan(d, p.ref.id);
        if (!loan || loan.status !== 'active') return;
        const calc = calcLoan(d, loan, date);
        let interest = calc.interestOutstanding;
        let principal = 0;
        if (isPrincipalMonth) {
          const cut = roundTo(calc.principalOutstanding * (0.25 + r() * 0.2), 1000);
          if (cut >= 2000 && calc.principalOutstanding - cut >= 2000) principal = cut;
        } else if (p.behavior === 'sporadic') {
          interest = Math.round(interest * (0.55 + r() * 0.45));
        }
        if (interest + principal <= 0) return;
        collectPayment(d, ctxFor(date), { loanId: loan.id, date, interest, principal, method });
      });
    }
    if (p.settleOn) {
      const date = p.settleOn;
      add(date, 3, () => {
        if (!p.ref.id) return;
        const loan = findLoan(d, p.ref.id);
        if (!loan || loan.status !== 'active') return;
        const calc = calcLoan(d, loan, date);
        collectPayment(d, ctxFor(date), {
          loanId: loan.id,
          date,
          interest: calc.interestOutstanding,
          principal: calc.principalOutstanding,
          method: pick([...methods]),
        });
      });
    }
  });

  events.sort((a, b) => cmpISO(a.date, b.date) || a.pri - b.pri || a.seq - b.seq);
  for (const ev of events) {
    try {
      ev.run();
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
    }
  }

  // A manual override and a manual check so the audit trail shows the verification workflow.
  const overdue = d.loans.filter((l) => l.status === 'active' && cmpISO(today, l.maturityDate) > 0);
  const target = overdue[Math.min(2, overdue.length - 1)];
  if (target) {
    const date = addDays(today, -1);
    const calc = calcLoan(d, target, date);
    if (calc.interestOutstanding > 1500) {
      const ctx: Ctx = { actor: { id: 'u_manager', name: 'Nusrat Jahan', roleId: ROLE_IDS.manager }, at: stampAt(date, 12, 40), today, id };
      target.adjustments.push({
        id: id('adj'),
        date,
        at: ctx.at,
        by: 'u_manager',
        kind: 'waiver',
        amount: -500,
        reason: 'Customer is a long-time regular; waived part of the interest after a phone call with the owner.',
        before: calc.interestOutstanding,
        after: calc.interestOutstanding - 500,
      });
      pushAudit(d, ctx, {
        action: 'override',
        entity: 'interest',
        entityId: target.id,
        label: target.number,
        reason: 'Customer is a long-time regular; waived part of the interest after a phone call with the owner.',
        changes: [{ field: 'interestOutstanding', before: calc.interestOutstanding, after: calc.interestOutstanding - 500 }],
        meta: { kind: 'waiver', amount: -500 },
      });
    }
  }

  // Setup history, so the audit trail shows administration as well as day-to-day business.
  const asOwner: Actor = { id: 'u_owner', name: 'Mahbub Alam', roleId: ROLE_IDS.owner };
  const asManager: Actor = { id: 'u_manager', name: 'Nusrat Jahan', roleId: ROLE_IDS.manager };
  const setupCtx = (daysAgo: number, hour: number, minute: number, actor: Actor): Ctx => ({
    actor,
    at: notInFuture(stampAt(addDays(today, -daysAgo), hour, minute), hour * 5 + minute),
    today,
    id,
  });
  const opening = 400;
  DEMO_ACCOUNTS.filter((a) => a.id !== 'u_owner').forEach((a, i) => {
    pushAudit(d, setupCtx(opening, 9, 20 + i * 4, asOwner), { action: 'create', entity: 'user', entityId: a.id, label: a.username });
  });
  pushAudit(d, setupCtx(opening, 11, 30, asOwner), { action: 'approve', entity: 'settings', entityId: 'interest', label: 'interest' });
  pushAudit(d, setupCtx(opening - 1, 10, 5, asOwner), {
    action: 'update',
    entity: 'settings',
    entityId: 'settings',
    label: 'business',
    changes: [
      { field: 'phone', before: null, after: d.settings.business.phone },
      { field: 'email', before: null, after: d.settings.business.email },
    ],
  });
  pushAudit(d, setupCtx(opening - 2, 10, 20, asOwner), {
    action: 'update',
    entity: 'role',
    entityId: ROLE_IDS.manager,
    label: 'Manager',
    changes: [{ field: 'interest.override', before: false, after: true }],
  });
  const regular = d.settings.ratePlans.find((x) => x.id === 'rp_regular');
  if (regular) {
    pushAudit(d, setupCtx(130, 15, 10, asOwner), {
      action: 'update',
      entity: 'rate_plan',
      entityId: 'rate_plan',
      label: 'ratePlans',
      changes: [{ field: 'ratePlan', before: planCode({ ...regular, rate: 4.5 }), after: planCode(regular) }],
    });
  }
  pushAudit(d, setupCtx(90, 16, 40, asOwner), {
    action: 'update',
    entity: 'settings',
    entityId: 'settings',
    label: 'backup',
    changes: [{ field: 'keep', before: 5, after: d.settings.backup.keep }],
  });
  // the manager records the gold rate each morning
  d.settings.goldRates.slice(-8).forEach((rate) => {
    pushAudit(d, setupCtx(diffDays(rate.date, today), 10, 15, asManager), {
      action: 'update',
      entity: 'settings',
      entityId: 'goldRates',
      label: rate.date,
      changes: [{ field: 'k22', before: null, after: rate.k22 }],
    });
  });

  d.audit.sort((a, b) => a.at.localeCompare(b.at));
  return d;
}

export type { Customer };
