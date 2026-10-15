/**
 * Interest engine — implements section 4 of the Ithika Gold House requirements.
 *
 *  - Interest starts on the disbursement date.
 *  - Every month is treated as 30 days (30/360 day count: months are counted
 *    between calendar dates, and a month is always worth 30 days when borrowing).
 *  - Holding a pledge for any part of a month costs one full month.
 *  - After a full month, 1–3 extra days do not add a month.
 *  - From 4 extra days, one more full month is added.
 *  - Partial principal repayments lower the interest base only for months that
 *    have not been charged yet (or never, if the policy says "original principal").
 *
 * Everything here is a pure function so it can be unit-tested and re-run by
 * staff as a manual check.
 */
import { type ISODate, addDays, addMonths, cmpISO, parseISO } from './dates';

export const MONTH_DAYS = 30;

export type PartialBase = 'remaining' | 'original';

export interface InterestPolicy {
  /** Extra days after a full month that do not add another month (default 3). */
  graceDays: number;
  /** Minimum chargeable months for any pledge held at all (default 1). */
  minMonths: number;
  /** Which principal later months are charged on after a partial repayment. */
  partialBase: PartialBase;
}

export const DEFAULT_POLICY: InterestPolicy = {
  graceDays: 3,
  minMonths: 1,
  partialBase: 'remaining',
};

export type MonthRule = 'minimum' | 'exact' | 'grace' | 'threshold' | 'none';

export interface MonthCount {
  /** Whole months between the two dates (30/360 basis). */
  fullMonths: number;
  /** Days left over after the whole months (0–29). */
  extraDays: number;
  /** Months of interest payable. */
  chargeable: number;
  /** Which rule decided the result. */
  rule: MonthRule;
  /** Elapsed time expressed in 30-day-month days. */
  thirtyDayTotal: number;
}

/**
 * The month rule on its own: whole months and extra days in, months of interest out.
 * `countMonths` uses it for real dates; the Interest rules screen uses it to show the rule day by day.
 */
export function chargeableMonths(
  fullMonths: number,
  extraDays: number,
  policy: InterestPolicy = DEFAULT_POLICY,
): { chargeable: number; rule: MonthRule } {
  const floor = Math.max(1, policy.minMonths);
  let chargeable: number;
  let rule: MonthRule;
  if (fullMonths === 0) {
    chargeable = floor;
    rule = 'minimum';
  } else if (extraDays === 0) {
    chargeable = fullMonths;
    rule = 'exact';
  } else if (extraDays <= policy.graceDays) {
    chargeable = fullMonths;
    rule = 'grace';
  } else {
    chargeable = fullMonths + 1;
    rule = 'threshold';
  }
  // The minimum is a floor: holding a pledge longer can never cost fewer months than holding it briefly.
  if (chargeable < floor) return { chargeable: floor, rule: 'minimum' };
  return { chargeable, rule };
}

export function countMonths(
  start: ISODate,
  end: ISODate,
  policy: InterestPolicy = DEFAULT_POLICY,
): MonthCount {
  if (cmpISO(end, start) < 0) {
    return { fullMonths: 0, extraDays: 0, chargeable: 0, rule: 'none', thirtyDayTotal: 0 };
  }
  const a = parseISO(start);
  const b = parseISO(end);
  const d1 = Math.min(a.d, MONTH_DAYS);
  const d2 = Math.min(b.d, MONTH_DAYS);
  let fullMonths = (b.y - a.y) * 12 + (b.m - a.m);
  let extraDays = d2 - d1;
  if (extraDays < 0) {
    fullMonths -= 1;
    extraDays += MONTH_DAYS;
  }
  if (fullMonths < 0) {
    fullMonths = 0;
    extraDays = 0;
  }
  const thirtyDayTotal = fullMonths * MONTH_DAYS + extraDays;

  const { chargeable, rule } = chargeableMonths(fullMonths, extraDays, policy);
  return { fullMonths, extraDays, chargeable, rule, thirtyDayTotal };
}

export interface PrincipalPayment {
  date: ISODate;
  amount: number;
}

export interface CalcInput {
  start: ISODate;
  asOf: ISODate;
  principal: number;
  /** Percent per month. */
  rate: number;
  principalPayments: PrincipalPayment[];
  /** Interest portions already paid (up to `asOf`). */
  interestPaid: number;
  /** Signed manual adjustments to accrued interest (waivers are negative). */
  adjustments: number;
  policy: InterestPolicy;
}

export interface CalcPeriod {
  index: number;
  from: ISODate;
  to: ISODate;
  /** Principal this month's interest is charged on. */
  basis: number;
  interest: number;
  /** True when the basis was lowered by an earlier principal repayment. */
  reduced: boolean;
}

export interface Calculation {
  start: ISODate;
  asOf: ISODate;
  rate: number;
  principal: number;
  principalRepaid: number;
  principalOutstanding: number;
  months: MonthCount;
  periods: CalcPeriod[];
  interestAccrued: number;
  adjustments: number;
  interestPaid: number;
  interestOutstanding: number;
  /** Interest paid beyond what is owed (should stay 0). */
  interestCredit: number;
  totalOutstanding: number;
  /** First date on which another month of interest would be added. */
  nextMonthOn: ISODate;
  policy: InterestPolicy;
}

/** Interest for one month on one principal, rounded to the nearest taka. */
export function monthlyInterest(basis: number, rate: number): number {
  return Math.round((basis * rate) / 100 + 1e-9);
}

export function calculate(input: CalcInput): Calculation {
  const { start, asOf, principal, rate, policy } = input;
  const months = countMonths(start, asOf, policy);
  const pays = input.principalPayments
    .filter((p) => cmpISO(p.date, asOf) <= 0 && p.amount > 0)
    .sort((x, y) => cmpISO(x.date, y.date));
  const principalRepaid = pays.reduce((s, p) => s + p.amount, 0);

  // For every repayment, how many months had already been charged on that day.
  const chargedAtPayment = pays.map((p) => countMonths(start, p.date, policy).chargeable);

  const periods: CalcPeriod[] = [];
  for (let k = 1; k <= months.chargeable; k++) {
    let basis = principal;
    if (policy.partialBase === 'remaining') {
      pays.forEach((p, i) => {
        if (chargedAtPayment[i] < k) basis -= p.amount;
      });
    }
    basis = Math.max(0, basis);
    periods.push({
      index: k,
      from: addMonths(start, k - 1),
      to: addMonths(start, k),
      basis,
      interest: monthlyInterest(basis, rate),
      reduced: basis < principal,
    });
  }

  const interestAccrued = periods.reduce((s, p) => s + p.interest, 0);
  const owed = interestAccrued + input.adjustments;
  const interestOutstanding = Math.max(0, owed - input.interestPaid);
  const interestCredit = Math.max(0, input.interestPaid - owed);
  const principalOutstanding = Math.max(0, principal - principalRepaid);

  return {
    start,
    asOf,
    rate,
    principal,
    principalRepaid,
    principalOutstanding,
    months,
    periods,
    interestAccrued,
    adjustments: input.adjustments,
    interestPaid: input.interestPaid,
    interestOutstanding,
    interestCredit,
    totalOutstanding: principalOutstanding + interestOutstanding,
    nextMonthOn: nextMonthDate(start, asOf, policy),
    policy,
  };
}

/** The first date after `asOf` on which one more month of interest becomes payable. */
export function nextMonthDate(start: ISODate, asOf: ISODate, policy: InterestPolicy): ISODate {
  const now = countMonths(start, asOf, policy).chargeable;
  for (let i = 1; i <= 62; i++) {
    const d = addDays(asOf, i);
    if (countMonths(start, d, policy).chargeable > now) return d;
  }
  return addDays(asOf, 31);
}

/** Maturity date for a term given in months. */
export function maturityFor(start: ISODate, termMonths: number): ISODate {
  return addMonths(start, termMonths);
}

// ---------------------------------------------------------------------------
// Agreed test cases (section 4 of the requirements) — surfaced in the Interest
// rules screen so staff and the owner can run them at any time.
// ---------------------------------------------------------------------------

export interface InterestTestCase {
  id: string;
  start: ISODate;
  end: ISODate;
  expectedMonths: number;
  /** Optional money check. */
  principal?: number;
  rate?: number;
  expectedInterest?: number;
  note: 'doc' | 'edge';
}

export const TEST_CASES: InterestTestCase[] = [
  { id: 'doc-1', start: '2026-01-01', end: '2026-02-04', expectedMonths: 1, note: 'doc' },
  { id: 'doc-2', start: '2026-01-01', end: '2026-02-05', expectedMonths: 2, note: 'doc' },
  { id: 'doc-3', start: '2026-01-01', end: '2026-02-01', expectedMonths: 1, principal: 60000, rate: 5, expectedInterest: 3000, note: 'doc' },
  { id: 'doc-4', start: '2026-01-01', end: '2026-03-01', expectedMonths: 2, principal: 60000, rate: 5, expectedInterest: 6000, note: 'doc' },
  { id: 'edge-1', start: '2026-03-10', end: '2026-03-10', expectedMonths: 1, note: 'edge' },
  { id: 'edge-2', start: '2026-03-10', end: '2026-03-11', expectedMonths: 1, note: 'edge' },
  { id: 'edge-3', start: '2026-03-10', end: '2026-04-09', expectedMonths: 1, note: 'edge' },
  { id: 'edge-4', start: '2026-03-10', end: '2026-04-13', expectedMonths: 1, note: 'edge' },
  { id: 'edge-5', start: '2026-03-10', end: '2026-04-14', expectedMonths: 2, note: 'edge' },
  { id: 'edge-6', start: '2026-01-31', end: '2026-02-28', expectedMonths: 1, note: 'edge' },
  { id: 'edge-7', start: '2025-12-20', end: '2026-06-23', expectedMonths: 6, note: 'edge' },
  { id: 'edge-8', start: '2025-12-20', end: '2026-06-24', expectedMonths: 7, note: 'edge' },
];

export interface TestResult {
  case: InterestTestCase;
  months: MonthCount;
  interest?: number;
  pass: boolean;
}

export function runTestCases(policy: InterestPolicy = DEFAULT_POLICY): TestResult[] {
  return TEST_CASES.map((c) => {
    const months = countMonths(c.start, c.end, policy);
    let interest: number | undefined;
    let pass = months.chargeable === c.expectedMonths;
    if (c.principal != null && c.rate != null) {
      const calc = calculate({
        start: c.start,
        asOf: c.end,
        principal: c.principal,
        rate: c.rate,
        principalPayments: [],
        interestPaid: 0,
        adjustments: 0,
        policy,
      });
      interest = calc.interestAccrued;
      pass = pass && interest === c.expectedInterest;
    }
    return { case: c, months, interest, pass };
  });
}
