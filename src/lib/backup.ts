/**
 * Backup engine: snapshots, integrity checks, restore tests and password-protected files.
 *
 * Everything here is pure (no store access) so the same checks run on a stored copy and on a
 * file the person uploads. A "restore test" proves four things without touching live data:
 * the copy is still there, it is byte-for-byte what was written, its records can be read, and
 * the loan balances recomputed from it match the figures recorded when the backup was made.
 */
import type { Database } from './types';
import { type ISODate, localDateOf } from './dates';
import { sha256Hex } from './auth';
import { calcLoan } from './domain';
import { DB_VERSION } from './seed';

export interface BackupCounts {
  customers: number;
  loans: number;
  items: number;
  payments: number;
  receipts: number;
}

export interface BackupTotals {
  asOf: ISODate;
  principal: number;
  interest: number;
}

export const countsOf = (d: Pick<Database, 'customers' | 'loans' | 'items' | 'payments' | 'receipts'>): BackupCounts => ({
  customers: d.customers.length,
  loans: d.loans.length,
  items: d.items.length,
  payments: d.payments.length,
  receipts: d.receipts.length,
});

/** The records that matter most to the business, recomputed from the data itself. */
export function totalsOf(db: Pick<Database, 'loans' | 'payments'>, asOf: ISODate): BackupTotals {
  let principal = 0;
  let interest = 0;
  for (const loan of db.loans) {
    if (loan.status !== 'active') continue;
    const c = calcLoan(db, loan, asOf);
    principal += c.principalOutstanding;
    interest += c.interestOutstanding;
  }
  return { asOf, principal: Math.round(principal), interest: Math.round(interest) };
}

export const snapshotOf = (db: Database): string => JSON.stringify({ ...db, backups: [] });

export const byteLength = (s: string): number => {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
};

const REQUIRED_ARRAYS = ['customers', 'loans', 'items', 'payments', 'receipts', 'users', 'roles', 'audit'] as const;

/** Whether a file's own checksum still matches its data, or it carried none to check. */
export type Integrity = 'ok' | 'bad' | 'none';

export interface RecordedFacts {
  counts?: BackupCounts;
  totals?: BackupTotals;
}

export type ParsedBackup =
  | { ok: true; data: Database; counts: BackupCounts; createdAt?: string; integrity: Integrity; checksum?: string; recorded?: RecordedFacts }
  | { ok: false; reason: 'format' | 'version' | 'structure' | 'encrypted' };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function readCounts(v: unknown): BackupCounts | undefined {
  const o = v as Partial<BackupCounts> | undefined;
  return o && isNum(o.customers) && isNum(o.loans) && isNum(o.items) && isNum(o.payments) && isNum(o.receipts)
    ? { customers: o.customers, loans: o.loans, items: o.items, payments: o.payments, receipts: o.receipts }
    : undefined;
}
function readTotals(v: unknown): BackupTotals | undefined {
  const o = v as Partial<BackupTotals> | undefined;
  return o && typeof o.asOf === 'string' && isNum(o.principal) && isNum(o.interest) ? { asOf: o.asOf, principal: o.principal, interest: o.interest } : undefined;
}

/** Validate the text of a backup file (or an internal snapshot) without touching the live data. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'format' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'format' };
  const obj = raw as Record<string, unknown>;
  const isWrapped = obj.format === 'igh-backup';
  if (isWrapped && obj.encrypted === true) return { ok: false, reason: 'encrypted' };
  const data = (isWrapped ? obj.data : obj) as Database | undefined;
  if (!data || typeof data !== 'object') return { ok: false, reason: 'format' };
  // Anything without a version number is simply not one of our files; a higher number is a newer system's file.
  if (typeof data.version !== 'number') return { ok: false, reason: 'format' };
  if (data.version > DB_VERSION) return { ok: false, reason: 'version' };
  for (const k of REQUIRED_ARRAYS) if (!Array.isArray((data as unknown as Record<string, unknown>)[k])) return { ok: false, reason: 'structure' };
  if (!data.settings || typeof data.settings !== 'object' || !data.settings.counters) return { ok: false, reason: 'structure' };
  const checksum = isWrapped && typeof obj.checksum === 'string' ? obj.checksum : undefined;
  const integrity: Integrity = checksum ? (sha256Hex(JSON.stringify(data)) === checksum ? 'ok' : 'bad') : 'none';
  return {
    ok: true,
    data: { ...data, backups: [] },
    counts: countsOf(data),
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
    integrity,
    checksum,
    recorded: isWrapped ? { counts: readCounts(obj.counts), totals: readTotals(obj.totals) } : undefined,
  };
}

/**
 * The file written when a backup is downloaded: the data, a checksum that proves it is unchanged,
 * and the record counts and balances at the time, so a later restore test has something to match.
 */
export function wrapBackup(json: string, at: string, counts: BackupCounts, totals: BackupTotals): string {
  return `{"format":"igh-backup","version":${DB_VERSION},"createdAt":${JSON.stringify(at)},"checksum":${JSON.stringify(sha256Hex(json))},"counts":${JSON.stringify(counts)},"totals":${JSON.stringify(totals)},"data":${json}}`;
}

// ---------------------------------------------------------------------------
// Restore test
// ---------------------------------------------------------------------------
export type CheckId = 'stored' | 'unchanged' | 'readable' | 'counts' | 'balances';

export interface BackupCheck {
  id: CheckId;
  ok: boolean;
  /** Nothing to compare against (for example a file made before totals were recorded). */
  skipped?: boolean;
}

export interface BackupTest {
  ok: boolean;
  checks: BackupCheck[];
  counts?: BackupCounts;
  totals?: BackupTotals;
  /** The checksum the data was compared against, when there was one. */
  checksum?: string;
}

export interface TestInput {
  /** The stored text. Undefined when the copy is no longer stored. */
  text: string | undefined;
  /** What was recorded when the backup was made. */
  expect?: { checksum?: string; counts?: BackupCounts; totals?: BackupTotals };
  /** For an uploaded file: whether the checksum it carries still matches (and which one it was). */
  file?: { integrity: Integrity; checksum?: string };
}

export function runRestoreTest(input: TestInput): BackupTest {
  const checks: BackupCheck[] = [];
  const done = (extra?: Partial<BackupTest>): BackupTest => ({ ok: checks.every((c) => c.ok || c.skipped), checks, ...extra });
  const fail = (id: CheckId, rest: CheckId[]) => {
    checks.push({ id, ok: false });
    for (const r of rest) checks.push({ id: r, ok: false, skipped: true });
    return done();
  };

  if (input.text === undefined) return fail('stored', ['unchanged', 'readable', 'counts', 'balances']);
  checks.push({ id: 'stored', ok: true });

  const parsed = parseBackup(input.text);
  const checksum = input.expect?.checksum ?? input.file?.checksum;
  if (input.expect?.checksum !== undefined) {
    if (sha256Hex(input.text) !== input.expect.checksum) return fail('unchanged', ['readable', 'counts', 'balances']);
    checks.push({ id: 'unchanged', ok: true });
  } else if (input.file?.integrity === 'bad') {
    return fail('unchanged', ['readable', 'counts', 'balances']);
  } else {
    checks.push({ id: 'unchanged', ok: true, skipped: input.file?.integrity === 'none' });
  }

  if (!parsed.ok) return fail('readable', ['counts', 'balances']);
  checks.push({ id: 'readable', ok: true });
  const counts = parsed.counts;

  const wantCounts = input.expect?.counts;
  if (wantCounts) checks.push({ id: 'counts', ok: JSON.stringify(wantCounts) === JSON.stringify(counts) });
  else checks.push({ id: 'counts', ok: true, skipped: true });

  const wantTotals = input.expect?.totals;
  let totals: BackupTotals | undefined;
  try {
    totals = totalsOf(parsed.data, wantTotals?.asOf ?? localDateOf(parsed.createdAt ?? new Date().toISOString()));
  } catch {
    checks.push({ id: 'balances', ok: false });
    return done({ counts });
  }
  if (wantTotals) checks.push({ id: 'balances', ok: wantTotals.principal === totals.principal && wantTotals.interest === totals.interest });
  else checks.push({ id: 'balances', ok: true, skipped: true });
  return done({ counts, totals, checksum });
}

// ---------------------------------------------------------------------------
// Password protection (AES-GCM, key derived with PBKDF2)
// ---------------------------------------------------------------------------
const ITERATIONS = 250_000;

export const cryptoSupported = (): boolean => {
  try {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';
  } catch {
    return false;
  }
};

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Wrap a finished backup file in an encrypted envelope. */
export async function encryptBackup(plainFile: string, password: string, at: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plainFile)));
  return JSON.stringify({
    format: 'igh-backup',
    version: DB_VERSION,
    encrypted: true,
    createdAt: at,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toB64(salt),
    iv: toB64(iv),
    cipher: toB64(cipher),
  });
}

export type DecryptFailure = 'password' | 'format' | 'unsupported';

/** Unlock an encrypted envelope. Throws a short code the screen turns into a message. */
export async function decryptBackup(envelope: string, password: string): Promise<string> {
  if (!cryptoSupported()) throw new Error('unsupported' satisfies DecryptFailure);
  let o: { salt: string; iv: string; cipher: string; iterations?: number };
  try {
    o = JSON.parse(envelope);
    if (typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.cipher !== 'string') throw new Error('shape');
  } catch {
    throw new Error('format' satisfies DecryptFailure);
  }
  try {
    const key = await deriveKey(password, fromB64(o.salt), Math.min(Math.max(o.iterations ?? ITERATIONS, 1000), 2_000_000));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(o.iv) as BufferSource }, key, fromB64(o.cipher) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('password' satisfies DecryptFailure);
  }
}
