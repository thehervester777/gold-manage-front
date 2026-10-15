/**
 * Read-side helpers. Every figure the dashboard and reports show is computed here
 * from the stored records — nothing is cached or hard-coded.
 */
import type { Customer, Database, GoldItem, Loan, Payment } from './types';
import { type ISODate, addDays, addMonths, cmpISO, diffDays, endOfMonth, lastMonthKeys, localDateOf, monthKey, startOfMonth } from './dates';
import type { Calculation } from './interest';
import { calcLoan, daysOverdue, loanState, type LoanState } from './domain';

export interface LoanRow {
  loan: Loan;
  customer: Customer;
  calc: Calculation;
  state: LoanState;
  daysOverdue: number;
  items: GoldItem[];
}

export function loanRows(db: Database, today: ISODate): LoanRow[] {
  const customers = new Map(db.customers.map((c) => [c.id, c]));
  const itemsByLoan = new Map<string, GoldItem[]>();
  for (const i of db.items) {
    const list = itemsByLoan.get(i.loanId);
    if (list) list.push(i);
    else itemsByLoan.set(i.loanId, [i]);
  }
  const rows: LoanRow[] = [];
  for (const loan of db.loans) {
    const customer = customers.get(loan.customerId);
    if (!customer) continue;
    rows.push({
      loan,
      customer,
      calc: calcLoan(db, loan, today),
      state: loanState(loan, today),
      daysOverdue: daysOverdue(loan, today),
      items: itemsByLoan.get(loan.id) ?? [],
    });
  }
  return rows;
}

export interface CaratBucket {
  carat: number;
  count: number;
  netWeight: number;
  valuation: number;
}

export interface Portfolio {
  totalCustomers: number;
  newCustomersThisMonth: number;
  activeLoans: number;
  newLoansThisMonth: number;
  totalDisbursed: number;
  interestCollectedThisMonth: number;
  interestCollectedYear: number;
  outstandingInterest: number;
  overdueCount: number;
  principalOutstanding: number;
  principalRepaid: number;
  custodyItems: number;
  custodyWeight: number;
  custodyValuation: number;
  byCarat: CaratBucket[];
  byCategory: { category: string; count: number; netWeight: number }[];
}

export function portfolio(db: Database, rows: LoanRow[], today: ISODate): Portfolio {
  const month = monthKey(today);
  const year = today.slice(0, 4);
  const active = rows.filter((r) => r.loan.status === 'active');
  const inCustody = db.items.filter((i) => i.status === 'in_custody');

  const caratMap = new Map<number, CaratBucket>();
  for (const i of inCustody) {
    const b = caratMap.get(i.carat) ?? { carat: i.carat, count: 0, netWeight: 0, valuation: 0 };
    b.count += 1;
    b.netWeight += i.netWeight;
    b.valuation += i.valuation;
    caratMap.set(i.carat, b);
  }
  const catMap = new Map<string, { category: string; count: number; netWeight: number }>();
  for (const i of inCustody) {
    const b = catMap.get(i.category) ?? { category: i.category, count: 0, netWeight: 0 };
    b.count += 1;
    b.netWeight += i.netWeight;
    catMap.set(i.category, b);
  }

  return {
    totalCustomers: db.customers.length,
    newCustomersThisMonth: db.customers.filter((c) => c.createdAt.slice(0, 7) === month).length,
    activeLoans: active.length,
    newLoansThisMonth: db.loans.filter((l) => monthKey(l.disbursedOn) === month).length,
    totalDisbursed: db.loans.reduce((s, l) => s + l.principal, 0),
    interestCollectedThisMonth: db.payments.filter((p) => monthKey(p.date) === month).reduce((s, p) => s + p.interest, 0),
    interestCollectedYear: db.payments.filter((p) => p.date.slice(0, 4) === year).reduce((s, p) => s + p.interest, 0),
    outstandingInterest: active.reduce((s, r) => s + r.calc.interestOutstanding, 0),
    overdueCount: active.filter((r) => r.state === 'overdue').length,
    principalOutstanding: active.reduce((s, r) => s + r.calc.principalOutstanding, 0),
    principalRepaid: db.payments.reduce((s, p) => s + p.principal, 0),
    custodyItems: inCustody.length,
    custodyWeight: inCustody.reduce((s, i) => s + i.netWeight, 0),
    custodyValuation: inCustody.reduce((s, i) => s + i.valuation, 0),
    byCarat: [...caratMap.values()].sort((a, b) => b.carat - a.carat),
    byCategory: [...catMap.values()].sort((a, b) => b.netWeight - a.netWeight),
  };
}

export interface MonthPoint {
  key: string;
  disbursed: number;
  interest: number;
  principalIn: number;
}

export function monthlySeries(db: Database, today: ISODate, n = 12): MonthPoint[] {
  const keys = lastMonthKeys(today, n);
  const map = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, disbursed: 0, interest: 0, principalIn: 0 }]));
  for (const l of db.loans) {
    const p = map.get(monthKey(l.disbursedOn));
    if (p) p.disbursed += l.principal;
  }
  for (const pay of db.payments) {
    const p = map.get(monthKey(pay.date));
    if (p) {
      p.interest += pay.interest;
      p.principalIn += pay.principal;
    }
  }
  return keys.map((k) => map.get(k)!);
}

/** Month-end values for the small trend lines on the dashboard tiles. */
export interface KpiTrend {
  customers: number[];
  active: number[];
  disbursed: number[];
  collected: number[];
  outstanding: number[];
  overdue: number[];
}

export function kpiTrend(db: Database, today: ISODate, n = 8): KpiTrend {
  const keys = lastMonthKeys(today, n);
  const t: KpiTrend = { customers: [], active: [], disbursed: [], collected: [], outstanding: [], overdue: [] };
  for (const key of keys) {
    const monthEnd = cmpISO(endOfMonth(`${key}-01`), today) > 0 ? today : endOfMonth(`${key}-01`);
    t.customers.push(db.customers.filter((c) => localDateOf(c.createdAt) <= monthEnd).length);
    t.disbursed.push(db.loans.filter((l) => cmpISO(l.disbursedOn, monthEnd) <= 0).reduce((s, l) => s + l.principal, 0));
    t.collected.push(db.payments.filter((p) => monthKey(p.date) === key).reduce((s, p) => s + p.interest, 0));
    let active = 0;
    let overdue = 0;
    let outstanding = 0;
    for (const l of db.loans) {
      if (cmpISO(l.disbursedOn, monthEnd) > 0) continue;
      if (l.closedOn && cmpISO(l.closedOn, monthEnd) <= 0) continue;
      active += 1;
      if (cmpISO(monthEnd, l.maturityDate) > 0) overdue += 1;
      outstanding += calcLoan(db, { ...l, status: 'active' }, monthEnd).interestOutstanding;
    }
    t.active.push(active);
    t.overdue.push(overdue);
    t.outstanding.push(outstanding);
  }
  return t;
}

/** "Due soon" means maturing within this many days, on the dashboard card and in the loans list alike. */
export const DUE_SOON_DAYS = 30;

export function maturingSoon(rows: LoanRow[], today: ISODate, days = DUE_SOON_DAYS): (LoanRow & { inDays: number })[] {
  const horizon = addDays(today, days);
  return rows
    .filter((r) => r.loan.status === 'active' && cmpISO(r.loan.maturityDate, today) >= 0 && cmpISO(r.loan.maturityDate, horizon) <= 0)
    .map((r) => ({ ...r, inDays: diffDays(today, r.loan.maturityDate) }))
    .sort((a, b) => a.inDays - b.inDays);
}

/** An active loan that matures within the next `days` days. */
export const isDueSoon = (r: LoanRow, today: ISODate, days = DUE_SOON_DAYS) =>
  r.state === 'active' && cmpISO(r.loan.maturityDate, today) >= 0 && diffDays(today, r.loan.maturityDate) <= days;

export const overdueRows = (rows: LoanRow[]) =>
  rows.filter((r) => r.state === 'overdue').sort((a, b) => b.daysOverdue - a.daysOverdue);

/** Customer-level roll-up used by the customers list. */
export interface CustomerRow {
  customer: Customer;
  loans: number;
  activeLoans: number;
  overdue: number;
  principalOutstanding: number;
  interestOutstanding: number;
  lastActivity: string;
}

export function customerRows(db: Database, rows: LoanRow[]): CustomerRow[] {
  const byCustomer = new Map<string, LoanRow[]>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer.id);
    if (list) list.push(r);
    else byCustomer.set(r.customer.id, [r]);
  }
  const lastPay = new Map<string, string>();
  for (const p of db.payments) {
    const cur = lastPay.get(p.customerId);
    if (!cur || p.createdAt > cur) lastPay.set(p.customerId, p.createdAt);
  }
  return db.customers.map((customer) => {
    const list = byCustomer.get(customer.id) ?? [];
    const active = list.filter((r) => r.loan.status === 'active');
    const loanStamps = list.map((r) => r.loan.createdAt);
    const stamps = [customer.updatedAt, lastPay.get(customer.id) ?? '', ...loanStamps].filter(Boolean);
    return {
      customer,
      loans: list.length,
      activeLoans: active.length,
      overdue: active.filter((r) => r.state === 'overdue').length,
      principalOutstanding: active.reduce((s, r) => s + r.calc.principalOutstanding, 0),
      interestOutstanding: active.reduce((s, r) => s + r.calc.interestOutstanding, 0),
      lastActivity: stamps.sort().at(-1) ?? customer.createdAt,
    };
  });
}

export function paymentsInMonth(payments: Payment[], key: string) {
  return payments.filter((p) => monthKey(p.date) === key);
}

export { addMonths, startOfMonth };
