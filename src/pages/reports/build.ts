/**
 * Report builders. Each one turns the stored records into a language-aware table model,
 * so the screen view, the paper view, the PDF and the CSV all say exactly the same thing.
 */
import { PAYMENT_METHODS, type Database, type Lang, type Receipt } from '../../lib/types';
import { makeT, type TFn } from '../../lib/i18n';
import { makeFmt, type Fmt } from '../../lib/format';
import { cmpISO, endOfMonth, lastMonthKeys, monthKey, type ISODate } from '../../lib/dates';
import { calcLoan } from '../../lib/domain';
import { loanRows, portfolio, type LoanRow } from '../../lib/selectors';
import { slotKey } from '../vault/model';

export const REPORT_IDS = ['collections', 'interest', 'disbursement', 'outstanding', 'overdue', 'custody', 'monthly', 'statement', 'reconcile'] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export interface Params {
  from: ISODate | '';
  to: ISODate | '';
  customerId: string;
}

export type Tone = 'ok' | 'danger' | 'muted' | 'gold';
export interface Cell {
  text: string;
  /** Raw value for CSV. */
  v?: string | number;
  tone?: Tone;
  strong?: boolean;
  /** In-app link (screen only). */
  to?: string;
  mono?: boolean;
}
export interface Col {
  label: string;
  align?: 'l' | 'r' | 'c';
  weight?: number;
}
export interface Section {
  id: string;
  title?: string;
  note?: string;
  cols: Col[];
  rows: Cell[][];
  foot?: Cell[];
  /** Shown instead of the table when there are no rows. */
  empty?: string;
}
export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}
export interface Report {
  id: ReportId;
  title: string;
  subtitle: string;
  meta: { label: string; value: string; wide?: boolean }[];
  kpis: Kpi[];
  sections: Section[];
  landscape: boolean;
  fileBase: string;
  /** The report cannot be shown until this is chosen. */
  needs?: 'customer';
}

interface Ctx {
  db: Database;
  today: ISODate;
  lang: Lang;
  t: TFn;
  f: Fmt;
  p: Params;
  rows: LoanRow[];
}

// ---- small helpers ---------------------------------------------------------
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const c = (text: string, o: Partial<Cell> = {}): Cell => ({ text, ...o });
const dash = (): Cell => c('—', { tone: 'muted', v: '' });
const inRange = (d: ISODate, p: Params) => (!p.from || cmpISO(d, p.from) >= 0) && (!p.to || cmpISO(d, p.to) <= 0);
const byDateAsc = <T extends { date: string; createdAt: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

function periodText(x: Ctx): string {
  const { p, f, t } = x;
  if (!p.from && !p.to) return t('rep.p.allTime');
  if (p.from && p.to) return p.from === p.to ? f.date(p.from) : `${f.date(p.from)} – ${f.date(p.to)}`;
  return p.from ? `${t('common.from')} ${f.date(p.from)}` : `${t('common.to')} ${f.date(p.to)}`;
}

const money = (x: Ctx, n: number, o: Partial<Cell> = {}): Cell => c(x.f.money(n), { v: n, ...o });
const count = (x: Ctx, n: number, o: Partial<Cell> = {}): Cell => c(x.f.n(n), { v: n, ...o });
const weight = (x: Ctx, g: number, o: Partial<Cell> = {}): Cell => c(x.f.weight(g), { v: Math.round(g * 1000) / 1000, ...o });
const stateText = (x: Ctx, state: 'active' | 'overdue' | 'released') => x.t(`status.${state}`);
const stateTone = (state: 'active' | 'overdue' | 'released'): Tone | undefined => (state === 'overdue' ? 'danger' : state === 'released' ? 'ok' : undefined);

function receiptsByPayment(db: Database): Map<string, Receipt[]> {
  const m = new Map<string, Receipt[]>();
  for (const r of db.receipts) {
    if (!r.paymentId) continue;
    const list = m.get(r.paymentId);
    if (list) list.push(r);
    else m.set(r.paymentId, [r]);
  }
  return m;
}

function receiptCell(x: Ctx, list: Receipt[] | undefined, prefer?: Receipt['type']): Cell {
  if (!list?.length) return dash();
  const first = (prefer && list.find((r) => r.type === prefer)) || list[0];
  const more = list.length - 1;
  return c(more > 0 ? `${first.number} +${x.f.digits(more)}` : first.number, { v: list.map((r) => r.number).join(' '), mono: true, to: `/receipts/${first.id}` });
}

function base(x: Ctx, id: ReportId, extra: Partial<Report> = {}): Report {
  const { t, f } = x;
  return {
    id,
    title: t(`rep.r.${id}.name`),
    subtitle: t(`rep.r.${id}.desc`),
    meta: [{ label: t('rep.m.asOf'), value: f.date(x.today) }],
    kpis: [],
    sections: [],
    landscape: false,
    fileBase: id,
    ...extra,
  };
}

/** Months between two ISO dates, as keys. */
function monthSpan(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ---- collections -------------------------------------------------------------
function collections(x: Ctx): Report {
  const { db, t, f, p } = x;
  const pays = db.payments.filter((q) => inRange(q.date, p)).sort(byDateAsc);
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const customers = new Map(db.customers.map((cu) => [cu.id, cu]));
  const rcpt = receiptsByPayment(db);
  const interest = sum(pays.map((q) => q.interest));
  const principal = sum(pays.map((q) => q.principal));

  const sections: Section[] = [];
  const days = [...new Set(pays.map((q) => q.date))];
  if (days.length > 1) {
    sections.push({
      id: 'days',
      title: t('rep.s.byDay'),
      cols: [{ label: t('rep.c.date'), weight: 1.4 }, { label: t('rep.c.payments'), align: 'r' }, { label: t('rep.c.interest'), align: 'r', weight: 1.3 }, { label: t('rep.c.principal'), align: 'r', weight: 1.3 }, { label: t('rep.c.total'), align: 'r', weight: 1.3 }],
      rows: days.map((d) => {
        const day = pays.filter((q) => q.date === d);
        const i = sum(day.map((q) => q.interest));
        const pr = sum(day.map((q) => q.principal));
        return [c(f.date(d), { v: d }), count(x, day.length), money(x, i), money(x, pr), money(x, i + pr, { strong: true })];
      }),
      foot: [c(t('common.total'), { strong: true }), count(x, pays.length, { strong: true }), money(x, interest, { strong: true }), money(x, principal, { strong: true }), money(x, interest + principal, { strong: true })],
    });
  }

  const methods = PAYMENT_METHODS.map((m) => ({ m, list: pays.filter((q) => q.method === m) })).filter((e) => e.list.length);
  sections.push({
    id: 'methods',
    title: t('rep.s.byMethod'),
    cols: [{ label: t('rep.c.method'), weight: 2 }, { label: t('rep.c.payments'), align: 'r' }, { label: t('rep.c.total'), align: 'r', weight: 1.4 }],
    rows: methods.map(({ m, list }) => [c(t(`method.${m}`)), count(x, list.length), money(x, sum(list.map((q) => q.interest + q.principal)), { strong: true })]),
    foot: methods.length ? [c(t('common.total'), { strong: true }), count(x, pays.length, { strong: true }), money(x, interest + principal, { strong: true })] : undefined,
    empty: t('rep.empty.payments'),
  });

  sections.push({
    id: 'payments',
    title: t('rep.s.payments'),
    cols: [{ label: t('rep.c.date'), weight: 1.2 }, { label: t('rep.c.receipt'), weight: 1.9 }, { label: t('rep.c.customer'), weight: 2 }, { label: t('rep.c.loan'), weight: 1.7 }, { label: t('rep.c.interest'), align: 'r', weight: 1.2 }, { label: t('rep.c.principal'), align: 'r', weight: 1.2 }, { label: t('rep.c.total'), align: 'r', weight: 1.2 }, { label: t('rep.c.method'), weight: 1.1 }],
    rows: pays.map((q) => {
      const loan = loans.get(q.loanId);
      const cu = customers.get(q.customerId);
      return [
        c(f.date(q.date), { v: q.date }),
        receiptCell(x, rcpt.get(q.id), 'interest'),
        c(cu?.name ?? '—', { to: cu ? `/customers/${cu.id}` : undefined }),
        c(loan?.number ?? '—', { mono: true, to: loan ? `/loans/${loan.id}` : undefined }),
        money(x, q.interest),
        money(x, q.principal),
        money(x, q.interest + q.principal, { strong: true }),
        c(t(`method.${q.method}`)),
      ];
    }),
    foot: pays.length ? [c(t('common.total'), { strong: true }), c(''), c(''), c(''), money(x, interest, { strong: true }), money(x, principal, { strong: true }), money(x, interest + principal, { strong: true }), c('')] : undefined,
    empty: t('rep.empty.payments'),
  });

  return base(x, 'collections', {
    meta: [{ label: t('rep.m.period'), value: periodText(x) }, { label: t('rep.m.asOf'), value: f.date(x.today) }],
    kpis: [
      { label: t('rep.k.collected'), value: f.money(interest + principal), tone: 'gold' },
      { label: t('rep.k.interest'), value: f.money(interest) },
      { label: t('rep.k.principal'), value: f.money(principal) },
      { label: t('rep.k.payments'), value: f.n(pays.length) },
    ],
    sections,
    landscape: true,
    fileBase: 'collections',
  });
}

// ---- interest collected ------------------------------------------------------
function interestReport(x: Ctx): Report {
  const { db, t, f, p } = x;
  const pays = db.payments.filter((q) => q.interest > 0 && inRange(q.date, p)).sort(byDateAsc);
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const customers = new Map(db.customers.map((cu) => [cu.id, cu]));
  const rcpt = receiptsByPayment(db);
  const total = sum(pays.map((q) => q.interest));

  const sections: Section[] = [];
  const months = [...new Set(pays.map((q) => monthKey(q.date)))];
  if (months.length > 1) {
    sections.push({
      id: 'months',
      title: t('rep.s.byMonth'),
      cols: [{ label: t('rep.c.month'), weight: 2 }, { label: t('rep.c.payments'), align: 'r' }, { label: t('rep.c.interest'), align: 'r', weight: 1.4 }],
      rows: months.map((k) => {
        const list = pays.filter((q) => monthKey(q.date) === k);
        return [c(f.monthYear(k), { v: k }), count(x, list.length), money(x, sum(list.map((q) => q.interest)), { strong: true })];
      }),
      foot: [c(t('common.total'), { strong: true }), count(x, pays.length, { strong: true }), money(x, total, { strong: true })],
    });
  }
  sections.push({
    id: 'payments',
    title: t('rep.s.interestPayments'),
    cols: [{ label: t('rep.c.date'), weight: 1.3 }, { label: t('rep.c.receipt'), weight: 2 }, { label: t('rep.c.customer'), weight: 2.2 }, { label: t('rep.c.loan'), weight: 1.8 }, { label: t('rep.c.interest'), align: 'r', weight: 1.3 }, { label: t('rep.c.method'), weight: 1.2 }],
    rows: pays.map((q) => {
      const loan = loans.get(q.loanId);
      const cu = customers.get(q.customerId);
      return [
        c(f.date(q.date), { v: q.date }),
        receiptCell(x, rcpt.get(q.id), 'interest'),
        c(cu?.name ?? '—', { to: cu ? `/customers/${cu.id}` : undefined }),
        c(loan?.number ?? '—', { mono: true, to: loan ? `/loans/${loan.id}` : undefined }),
        money(x, q.interest, { strong: true }),
        c(t(`method.${q.method}`)),
      ];
    }),
    foot: pays.length ? [c(t('common.total'), { strong: true }), c(''), c(''), c(''), money(x, total, { strong: true }), c('')] : undefined,
    empty: t('rep.empty.interest'),
  });

  return base(x, 'interest', {
    meta: [{ label: t('rep.m.period'), value: periodText(x) }, { label: t('rep.m.asOf'), value: f.date(x.today) }],
    kpis: [
      { label: t('rep.k.interestCollected'), value: f.money(total), tone: 'gold' },
      { label: t('rep.k.payments'), value: f.n(pays.length) },
      { label: t('rep.k.average'), value: f.money(pays.length ? Math.round(total / pays.length) : 0) },
    ],
    sections,
    fileBase: 'interest-collected',
  });
}

// ---- disbursement ----------------------------------------------------------------
function disbursement(x: Ctx): Report {
  const { t, f, p } = x;
  const list = x.rows.filter((r) => inRange(r.loan.disbursedOn, p)).sort((a, b) => b.loan.disbursedOn.localeCompare(a.loan.disbursedOn) || b.loan.createdAt.localeCompare(a.loan.createdAt));
  const total = sum(list.map((r) => r.loan.principal));

  const sections: Section[] = [];
  const months = [...new Set(list.map((r) => monthKey(r.loan.disbursedOn)))].sort().reverse();
  if (months.length > 1) {
    sections.push({
      id: 'months',
      title: t('rep.s.byMonth'),
      cols: [{ label: t('rep.c.month'), weight: 2 }, { label: t('rep.c.loansIssued'), align: 'r' }, { label: t('rep.c.disbursed'), align: 'r', weight: 1.5 }],
      rows: months.map((k) => {
        const m = list.filter((r) => monthKey(r.loan.disbursedOn) === k);
        return [c(f.monthYear(k), { v: k }), count(x, m.length), money(x, sum(m.map((r) => r.loan.principal)), { strong: true })];
      }),
      foot: [c(t('common.total'), { strong: true }), count(x, list.length, { strong: true }), money(x, total, { strong: true })],
    });
  }
  sections.push({
    id: 'loans',
    title: t('rep.s.loansIssued'),
    cols: [{ label: t('rep.c.date'), weight: 1.2 }, { label: t('rep.c.loan'), weight: 1.8 }, { label: t('rep.c.customer'), weight: 2.2 }, { label: t('rep.c.principal'), align: 'r', weight: 1.4 }, { label: t('rep.c.rate'), align: 'r', weight: 0.9 }, { label: t('rep.c.term'), align: 'r', weight: 1 }, { label: t('rep.c.items'), align: 'r', weight: 0.8 }, { label: t('rep.c.status'), weight: 1 }],
    rows: list.map((r) => [
      c(f.date(r.loan.disbursedOn), { v: r.loan.disbursedOn }),
      c(r.loan.number, { mono: true, to: `/loans/${r.loan.id}` }),
      c(r.customer.name, { to: `/customers/${r.customer.id}` }),
      money(x, r.loan.principal, { strong: true }),
      c(f.pct(r.loan.rate), { v: r.loan.rate }),
      c(t('rep.v.months', { n: r.loan.termMonths }), { v: r.loan.termMonths }),
      count(x, r.items.length),
      c(stateText(x, r.state), { tone: stateTone(r.state) }),
    ]),
    foot: list.length ? [c(t('common.total'), { strong: true }), c(''), c(''), money(x, total, { strong: true }), c(''), c(''), count(x, sum(list.map((r) => r.items.length)), { strong: true }), c('')] : undefined,
    empty: t('rep.empty.loans'),
  });

  const biggest = list.reduce((m, r) => Math.max(m, r.loan.principal), 0);
  return base(x, 'disbursement', {
    meta: [{ label: t('rep.m.period'), value: periodText(x) }, { label: t('rep.m.asOf'), value: f.date(x.today) }],
    kpis: [
      { label: t('rep.k.disbursed'), value: f.money(total), tone: 'gold' },
      { label: t('rep.k.loans'), value: f.n(list.length) },
      { label: t('rep.k.avgLoan'), value: f.money(list.length ? Math.round(total / list.length) : 0) },
      { label: t('rep.k.largest'), value: f.money(biggest) },
    ],
    sections,
    landscape: true,
    fileBase: 'loans-disbursed',
  });
}

// ---- outstanding interest -----------------------------------------------------------
function outstanding(x: Ctx): Report {
  const { t, f } = x;
  const active = x.rows.filter((r) => r.loan.status === 'active').sort((a, b) => b.calc.interestOutstanding - a.calc.interestOutstanding || a.loan.number.localeCompare(b.loan.number));
  const charged = (r: LoanRow) => r.calc.interestAccrued + r.calc.adjustments;
  const due = sum(active.map((r) => r.calc.interestOutstanding));
  const prin = sum(active.map((r) => r.calc.principalOutstanding));

  const section: Section = {
    id: 'loans',
    title: t('rep.s.activeLoans'),
    note: t('rep.n.charged'),
    cols: [{ label: t('rep.c.customer'), weight: 2.2 }, { label: t('rep.c.loan'), weight: 1.8 }, { label: t('rep.c.rate'), align: 'r', weight: 0.8 }, { label: t('rep.c.months'), align: 'r', weight: 0.8 }, { label: t('rep.c.charged'), align: 'r', weight: 1.2 }, { label: t('rep.c.paid'), align: 'r', weight: 1.2 }, { label: t('rep.c.interestDue'), align: 'r', weight: 1.3 }, { label: t('rep.c.principalDue'), align: 'r', weight: 1.3 }, { label: t('rep.c.totalDue'), align: 'r', weight: 1.4 }],
    rows: active.map((r) => [
      c(r.customer.name, { to: `/customers/${r.customer.id}` }),
      c(r.loan.number, { mono: true, to: `/loans/${r.loan.id}` }),
      c(f.pct(r.loan.rate), { v: r.loan.rate }),
      count(x, r.calc.months.chargeable),
      money(x, charged(r)),
      money(x, r.calc.interestPaid),
      money(x, r.calc.interestOutstanding, { strong: true, tone: r.calc.interestOutstanding > 0 ? undefined : 'muted' }),
      money(x, r.calc.principalOutstanding),
      money(x, r.calc.totalOutstanding, { strong: true }),
    ]),
    foot: active.length ? [c(t('common.total'), { strong: true }), c(''), c(''), c(''), money(x, sum(active.map(charged)), { strong: true }), money(x, sum(active.map((r) => r.calc.interestPaid)), { strong: true }), money(x, due, { strong: true }), money(x, prin, { strong: true }), money(x, due + prin, { strong: true })] : undefined,
    empty: t('rep.empty.active'),
  };
  return base(x, 'outstanding', {
    kpis: [
      { label: t('rep.k.interestDue'), value: f.money(due), tone: 'gold' },
      { label: t('rep.k.principalDue'), value: f.money(prin) },
      { label: t('rep.k.totalDue'), value: f.money(due + prin) },
      { label: t('rep.k.activeLoans'), value: f.n(active.length) },
    ],
    sections: [section],
    landscape: true,
    fileBase: 'outstanding-interest',
  });
}

// ---- overdue --------------------------------------------------------------------------
const BUCKETS: { id: 'd30' | 'd60' | 'd90' | 'd90p'; max: number }[] = [
  { id: 'd30', max: 30 },
  { id: 'd60', max: 60 },
  { id: 'd90', max: 90 },
  { id: 'd90p', max: Infinity },
];

function overdue(x: Ctx): Report {
  const { t, f } = x;
  const list = x.rows.filter((r) => r.state === 'overdue').sort((a, b) => b.daysOverdue - a.daysOverdue || b.calc.totalOutstanding - a.calc.totalOutstanding);
  const prin = sum(list.map((r) => r.calc.principalOutstanding));
  const due = sum(list.map((r) => r.calc.interestOutstanding));

  const buckets = BUCKETS.map((b, i) => {
    const min = i === 0 ? 1 : BUCKETS[i - 1].max + 1;
    const hit = list.filter((r) => r.daysOverdue >= min && r.daysOverdue <= b.max);
    return { b, hit };
  });
  const aging: Section = {
    id: 'aging',
    title: t('rep.s.aging'),
    cols: [{ label: t('rep.c.bucket'), weight: 2 }, { label: t('rep.c.loans'), align: 'r' }, { label: t('rep.c.principalDue'), align: 'r', weight: 1.4 }, { label: t('rep.c.interestDue'), align: 'r', weight: 1.4 }, { label: t('rep.c.totalDue'), align: 'r', weight: 1.4 }],
    rows: buckets.map(({ b, hit }) => [
      c(t(`rep.age.${b.id}`)),
      count(x, hit.length),
      money(x, sum(hit.map((r) => r.calc.principalOutstanding))),
      money(x, sum(hit.map((r) => r.calc.interestOutstanding))),
      money(x, sum(hit.map((r) => r.calc.totalOutstanding)), { strong: true }),
    ]),
    foot: [c(t('common.total'), { strong: true }), count(x, list.length, { strong: true }), money(x, prin, { strong: true }), money(x, due, { strong: true }), money(x, prin + due, { strong: true })],
  };
  const detail: Section = {
    id: 'loans',
    title: t('rep.s.overdueLoans'),
    cols: [{ label: t('rep.c.customer'), weight: 2.1 }, { label: t('rep.c.mobile'), weight: 1.5 }, { label: t('rep.c.loan'), weight: 1.7 }, { label: t('rep.c.matured'), weight: 1.2 }, { label: t('rep.c.daysLate'), align: 'r', weight: 0.9 }, { label: t('rep.c.principalDue'), align: 'r', weight: 1.3 }, { label: t('rep.c.interestDue'), align: 'r', weight: 1.3 }, { label: t('rep.c.totalDue'), align: 'r', weight: 1.4 }, { label: t('rep.c.netWeight'), align: 'r', weight: 1.1 }],
    rows: list.map((r) => [
      c(r.customer.name, { to: `/customers/${r.customer.id}` }),
      c(r.customer.mobile, { mono: true }),
      c(r.loan.number, { mono: true, to: `/loans/${r.loan.id}` }),
      c(f.date(r.loan.maturityDate), { v: r.loan.maturityDate }),
      count(x, r.daysOverdue, { tone: 'danger' }),
      money(x, r.calc.principalOutstanding),
      money(x, r.calc.interestOutstanding),
      money(x, r.calc.totalOutstanding, { strong: true }),
      weight(x, sum(r.items.filter((i) => i.status === 'in_custody').map((i) => i.netWeight))),
    ]),
    empty: t('rep.empty.overdue'),
  };
  return base(x, 'overdue', {
    kpis: [
      { label: t('rep.k.overdueLoans'), value: f.n(list.length), tone: list.length ? 'danger' : undefined },
      { label: t('rep.k.principalAtRisk'), value: f.money(prin) },
      { label: t('rep.k.interestDue'), value: f.money(due), tone: 'gold' },
      { label: t('rep.k.oldest'), value: list.length ? t('rep.v.days', { n: list[0].daysOverdue }) : '—' },
    ],
    sections: [aging, detail],
    landscape: true,
    fileBase: 'overdue-loans',
  });
}

// ---- gold in custody ----------------------------------------------------------------------
function custody(x: Ctx): Report {
  const { db, t, f } = x;
  const items = db.items.filter((i) => i.status === 'in_custody');
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const customers = new Map(db.customers.map((cu) => [cu.id, cu]));
  const net = sum(items.map((i) => i.netWeight));
  const value = sum(items.map((i) => i.valuation));
  const boxes = new Set(items.map((i) => slotKey(i.location))).size;

  const carats = [...new Set(items.map((i) => i.carat))].sort((a, b) => b - a);
  const cats = [...new Set(items.map((i) => i.category))];
  const byCarat: Section = {
    id: 'carat',
    title: t('rep.s.byCarat'),
    cols: [{ label: t('rep.c.carat'), weight: 1.4 }, { label: t('rep.c.items'), align: 'r', weight: 0.8 }, { label: t('rep.c.netWeight'), align: 'r', weight: 1.3 }, { label: t('rep.c.vori'), align: 'r', weight: 1.6 }, { label: t('rep.c.value'), align: 'r', weight: 1.4 }],
    rows: carats.map((k) => {
      const l = items.filter((i) => i.carat === k);
      const g = sum(l.map((i) => i.netWeight));
      return [c(t('dash.rate.carat', { n: k }), { v: k }), count(x, l.length), weight(x, g), c(f.vori(g)), money(x, sum(l.map((i) => i.valuation)), { strong: true })];
    }),
    foot: items.length ? [c(t('common.total'), { strong: true }), count(x, items.length, { strong: true }), weight(x, net, { strong: true }), c(f.vori(net), { strong: true }), money(x, value, { strong: true })] : undefined,
    empty: t('rep.empty.custody'),
  };
  const byCat: Section = {
    id: 'category',
    title: t('rep.s.byType'),
    cols: [{ label: t('rep.c.category'), weight: 1.4 }, { label: t('rep.c.items'), align: 'r', weight: 0.8 }, { label: t('rep.c.netWeight'), align: 'r', weight: 1.3 }, { label: t('rep.c.vori'), align: 'r', weight: 1.6 }, { label: t('rep.c.value'), align: 'r', weight: 1.4 }],
    rows: cats.map((k) => {
      const l = items.filter((i) => i.category === k);
      const g = sum(l.map((i) => i.netWeight));
      return [c(t(`cat.${k}.plural`)), count(x, l.length), weight(x, g), c(f.vori(g)), money(x, sum(l.map((i) => i.valuation)), { strong: true })];
    }),
    empty: t('rep.empty.custody'),
  };
  const sorted = [...items].sort((a, b) => a.location.vault.localeCompare(b.location.vault, undefined, { numeric: true }) || a.location.shelf.localeCompare(b.location.shelf, undefined, { numeric: true }) || a.location.box.localeCompare(b.location.box, undefined, { numeric: true }) || a.ref.localeCompare(b.ref));
  const list: Section = {
    id: 'items',
    title: t('rep.s.items'),
    cols: [{ label: t('rep.c.ref'), weight: 1.5 }, { label: t('rep.c.description'), weight: 2.6 }, { label: t('rep.c.category'), weight: 1.1 }, { label: t('rep.c.carat'), align: 'r', weight: 0.8 }, { label: t('rep.c.netWeight'), align: 'r', weight: 1.2 }, { label: t('rep.c.value'), align: 'r', weight: 1.3 }, { label: t('rep.c.where'), weight: 1.6 }, { label: t('rep.c.customer'), weight: 2 }, { label: t('rep.c.loan'), weight: 1.6 }],
    rows: sorted.map((i) => {
      const loan = loans.get(i.loanId);
      const cu = loan ? customers.get(loan.customerId) : undefined;
      return [
        c(i.ref, { mono: true, to: `/vault?item=${i.id}` }),
        c(i.description),
        c(t(`cat.${i.category}`)),
        c(f.digits(i.carat), { v: i.carat }),
        weight(x, i.netWeight),
        money(x, i.valuation),
        c(`${i.location.vault} · ${i.location.shelf} · ${i.location.box}`),
        c(cu?.name ?? '—', { to: cu ? `/customers/${cu.id}` : undefined }),
        c(loan?.number ?? '—', { mono: true, to: loan ? `/loans/${loan.id}` : undefined }),
      ];
    }),
    foot: items.length ? [c(t('common.total'), { strong: true }), c(''), c(''), c(''), weight(x, net, { strong: true }), money(x, value, { strong: true }), c(''), c(''), c('')] : undefined,
    empty: t('rep.empty.custody'),
  };
  return base(x, 'custody', {
    kpis: [
      { label: t('rep.k.items'), value: f.n(items.length) },
      { label: t('rep.k.netGold'), value: f.weight(net), sub: f.vori(net), tone: 'gold' },
      { label: t('rep.k.value'), value: f.money(value) },
      { label: t('rep.k.boxes'), value: f.n(boxes) },
    ],
    sections: [byCarat, byCat, list],
    landscape: true,
    fileBase: 'gold-in-custody',
  });
}

// ---- monthly summary -------------------------------------------------------------------------
function monthly(x: Ctx): Report {
  const { db, t, f } = x;
  const keys = lastMonthKeys(x.today, 12);
  const data = keys.map((k) => {
    const loans = db.loans.filter((l) => monthKey(l.disbursedOn) === k);
    const pays = db.payments.filter((q) => monthKey(q.date) === k);
    return {
      k,
      issued: loans.length,
      disbursed: sum(loans.map((l) => l.principal)),
      interest: sum(pays.map((q) => q.interest)),
      principal: sum(pays.map((q) => q.principal)),
      released: db.loans.filter((l) => l.closedOn && monthKey(l.closedOn) === k).length,
    };
  });
  const tot = {
    issued: sum(data.map((d) => d.issued)),
    disbursed: sum(data.map((d) => d.disbursed)),
    interest: sum(data.map((d) => d.interest)),
    principal: sum(data.map((d) => d.principal)),
    released: sum(data.map((d) => d.released)),
  };
  const best = data.reduce((m, d) => (d.interest > m.interest ? d : m), data[0]);
  const section: Section = {
    id: 'months',
    title: t('rep.s.lastMonths'),
    cols: [{ label: t('rep.c.month'), weight: 1.7 }, { label: t('rep.c.loansIssued'), align: 'r', weight: 1 }, { label: t('rep.c.disbursed'), align: 'r', weight: 1.4 }, { label: t('rep.c.interestCollected'), align: 'r', weight: 1.4 }, { label: t('rep.c.principalRepaid'), align: 'r', weight: 1.4 }, { label: t('rep.c.totalCollected'), align: 'r', weight: 1.4 }, { label: t('rep.c.released'), align: 'r', weight: 1 }],
    rows: [...data].reverse().map((d) => [
      c(f.monthYear(d.k), { v: d.k }),
      count(x, d.issued),
      money(x, d.disbursed),
      money(x, d.interest),
      money(x, d.principal),
      money(x, d.interest + d.principal, { strong: true }),
      count(x, d.released),
    ]),
    foot: [c(t('common.total'), { strong: true }), count(x, tot.issued, { strong: true }), money(x, tot.disbursed, { strong: true }), money(x, tot.interest, { strong: true }), money(x, tot.principal, { strong: true }), money(x, tot.interest + tot.principal, { strong: true }), count(x, tot.released, { strong: true })],
  };
  return base(x, 'monthly', {
    meta: [{ label: t('rep.m.period'), value: `${f.monthYear(keys[0])} – ${f.monthYear(keys[keys.length - 1])}` }, { label: t('rep.m.asOf'), value: f.date(x.today) }],
    kpis: [
      { label: t('rep.k.disbursed'), value: f.money(tot.disbursed), tone: 'gold' },
      { label: t('rep.k.interest'), value: f.money(tot.interest) },
      { label: t('rep.k.principal'), value: f.money(tot.principal) },
      { label: t('rep.k.bestMonth'), value: best && best.interest > 0 ? f.monthYear(best.k) : '—', sub: best && best.interest > 0 ? f.money(best.interest) : undefined },
    ],
    sections: [section],
    landscape: true,
    fileBase: 'monthly-summary',
  });
}

// ---- customer statement -----------------------------------------------------------------------------
function statement(x: Ctx): Report {
  const { db, t, f, p } = x;
  const cu = db.customers.find((q) => q.id === p.customerId);
  if (!cu) return base(x, 'statement', { needs: 'customer', fileBase: 'statement' });
  const rows = x.rows.filter((r) => r.customer.id === cu.id).sort((a, b) => b.loan.disbursedOn.localeCompare(a.loan.disbursedOn));
  const active = rows.filter((r) => r.loan.status === 'active');
  const pays = db.payments.filter((q) => q.customerId === cu.id && inRange(q.date, p)).sort(byDateAsc);
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const rcpt = receiptsByPayment(db);
  const interest = sum(pays.map((q) => q.interest));
  const principal = sum(pays.map((q) => q.principal));
  const prinDue = sum(active.map((r) => r.calc.principalOutstanding));
  const intDue = sum(active.map((r) => r.calc.interestOutstanding));

  const loansSection: Section = {
    id: 'loans',
    title: t('rep.s.customerLoans'),
    cols: [{ label: t('rep.c.loan'), weight: 1.7 }, { label: t('rep.c.opened'), weight: 1.5 }, { label: t('rep.c.principal'), align: 'r', weight: 1.2 }, { label: t('rep.c.rate'), align: 'r', weight: 0.7 }, { label: t('rep.c.matures'), weight: 1.5 }, { label: t('rep.c.status'), weight: 1 }, { label: t('rep.c.principalDue'), align: 'r', weight: 1.2 }, { label: t('rep.c.interestDue'), align: 'r', weight: 1.2 }],
    rows: rows.map((r) => {
      const open = r.loan.status === 'active';
      return [
        c(r.loan.number, { mono: true, to: `/loans/${r.loan.id}` }),
        c(f.date(r.loan.disbursedOn), { v: r.loan.disbursedOn }),
        money(x, r.loan.principal),
        c(f.pct(r.loan.rate), { v: r.loan.rate }),
        c(f.date(r.loan.maturityDate), { v: r.loan.maturityDate }),
        c(stateText(x, r.state), { tone: stateTone(r.state) }),
        open ? money(x, r.calc.principalOutstanding) : dash(),
        open ? money(x, r.calc.interestOutstanding, { strong: true }) : dash(),
      ];
    }),
    foot: rows.length ? [c(t('common.total'), { strong: true }), c(''), money(x, sum(rows.map((r) => r.loan.principal)), { strong: true }), c(''), c(''), c(''), money(x, prinDue, { strong: true }), money(x, intDue, { strong: true })] : undefined,
    empty: t('rep.empty.customerLoans'),
  };
  const paySection: Section = {
    id: 'payments',
    title: t('rep.s.payments'),
    cols: [{ label: t('rep.c.date'), weight: 1.2 }, { label: t('rep.c.receipt'), weight: 2 }, { label: t('rep.c.loan'), weight: 1.8 }, { label: t('rep.c.interest'), align: 'r', weight: 1.2 }, { label: t('rep.c.principal'), align: 'r', weight: 1.2 }, { label: t('rep.c.total'), align: 'r', weight: 1.2 }, { label: t('rep.c.method'), weight: 1.1 }],
    rows: pays.map((q) => {
      const loan = loans.get(q.loanId);
      return [
        c(f.date(q.date), { v: q.date }),
        receiptCell(x, rcpt.get(q.id), 'interest'),
        c(loan?.number ?? '—', { mono: true, to: loan ? `/loans/${loan.id}` : undefined }),
        money(x, q.interest),
        money(x, q.principal),
        money(x, q.interest + q.principal, { strong: true }),
        c(t(`method.${q.method}`)),
      ];
    }),
    foot: pays.length ? [c(t('common.total'), { strong: true }), c(''), c(''), money(x, interest, { strong: true }), money(x, principal, { strong: true }), money(x, interest + principal, { strong: true }), c('')] : undefined,
    empty: t('rep.empty.payments'),
  };
  return base(x, 'statement', {
    title: `${t('rep.r.statement.name')}: ${cu.name}`,
    meta: [
      { label: t('rep.m.customer'), value: `${cu.name} (${cu.code})` },
      { label: t('rep.m.mobile'), value: cu.mobile },
      { label: t('rep.m.address'), value: cu.address, wide: true },
      { label: t('rep.m.period'), value: periodText(x) },
      { label: t('rep.m.asOf'), value: f.date(x.today) },
    ],
    kpis: [
      { label: t('rep.k.loans'), value: f.n(rows.length), sub: t('rep.k.activeOf', { n: active.length }) },
      { label: t('rep.k.principalDue'), value: f.money(prinDue) },
      { label: t('rep.k.interestDue'), value: f.money(intDue), tone: 'gold' },
      { label: t('rep.k.repaid'), value: f.money(interest + principal) },
    ],
    sections: [loansSection, paySection],
    fileBase: `statement-${cu.code}`,
  });
}

// ---- reconciliation ------------------------------------------------------------------------------------
function reconcile(x: Ctx): Report {
  const { db, t, f, today } = x;
  const pf = portfolio(db, x.rows, today);
  const monthStart = `${monthKey(today)}-01`;
  const monthEnd = endOfMonth(monthStart);
  const rc = (type: Receipt['type']) => db.receipts.filter((r) => r.type === type);

  interface Check {
    label: string;
    a: number;
    b: number;
    money?: boolean;
    aLabel?: string;
  }
  const result = (k: Check): Cell[] => {
    const diff = k.a - k.b;
    const ok = diff === 0;
    const show = (n: number) => (k.money ? f.money(n) : f.n(n));
    return [c(k.label), c(show(k.a), { v: k.a }), c(show(k.b), { v: k.b }), c(diff === 0 ? show(0) : k.money ? f.signedMoney(diff) : `${diff > 0 ? '+' : '−'}${f.n(Math.abs(diff))}`, { v: diff, tone: ok ? 'muted' : 'danger' }), c(ok ? t('rep.rc.matches') : t('rep.rc.differs'), { tone: ok ? 'ok' : 'danger', strong: true, v: ok ? 'OK' : 'DIFF' })];
  };

  const active = db.loans.filter((l) => l.status === 'active' && !l.closedOn);
  const dash: Check[] = [
    { label: t('dash.m.customers'), a: pf.totalCustomers, b: new Set(db.customers.map((cu) => cu.id)).size },
    { label: t('dash.m.active'), a: pf.activeLoans, b: active.length },
    { label: t('dash.m.disbursed'), a: pf.totalDisbursed, b: db.loans.reduce((s, l) => s + l.principal, 0), money: true },
    { label: t('dash.m.collected'), a: pf.interestCollectedThisMonth, b: sum(db.payments.filter((q) => cmpISO(q.date, monthStart) >= 0 && cmpISO(q.date, monthEnd) <= 0).map((q) => q.interest)), money: true },
    { label: t('dash.m.outstanding'), a: pf.outstandingInterest, b: sum(active.map((l) => calcLoan(db, l, today).interestOutstanding)), money: true },
    { label: t('dash.m.overdue'), a: pf.overdueCount, b: active.filter((l) => cmpISO(today, l.maturityDate) > 0).length },
  ];

  const paysAll = db.payments.filter((q) => cmpISO(q.date, today) <= 0);
  const activeIds = new Set(active.map((l) => l.id));
  const ledger: Check[] = [
    { label: t('rep.rc.loansVsNl'), a: db.loans.length, b: rc('new_loan').length },
    { label: t('rep.rc.principalVsNl'), a: db.loans.reduce((s, l) => s + l.principal, 0), b: sum(rc('new_loan').map((r) => r.amount)), money: true },
    { label: t('rep.rc.interestVsIc'), a: sum(paysAll.map((q) => q.interest)), b: sum(rc('interest').map((r) => r.amount)), money: true },
    { label: t('rep.rc.principalRepaidVsPr'), a: sum(paysAll.map((q) => q.principal)), b: sum(rc('principal').map((r) => r.amount)), money: true },
    { label: t('rep.rc.releasedVsPl'), a: db.loans.filter((l) => l.status === 'released').length, b: rc('release').length },
    { label: t('rep.rc.principalOutstanding'), a: sum(x.rows.filter((r) => r.loan.status === 'active').map((r) => r.calc.principalOutstanding)), b: sum(active.map((l) => l.principal)) - sum(paysAll.filter((q) => activeIds.has(q.loanId)).map((q) => q.principal)), money: true },
    { label: t('rep.rc.interestPaidCalc'), a: sum(x.rows.map((r) => r.calc.interestPaid)), b: sum(paysAll.map((q) => q.interest)), money: true },
    { label: t('rep.rc.custodyActive'), a: db.items.filter((i) => i.status === 'in_custody' && !activeIds.has(i.loanId)).length, b: 0 },
    { label: t('rep.rc.emptyActive'), a: active.filter((l) => !db.items.some((i) => i.loanId === l.id && i.status === 'in_custody')).length, b: 0 },
    { label: t('rep.rc.custodyValue'), a: pf.custodyValuation, b: sum(db.items.filter((i) => i.status === 'in_custody').map((i) => i.valuation)), money: true },
  ];

  const head = (first: string, a: string, b: string): Col[] => [{ label: first, weight: 4.6 }, { label: a, align: 'r', weight: 1.6 }, { label: b, align: 'r', weight: 1.6 }, { label: t('rep.rc.colDiff'), align: 'r', weight: 1 }, { label: t('rep.rc.colResult'), weight: 1.1 }];
  const dashRows = dash.map(result);
  const ledgerRows = ledger.map(result);
  const all = [...dashRows, ...ledgerRows];
  const ok = all.filter((r) => r[4].v === 'OK').length;

  return base(x, 'reconcile', {
    kpis: [
      { label: t('rep.k.checks'), value: f.n(all.length) },
      { label: t('rep.k.matched'), value: f.n(ok), tone: 'ok' },
      { label: t('rep.k.differs'), value: f.n(all.length - ok), tone: all.length - ok ? 'danger' : undefined },
    ],
    sections: [
      { id: 'dash', title: t('rep.s.dashFigures'), note: t('rep.n.dashFigures'), cols: head(t('rep.rc.colFigure'), t('rep.rc.dashA'), t('rep.rc.dashB')), rows: dashRows },
      { id: 'ledger', title: t('rep.s.ledgerChecks'), note: t('rep.n.ledgerChecks'), cols: head(t('rep.rc.colCheck'), t('rep.rc.ledgerA'), t('rep.rc.ledgerB')), rows: ledgerRows },
    ],
    fileBase: 'reconciliation',
  });
}

// ---- entry point ---------------------------------------------------------------------------------------------
export function buildReport(id: ReportId, db: Database, p: Params, lang: Lang, today: ISODate, rows?: LoanRow[]): Report {
  const x: Ctx = { db, today, lang, t: makeT(lang), f: makeFmt(lang), p, rows: rows ?? loanRows(db, today) };
  switch (id) {
    case 'collections': return collections(x);
    case 'interest': return interestReport(x);
    case 'disbursement': return disbursement(x);
    case 'outstanding': return outstanding(x);
    case 'overdue': return overdue(x);
    case 'custody': return custody(x);
    case 'monthly': return monthly(x);
    case 'statement': return statement(x);
    case 'reconcile': return reconcile(x);
  }
}

/** Rows for a CSV file: every section in turn, with raw numbers. */
export function reportCsv(r: Report, generated: string): (string | number)[][] {
  const out: (string | number)[][] = [[r.title], [r.subtitle], ...r.meta.map((m) => [m.label, m.value]), [generated], []];
  if (r.kpis.length) {
    for (const k of r.kpis) out.push([k.label, k.value]);
    out.push([]);
  }
  for (const s of r.sections) {
    if (s.title) out.push([s.title]);
    out.push(s.cols.map((col) => col.label));
    for (const row of s.rows) out.push(row.map((cell) => cell.v ?? cell.text));
    if (s.foot) out.push(s.foot.map((cell) => cell.v ?? cell.text));
    out.push([]);
  }
  return out;
}
