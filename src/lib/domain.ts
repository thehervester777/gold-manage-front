/**
 * Business rules for customers, loans, pledged items, payments and receipts.
 *
 * Every function here takes a mutable `Database` (an immer draft in the app, a
 * plain object in the seed builder) plus a context describing who is acting and
 * when. Functions validate first, throw `AppError` with an i18n key, and write an
 * audit entry for every change so the history can always be traced.
 */
import type {
  AuditAction,
  AuditChange,
  AuditEntity,
  Carat,
  Category,
  Customer,
  Database,
  GoldItem,
  InterestAdjustment,
  ItemLocation,
  Loan,
  ManualCheck,
  Payment,
  PaymentMethod,
  RatePlan,
  Receipt,
  ReceiptType,
  Renewal,
} from './types';
import { type ISODate, addMonths, cmpISO, diffDays, maxISO } from './dates';
import { calculate, type Calculation } from './interest';
import { toLatinDigits } from './format';

export class AppError extends Error {
  key: string;
  params?: Record<string, string | number>;
  constructor(key: string, params?: Record<string, string | number>) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

export interface Actor {
  id: string;
  name: string;
  roleId: string;
}

export interface Ctx {
  actor: Actor;
  /** Full timestamp of the action. */
  at: string;
  today: ISODate;
  id: (prefix: string) => string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const money = (n: unknown) => Math.round(Number(n));

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export function pushAudit(
  d: Database,
  ctx: Ctx,
  e: {
    action: AuditAction;
    entity: AuditEntity;
    entityId: string;
    label: string;
    changes?: AuditChange[];
    reason?: string;
    meta?: Record<string, string | number>;
  },
) {
  d.audit.push({
    id: ctx.id('au'),
    at: ctx.at,
    userId: ctx.actor.id,
    userName: ctx.actor.name,
    roleId: ctx.actor.roleId,
    ...e,
  });
}

/** A rate plan as one audit value: its name in both languages, monthly rate and whether it is offered. */
export const planCode = (p: RatePlan): string =>
  `${p.name.en.replace(/\|/g, '/')}|${p.name.bn.replace(/\|/g, '/')}|${p.rate}|${p.active ? 1 : 0}`;

export function diffFields<T extends object>(
  before: T,
  after: Partial<T>,
  fields: (keyof T & string)[],
  show: (field: string, v: unknown) => string | number | boolean | null = (_f, v) =>
    v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : (v as string | number | boolean),
): AuditChange[] {
  const out: AuditChange[] = [];
  for (const f of fields) {
    if (!(f in after)) continue;
    const b = (before as Record<string, unknown>)[f];
    const a = (after as Record<string, unknown>)[f];
    if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ field: f, before: show(f, b), after: show(f, a) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------
export const RECEIPT_CODE: Record<ReceiptType, string> = {
  new_loan: 'NL',
  interest: 'IC',
  principal: 'PR',
  release: 'PL',
};

export const nextCustomerCode = (d: Database) => `CUS-${pad(++d.settings.counters.customer, 5)}`;
export const nextLoanNumber = (d: Database, date: ISODate) => `LN-${date.slice(0, 4)}-${pad(++d.settings.counters.loan, 5)}`;
export const nextItemRef = (d: Database) => `GI-${pad(++d.settings.counters.item, 6)}`;
export const nextReceiptNumber = (d: Database, type: ReceiptType, date: ISODate) =>
  `${RECEIPT_CODE[type]}-${date.slice(0, 4)}-${pad(++d.settings.counters.receipt, 6)}`;

/** A free-looking default storage slot for a new item. */
export const slotAt = (n: number): ItemLocation => ({ vault: 'Vault A', shelf: String(1 + (n % 6)), box: String(1 + (Math.floor(n / 6) % 40)) });
export const suggestLocation = (d: Database): ItemLocation => slotAt(d.items.filter((i) => i.status === 'in_custody').length);

// ---------------------------------------------------------------------------
// Lookups & derived values
// ---------------------------------------------------------------------------
export const findCustomer = (d: Pick<Database, 'customers'>, id: string) => d.customers.find((c) => c.id === id);
export const findLoan = (d: Pick<Database, 'loans'>, id: string) => d.loans.find((l) => l.id === id);
export const loanItems = (d: Pick<Database, 'items'>, loanId: string) => d.items.filter((i) => i.loanId === loanId);
export const loanPayments = (d: Pick<Database, 'payments'>, loanId: string) =>
  d.payments.filter((p) => p.loanId === loanId).sort((a, b) => cmpISO(a.date, b.date) || a.createdAt.localeCompare(b.createdAt));

export type LoanState = 'active' | 'overdue' | 'released';
export function loanState(loan: Loan, today: ISODate): LoanState {
  if (loan.status === 'released') return 'released';
  return cmpISO(today, loan.maturityDate) > 0 ? 'overdue' : 'active';
}
export const daysOverdue = (loan: Loan, today: ISODate) => Math.max(0, diffDays(loan.maturityDate, today));

/** Interest and balances for a loan on a given day (capped at the closing date for released loans). */
export function calcLoan(d: Pick<Database, 'payments'>, loan: Loan, asOf: ISODate): Calculation {
  const end = loan.status === 'released' && loan.closedOn && cmpISO(asOf, loan.closedOn) > 0 ? loan.closedOn : asOf;
  const pays = d.payments.filter((p) => p.loanId === loan.id && cmpISO(p.date, end) <= 0);
  return calculate({
    start: loan.disbursedOn,
    asOf: end,
    principal: loan.principal,
    rate: loan.rate,
    principalPayments: pays.filter((p) => p.principal > 0).map((p) => ({ date: p.date, amount: p.principal })),
    interestPaid: sum(pays.map((p) => p.interest)),
    adjustments: sum(loan.adjustments.filter((a) => cmpISO(a.date, end) <= 0).map((a) => a.amount)),
    policy: loan.policy,
  });
}

export function lastPaymentDate(d: Pick<Database, 'payments'>, loanId: string): ISODate | undefined {
  let last: ISODate | undefined;
  for (const p of d.payments) if (p.loanId === loanId && (!last || cmpISO(p.date, last) > 0)) last = p.date;
  return last;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export function normalizeMobile(raw: string): string {
  let s = toLatinDigits(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+88')) s = s.slice(3);
  else if (s.startsWith('88') && s.length === 13) s = s.slice(2);
  return s;
}
export const isValidMobile = (m: string) => /^01[3-9]\d{8}$/.test(normalizeMobile(m));

export interface CustomerInput {
  name: string;
  mobile: string;
  address: string;
  nid?: string;
  altMobile?: string;
  notes?: string;
}

function cleanCustomer(input: CustomerInput) {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const address = input.address.trim();
  if (!name) throw new AppError('err.nameRequired');
  if (!isValidMobile(input.mobile)) throw new AppError('err.mobileInvalid');
  if (!address) throw new AppError('err.addressRequired');
  const alt = input.altMobile?.trim();
  if (alt && !isValidMobile(alt)) throw new AppError('err.mobileInvalid');
  return {
    name,
    mobile: normalizeMobile(input.mobile),
    address,
    nid: input.nid?.trim() || undefined,
    altMobile: alt ? normalizeMobile(alt) : undefined,
    notes: input.notes?.trim() || undefined,
  };
}

export function createCustomer(d: Database, ctx: Ctx, input: CustomerInput): string {
  const c = cleanCustomer(input);
  const customer: Customer = {
    id: ctx.id('cus'),
    code: nextCustomerCode(d),
    ...c,
    createdAt: ctx.at,
    createdBy: ctx.actor.id,
    updatedAt: ctx.at,
    updatedBy: ctx.actor.id,
  };
  d.customers.push(customer);
  pushAudit(d, ctx, { action: 'create', entity: 'customer', entityId: customer.id, label: `${customer.code} ${customer.name}` });
  return customer.id;
}

export function updateCustomer(d: Database, ctx: Ctx, id: string, input: CustomerInput) {
  const c = findCustomer(d, id);
  if (!c) throw new AppError('err.notFound');
  const next = cleanCustomer(input);
  const changes = diffFields(c as Customer, next as Partial<Customer>, ['name', 'mobile', 'address', 'nid', 'altMobile', 'notes']);
  Object.assign(c, next, { updatedAt: ctx.at, updatedBy: ctx.actor.id });
  if (changes.length) pushAudit(d, ctx, { action: 'update', entity: 'customer', entityId: id, label: `${c.code} ${c.name}`, changes });
}

// ---------------------------------------------------------------------------
// Loans & pledged items
// ---------------------------------------------------------------------------
export interface ItemInput {
  category: Category;
  description: string;
  carat: Carat;
  grossWeight: number;
  stoneWeight: number;
  valuation: number;
  photo?: string;
  tagNo?: string;
  location?: ItemLocation;
}

export interface NewLoanInput {
  customerId: string;
  date: ISODate;
  principal: number;
  rate: number;
  ratePlanId?: string;
  customRate: boolean;
  termMonths: number;
  notes?: string;
  items: ItemInput[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function createLoan(d: Database, ctx: Ctx, input: NewLoanInput): { loanId: string; receiptId: string } {
  const customer = findCustomer(d, input.customerId);
  if (!customer) throw new AppError('err.customerRequired');
  const principal = money(input.principal);
  if (!Number.isFinite(principal) || principal <= 0) throw new AppError('err.principalInvalid');
  if (!Number.isFinite(input.rate) || input.rate <= 0 || input.rate > 15) throw new AppError('err.rateInvalid');
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 36) throw new AppError('err.termInvalid');
  if (cmpISO(input.date, ctx.today) > 0) throw new AppError('err.dateFuture');
  if (!input.items.length) throw new AppError('err.itemsRequired');

  const loanId = ctx.id('loan');
  const loan: Loan = {
    id: loanId,
    number: nextLoanNumber(d, input.date),
    customerId: customer.id,
    disbursedOn: input.date,
    principal,
    ratePlanId: input.ratePlanId,
    rate: input.rate,
    customRate: input.customRate,
    termMonths: input.termMonths,
    maturityDate: addMonths(input.date, input.termMonths),
    status: 'active',
    policy: { ...d.settings.interest.policy },
    notes: input.notes?.trim() || undefined,
    renewals: [],
    adjustments: [],
    manualChecks: [],
    createdAt: ctx.at,
    createdBy: ctx.actor.id,
    updatedAt: ctx.at,
    updatedBy: ctx.actor.id,
  };

  const items: GoldItem[] = input.items.map((it) => {
    const gross = r3(it.grossWeight);
    const stone = r3(it.stoneWeight || 0);
    const net = r3(gross - stone);
    if (!(gross > 0) || stone < 0 || !(net > 0)) throw new AppError('err.weightInvalid');
    if (!it.description.trim()) throw new AppError('err.descriptionRequired');
    return {
      id: ctx.id('item'),
      ref: nextItemRef(d),
      loanId,
      category: it.category,
      description: it.description.trim(),
      carat: it.carat,
      grossWeight: gross,
      stoneWeight: stone,
      netWeight: net,
      valuation: money(it.valuation || 0),
      photo: it.photo,
      tagNo: it.tagNo?.trim() || '',
      location: it.location ?? suggestLocation(d),
      status: 'in_custody',
      createdAt: ctx.at,
      createdBy: ctx.actor.id,
    };
  });
  items.forEach((i) => {
    if (!i.tagNo) i.tagNo = `T-${i.ref.slice(3)}`;
  });

  d.loans.push(loan);
  d.items.push(...items);

  const receipt = issueReceipt(d, ctx, {
    type: 'new_loan',
    loan,
    customer,
    date: input.date,
    amount: principal,
    balanceAfter: { principal, interest: 0 },
  });

  pushAudit(d, ctx, {
    action: 'create',
    entity: 'loan',
    entityId: loanId,
    label: `${loan.number} ${customer.name}`,
    meta: { principal, rate: loan.rate, items: items.length },
  });
  return { loanId, receiptId: receipt.id };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------
interface ReceiptArgs {
  type: ReceiptType;
  loan: Loan;
  customer: Customer;
  date: ISODate;
  amount: number;
  payment?: Payment;
  coverage?: Receipt['snapshot']['coverage'];
  balanceAfter: { principal: number; interest: number };
  lifetime?: Receipt['snapshot']['lifetime'];
}

function issueReceipt(d: Database, ctx: Ctx, a: ReceiptArgs): Receipt {
  const items = loanItems(d, a.loan.id).map((i) => ({
    ref: i.ref,
    category: i.category,
    description: i.description,
    carat: i.carat,
    netWeight: i.netWeight,
    tagNo: i.tagNo,
  }));
  const receipt: Receipt = {
    id: ctx.id('rc'),
    number: nextReceiptNumber(d, a.type, a.date),
    type: a.type,
    date: a.date,
    loanId: a.loan.id,
    customerId: a.customer.id,
    paymentId: a.payment?.id,
    amount: a.amount,
    snapshot: {
      customerCode: a.customer.code,
      customerName: a.customer.name,
      customerMobile: a.customer.mobile,
      customerAddress: a.customer.address,
      loanNumber: a.loan.number,
      rate: a.loan.rate,
      termMonths: a.loan.termMonths,
      disbursedOn: a.loan.disbursedOn,
      maturityDate: a.loan.maturityDate,
      principal: a.loan.principal,
      method: a.payment?.method,
      reference: a.payment?.reference,
      items,
      coverage: a.coverage,
      balanceAfter: a.balanceAfter,
      lifetime: a.lifetime,
      receivedBy: ctx.actor.name,
    },
    createdAt: ctx.at,
    createdBy: ctx.actor.id,
  };
  d.receipts.push(receipt);
  pushAudit(d, ctx, {
    action: 'create',
    entity: 'receipt',
    entityId: receipt.id,
    label: receipt.number,
    meta: { type: a.type, amount: a.amount },
  });
  return receipt;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export interface PaymentInput {
  loanId: string;
  date: ISODate;
  interest: number;
  principal: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
}

function requireActive(d: Database, loanId: string): { loan: Loan; customer: Customer } {
  const loan = findLoan(d, loanId);
  if (!loan) throw new AppError('err.notFound');
  if (loan.status !== 'active') throw new AppError('err.loanClosed');
  const customer = findCustomer(d, loan.customerId);
  if (!customer) throw new AppError('err.notFound');
  return { loan, customer };
}

function checkDate(d: Database, ctx: Ctx, loan: Loan, date: ISODate) {
  if (cmpISO(date, loan.disbursedOn) < 0) throw new AppError('err.dateBeforeLoan');
  if (cmpISO(date, ctx.today) > 0) throw new AppError('err.dateFuture');
  const last = lastPaymentDate(d, loan.id);
  if (last && cmpISO(date, last) < 0) throw new AppError('err.dateBeforePayment', { date: last });
}

function releaseItems(d: Database, loanId: string, date: ISODate) {
  for (const i of d.items) if (i.loanId === loanId && i.status === 'in_custody') {
    i.status = 'released';
    i.releasedOn = date;
  }
}

export function collectPayment(d: Database, ctx: Ctx, input: PaymentInput): { paymentId: string; receiptIds: string[]; released: boolean } {
  const { loan, customer } = requireActive(d, input.loanId);
  checkDate(d, ctx, loan, input.date);

  const interest = money(input.interest || 0);
  const principal = money(input.principal || 0);
  if (!Number.isFinite(interest) || !Number.isFinite(principal) || interest < 0 || principal < 0 || interest + principal <= 0) {
    throw new AppError('err.amountInvalid');
  }
  const before = calcLoan(d, loan, input.date);
  if (interest > before.interestOutstanding) throw new AppError('err.interestTooHigh', { max: before.interestOutstanding });
  if (principal > before.principalOutstanding) throw new AppError('err.principalTooHigh', { max: before.principalOutstanding });

  const payment: Payment = {
    id: ctx.id('pay'),
    loanId: loan.id,
    customerId: customer.id,
    date: input.date,
    interest,
    principal,
    method: input.method,
    reference: input.reference?.trim() || undefined,
    note: input.note?.trim() || undefined,
    settlement: false,
    receiptIds: [],
    createdAt: ctx.at,
    createdBy: ctx.actor.id,
  };
  d.payments.push(payment);

  const after = calcLoan(d, loan, input.date);
  const settled = after.principalOutstanding === 0 && after.interestOutstanding === 0;
  payment.settlement = settled;
  const balanceAfter = { principal: after.principalOutstanding, interest: after.interestOutstanding };

  const receiptIds: string[] = [];
  if (interest > 0) {
    receiptIds.push(
      issueReceipt(d, ctx, {
        type: 'interest',
        loan,
        customer,
        date: input.date,
        amount: interest,
        payment,
        balanceAfter,
        coverage: {
          from: loan.disbursedOn,
          to: input.date,
          months: before.months.chargeable,
          accrued: before.interestAccrued,
          adjustments: before.adjustments,
          previouslyPaid: before.interestPaid,
        },
      }).id,
    );
  }
  if (principal > 0) {
    receiptIds.push(issueReceipt(d, ctx, { type: 'principal', loan, customer, date: input.date, amount: principal, payment, balanceAfter }).id);
  }

  pushAudit(d, ctx, {
    action: 'payment',
    entity: 'payment',
    entityId: payment.id,
    label: `${loan.number} ${customer.name}`,
    meta: { interest, principal, method: input.method },
  });

  if (settled) {
    receiptIds.push(...finishRelease(d, ctx, loan, customer, input.date, interest + principal, payment, balanceAfter));
  }
  payment.receiptIds = receiptIds;
  loan.updatedAt = ctx.at;
  loan.updatedBy = ctx.actor.id;
  return { paymentId: payment.id, receiptIds, released: settled };
}

function finishRelease(
  d: Database,
  ctx: Ctx,
  loan: Loan,
  customer: Customer,
  date: ISODate,
  amount: number,
  payment: Payment | undefined,
  balanceAfter: { principal: number; interest: number },
): string[] {
  loan.status = 'released';
  loan.closedOn = date;
  releaseItems(d, loan.id, date);
  const paid = d.payments.filter((p) => p.loanId === loan.id);
  const receipt = issueReceipt(d, ctx, {
    type: 'release',
    loan,
    customer,
    date,
    amount,
    payment,
    balanceAfter,
    lifetime: {
      principalRepaid: sum(paid.map((p) => p.principal)),
      interestPaid: sum(paid.map((p) => p.interest)),
      settledOn: date,
    },
  });
  pushAudit(d, ctx, { action: 'release', entity: 'loan', entityId: loan.id, label: `${loan.number} ${customer.name}`, meta: { items: loanItems(d, loan.id).length } });
  return [receipt.id];
}

/** Release a pledge whose balances are already zero (for example after earlier part-payments). */
export function releasePledge(d: Database, ctx: Ctx, loanId: string, date: ISODate): { receiptIds: string[] } {
  const { loan, customer } = requireActive(d, loanId);
  checkDate(d, ctx, loan, date);
  const calc = calcLoan(d, loan, date);
  if (calc.principalOutstanding > 0 || calc.interestOutstanding > 0) throw new AppError('err.balanceDue');
  const receiptIds = finishRelease(d, ctx, loan, customer, date, 0, undefined, { principal: 0, interest: 0 });
  loan.updatedAt = ctx.at;
  loan.updatedBy = ctx.actor.id;
  return { receiptIds };
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------
export interface RenewInput {
  loanId: string;
  date: ISODate;
  termMonths: number;
  collectInterest: boolean;
  method?: PaymentMethod;
  reference?: string;
}

export function renewLoan(d: Database, ctx: Ctx, input: RenewInput): { receiptIds: string[] } {
  const { loan, customer } = requireActive(d, input.loanId);
  checkDate(d, ctx, loan, input.date);
  if (!Number.isInteger(input.termMonths) || input.termMonths < 1 || input.termMonths > 36) throw new AppError('err.termInvalid');

  const before = calcLoan(d, loan, input.date);
  let collected = 0;
  let receiptIds: string[] = [];
  if (input.collectInterest && before.interestOutstanding > 0) {
    const res = collectPayment(d, ctx, {
      loanId: loan.id,
      date: input.date,
      interest: before.interestOutstanding,
      principal: 0,
      method: input.method ?? 'cash',
      reference: input.reference,
      note: 'Interest collected at renewal',
    });
    collected = before.interestOutstanding;
    receiptIds = res.receiptIds;
  }
  const after = calcLoan(d, loan, input.date);
  const previousMaturity = loan.maturityDate;
  const newMaturity = addMonths(maxISO(previousMaturity, input.date), input.termMonths);
  const renewal: Renewal = {
    id: ctx.id('rn'),
    date: input.date,
    by: ctx.actor.id,
    previousMaturity,
    newMaturity,
    termMonths: input.termMonths,
    snapshot: {
      principalOutstanding: after.principalOutstanding,
      interestAccrued: after.interestAccrued,
      interestPaid: after.interestPaid,
      interestOutstanding: after.interestOutstanding,
      months: after.months.chargeable,
    },
    collectedInterest: collected,
  };
  loan.renewals.push(renewal);
  loan.maturityDate = newMaturity;
  loan.updatedAt = ctx.at;
  loan.updatedBy = ctx.actor.id;
  pushAudit(d, ctx, {
    action: 'renew',
    entity: 'loan',
    entityId: loan.id,
    label: `${loan.number} ${customer.name}`,
    changes: [{ field: 'maturityDate', before: previousMaturity, after: newMaturity }],
    meta: { termMonths: input.termMonths, collected },
  });
  return { receiptIds };
}

// ---------------------------------------------------------------------------
// Verification: manual check and logged override
// ---------------------------------------------------------------------------
export interface AdjustInput {
  loanId: string;
  date: ISODate;
  kind: InterestAdjustment['kind'];
  /** Signed change applied to accrued interest. */
  amount: number;
  reason: string;
}

export function adjustInterest(d: Database, ctx: Ctx, input: AdjustInput): string {
  const loan = findLoan(d, input.loanId);
  if (!loan) throw new AppError('err.notFound');
  if (loan.status !== 'active') throw new AppError('err.loanClosed');
  const reason = input.reason.trim();
  if (reason.length < 5) throw new AppError('err.reasonRequired');
  const amount = money(input.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new AppError('err.amountInvalid');
  if (cmpISO(input.date, ctx.today) > 0) throw new AppError('err.dateFuture');

  const before = calcLoan(d, loan, input.date).interestOutstanding;
  const after = before + amount;
  if (after < 0) throw new AppError('err.adjustTooLarge', { max: before });
  const adj: InterestAdjustment = {
    id: ctx.id('adj'),
    date: input.date,
    at: ctx.at,
    by: ctx.actor.id,
    kind: input.kind,
    amount,
    reason,
    before,
    after,
  };
  loan.adjustments.push(adj);
  loan.updatedAt = ctx.at;
  loan.updatedBy = ctx.actor.id;
  pushAudit(d, ctx, {
    action: 'override',
    entity: 'interest',
    entityId: loan.id,
    label: loan.number,
    reason,
    changes: [{ field: 'interestOutstanding', before, after }],
    meta: { kind: input.kind, amount },
  });
  return adj.id;
}

export interface ManualCheckInput {
  loanId: string;
  asOf: ISODate;
  manualInterest: number;
  note: string;
}

export function recordManualCheck(d: Database, ctx: Ctx, input: ManualCheckInput): ManualCheck {
  const loan = findLoan(d, input.loanId);
  if (!loan) throw new AppError('err.notFound');
  const manual = money(input.manualInterest);
  if (!Number.isFinite(manual) || manual < 0) throw new AppError('err.amountInvalid');
  const auto = calcLoan(d, loan, input.asOf).interestAccrued;
  const check: ManualCheck = {
    id: ctx.id('mc'),
    at: ctx.at,
    by: ctx.actor.id,
    asOf: input.asOf,
    autoInterest: auto,
    manualInterest: manual,
    variance: manual - auto,
    note: input.note.trim(),
  };
  loan.manualChecks.push(check);
  pushAudit(d, ctx, {
    action: 'manual_check',
    entity: 'interest',
    entityId: loan.id,
    label: loan.number,
    meta: { auto, manual, variance: check.variance },
  });
  return check;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export interface ItemPatch {
  description?: string;
  valuation?: number;
  tagNo?: string;
  photo?: string | null;
  location?: ItemLocation;
}

export const locationText = (l: ItemLocation) => `${l.vault} / ${l.shelf} / ${l.box}`;

export function updateItem(d: Database, ctx: Ctx, id: string, patch: ItemPatch) {
  const item = d.items.find((i) => i.id === id);
  if (!item) throw new AppError('err.notFound');
  const changes: AuditChange[] = [];
  if (patch.description !== undefined && patch.description.trim() && patch.description.trim() !== item.description) {
    changes.push({ field: 'description', before: item.description, after: patch.description.trim() });
    item.description = patch.description.trim();
  }
  if (patch.valuation !== undefined && money(patch.valuation) !== item.valuation && Number.isFinite(patch.valuation)) {
    changes.push({ field: 'valuation', before: item.valuation, after: money(patch.valuation) });
    item.valuation = money(patch.valuation);
  }
  if (patch.tagNo !== undefined && patch.tagNo.trim() !== item.tagNo) {
    changes.push({ field: 'tagNo', before: item.tagNo, after: patch.tagNo.trim() });
    item.tagNo = patch.tagNo.trim();
  }
  if (patch.photo !== undefined) {
    const next = patch.photo ?? undefined;
    if (next !== item.photo) {
      changes.push({ field: 'photo', before: item.photo ? 'photo' : null, after: next ? 'photo' : null });
      item.photo = next;
    }
  }
  if (patch.location && locationText(patch.location) !== locationText(item.location)) {
    changes.push({ field: 'location', before: locationText(item.location), after: locationText(patch.location) });
    item.location = patch.location;
  }
  if (changes.length) {
    pushAudit(d, ctx, {
      action: changes.length === 1 && changes[0].field === 'location' ? 'move' : 'update',
      entity: 'item',
      entityId: id,
      label: item.ref,
      changes,
    });
  }
}
