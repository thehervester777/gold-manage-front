import type { ISODate } from './dates';
import type { InterestPolicy, PartialBase } from './interest';

export type Lang = 'en' | 'bn';
export type Bilingual = { en: string; bn: string };

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------
export const PERMISSIONS = [
  'dashboard.view',
  'customers.view',
  'customers.edit',
  'loans.view',
  'loans.create',
  'loans.renew',
  'loans.release',
  'payments.collect',
  'items.view',
  'items.edit',
  'receipts.view',
  'reports.view',
  'interest.configure',
  'interest.override',
  'users.manage',
  'audit.view',
  'backup.manage',
  'settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Role {
  id: string;
  name: Bilingual;
  description: Bilingual;
  permissions: Permission[];
  /** System roles cannot be deleted; the owner role cannot be edited. */
  system: boolean;
  locked?: boolean;
}

export interface User {
  id: string;
  username: string;
  name: string;
  mobile?: string;
  roleId: string;
  status: 'active' | 'disabled';
  salt: string;
  passwordHash: string;
  language: Lang;
  lastLoginAt?: string;
  createdAt: string;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Business records
// ---------------------------------------------------------------------------
export interface Customer {
  id: string;
  /** Unique customer ID shown to staff, e.g. CUS-00012. */
  code: string;
  name: string;
  mobile: string;
  address: string;
  nid?: string;
  altMobile?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export const CATEGORIES = ['chain', 'ring', 'necklace', 'bangle', 'earring', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CARATS = [18, 21, 22, 24] as const;
export type Carat = (typeof CARATS)[number];

export interface ItemLocation {
  vault: string;
  shelf: string;
  box: string;
}

export interface GoldItem {
  id: string;
  /** Identifying reference, e.g. GI-000123. */
  ref: string;
  loanId: string;
  category: Category;
  description: string;
  carat: Carat;
  /** Grams. */
  grossWeight: number;
  stoneWeight: number;
  netWeight: number;
  /** Appraised value in BDT. */
  valuation: number;
  /** Data URL of the photograph, if one was taken. */
  photo?: string;
  /** Physical tag number written on the packet. */
  tagNo: string;
  location: ItemLocation;
  status: 'in_custody' | 'released';
  releasedOn?: ISODate;
  createdAt: string;
  createdBy: string;
}

export type LoanStatus = 'active' | 'released';

export interface Renewal {
  id: string;
  date: ISODate;
  by: string;
  previousMaturity: ISODate;
  newMaturity: ISODate;
  termMonths: number;
  /** Balances reconciled at the moment of renewal. */
  snapshot: {
    principalOutstanding: number;
    interestAccrued: number;
    interestPaid: number;
    interestOutstanding: number;
    months: number;
  };
  collectedInterest: number;
}

export interface InterestAdjustment {
  id: string;
  date: ISODate;
  at: string;
  by: string;
  kind: 'waiver' | 'correction' | 'override';
  /** Signed change applied to accrued interest. */
  amount: number;
  reason: string;
  before: number;
  after: number;
}

export interface ManualCheck {
  id: string;
  at: string;
  by: string;
  asOf: ISODate;
  autoInterest: number;
  manualInterest: number;
  variance: number;
  note: string;
}

export interface Loan {
  id: string;
  /** Loan / pledge number, e.g. LN-2026-00045. */
  number: string;
  customerId: string;
  disbursedOn: ISODate;
  principal: number;
  ratePlanId?: string;
  /** Percent per month. */
  rate: number;
  customRate: boolean;
  termMonths: number;
  maturityDate: ISODate;
  status: LoanStatus;
  closedOn?: ISODate;
  /** Interest rules frozen when the loan was created, so later policy changes never rewrite history. */
  policy: InterestPolicy;
  notes?: string;
  renewals: Renewal[];
  adjustments: InterestAdjustment[];
  manualChecks: ManualCheck[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank', 'cheque'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  id: string;
  loanId: string;
  customerId: string;
  date: ISODate;
  /** Allocation of this payment. */
  interest: number;
  principal: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  settlement: boolean;
  receiptIds: string[];
  createdAt: string;
  createdBy: string;
}

export const RECEIPT_TYPES = ['new_loan', 'interest', 'principal', 'release'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

export interface ReceiptItemLine {
  ref: string;
  category: Category;
  description: string;
  carat: Carat;
  netWeight: number;
  tagNo: string;
}

export interface Receipt {
  id: string;
  /** Unique receipt number, e.g. IC-2026-000046. */
  number: string;
  type: ReceiptType;
  date: ISODate;
  loanId: string;
  customerId: string;
  paymentId?: string;
  amount: number;
  /** Frozen copy of what was printed, so reprints never change. */
  snapshot: {
    customerCode: string;
    customerName: string;
    customerMobile: string;
    customerAddress: string;
    loanNumber: string;
    rate: number;
    termMonths: number;
    disbursedOn: ISODate;
    maturityDate: ISODate;
    principal: number;
    method?: PaymentMethod;
    reference?: string;
    items: ReceiptItemLine[];
    /** Interest receipts: what the money covered. */
    coverage?: {
      from: ISODate;
      to: ISODate;
      months: number;
      accrued: number;
      adjustments: number;
      previouslyPaid: number;
    };
    balanceAfter: { principal: number; interest: number };
    /** Release receipts: totals over the life of the loan. */
    lifetime?: { principalRepaid: number; interestPaid: number; settledOn: ISODate };
    receivedBy: string;
  };
  createdAt: string;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Audit, backup, settings
// ---------------------------------------------------------------------------
export type AuditEntity =
  | 'customer'
  | 'loan'
  | 'item'
  | 'payment'
  | 'receipt'
  | 'user'
  | 'role'
  | 'settings'
  | 'rate_plan'
  | 'backup'
  | 'session'
  | 'interest';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'payment'
  | 'release'
  | 'renew'
  | 'override'
  | 'manual_check'
  | 'login'
  | 'logout'
  | 'backup'
  | 'restore'
  | 'reset'
  | 'approve'
  | 'move';

export interface AuditChange {
  field: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  roleId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  /** Human-readable reference such as a loan number or customer name. */
  label: string;
  changes?: AuditChange[];
  reason?: string;
  /** Free-form values used to compose the sentence in the viewer's language. */
  meta?: Record<string, string | number>;
}

export interface BackupRecord {
  id: string;
  at: string;
  by: string;
  kind: 'manual' | 'auto' | 'pre_restore';
  sizeBytes: number;
  checksum: string;
  counts: { customers: number; loans: number; items: number; payments: number; receipts: number };
  /** Outstanding balances recomputed when the backup was made; a restore test must reproduce them. */
  totals?: { asOf: ISODate; principal: number; interest: number };
  verifiedAt?: string;
  verifiedOk?: boolean;
}

export interface RatePlan {
  id: string;
  name: Bilingual;
  /** Percent per month. */
  rate: number;
  active: boolean;
  note?: Bilingual;
}

export interface GoldRate {
  date: ISODate;
  /** BDT per vori (11.664 g). */
  k24: number;
  k22: number;
  k21: number;
  k18: number;
}

export interface Settings {
  business: {
    name: Bilingual;
    tagline: Bilingual;
    address: Bilingual;
    phone: string;
    email: string;
    licenseNo: string;
    receiptFooter: Bilingual;
  };
  defaultLanguage: Lang;
  interest: {
    policy: InterestPolicy;
    maxLtv: number;
    approvedBy?: string;
    approvedAt?: string;
    defaultTermMonths: number;
  };
  ratePlans: RatePlan[];
  goldRates: GoldRate[];
  counters: { customer: number; loan: number; item: number; receipt: number };
  backup: { autoDaily: boolean; keep: number; lastAutoAt?: string };
}

export interface Database {
  version: number;
  customers: Customer[];
  loans: Loan[];
  items: GoldItem[];
  payments: Payment[];
  receipts: Receipt[];
  users: User[];
  roles: Role[];
  audit: AuditEntry[];
  backups: BackupRecord[];
  settings: Settings;
  meta: { createdAt: string; demo: boolean };
}

export type { InterestPolicy, PartialBase };
