import type { Customer, Database, GoldItem, ItemLocation, Loan } from '../../lib/types';

/** An item together with the loan that secures it and the person who pledged it. */
export interface VaultRow {
  item: GoldItem;
  loan: Loan;
  customer: Customer;
}

export function vaultRows(db: Database): VaultRow[] {
  const loans = new Map(db.loans.map((l) => [l.id, l]));
  const customers = new Map(db.customers.map((c) => [c.id, c]));
  const out: VaultRow[] = [];
  for (const item of db.items) {
    const loan = loans.get(item.loanId);
    const customer = loan ? customers.get(loan.customerId) : undefined;
    if (loan && customer) out.push({ item, loan, customer });
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase();
/** Two locations are the same box when vault, shelf and box agree, ignoring case and spaces. */
export const slotKey = (l: ItemLocation) => `${norm(l.vault)}|${norm(l.shelf)}|${norm(l.box)}`;
export const placeText = (l: ItemLocation) => `${l.vault} · ${l.shelf} · ${l.box}`;
const isNum = (s: string) => /^\d{1,3}$/.test(s.trim());
const num = (s: string) => parseInt(s.trim(), 10);

export const SHELVES = 6;
export const BOXES = 40;

export interface Cell {
  shelf: number;
  box: number;
  rows: VaultRow[];
}

export interface VaultMapModel {
  vault: string;
  shelves: number;
  boxes: number;
  /** shelf (1-based) → box (1-based) → rows */
  cells: Cell[][];
  /** Items whose shelf or box is not a plain number. */
  elsewhere: { key: string; label: string; loc: ItemLocation; rows: VaultRow[] }[];
  used: number;
  max: number;
}

/** The distinct vault names in use, the default one first. */
export function vaultNames(rows: VaultRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const k = norm(r.item.location.vault);
    if (k && !seen.has(k)) seen.set(k, r.item.location.vault.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function buildMap(rows: VaultRow[], vault: string): VaultMapModel {
  const mine = rows.filter((r) => norm(r.item.location.vault) === norm(vault));
  let shelves = SHELVES;
  let boxes = BOXES;
  for (const r of mine) {
    const { shelf, box } = r.item.location;
    if (isNum(shelf) && num(shelf) > 0) shelves = Math.max(shelves, num(shelf));
    if (isNum(box) && num(box) > 0) boxes = Math.max(boxes, num(box));
  }
  const cells: Cell[][] = Array.from({ length: shelves }, (_, s) => Array.from({ length: boxes }, (_, b) => ({ shelf: s + 1, box: b + 1, rows: [] as VaultRow[] })));
  const other = new Map<string, { key: string; label: string; loc: ItemLocation; rows: VaultRow[] }>();
  for (const r of mine) {
    const { shelf, box } = r.item.location;
    if (isNum(shelf) && isNum(box) && num(shelf) > 0 && num(box) > 0) {
      cells[num(shelf) - 1][num(box) - 1].rows.push(r);
    } else {
      const k = slotKey(r.item.location);
      const e = other.get(k) ?? { key: k, label: placeText(r.item.location), loc: r.item.location, rows: [] };
      e.rows.push(r);
      other.set(k, e);
    }
  }
  const used = cells.flat().filter((c) => c.rows.length).length + other.size;
  const max = Math.max(1, ...cells.flat().map((c) => c.rows.length));
  return { vault, shelves, boxes, cells, elsewhere: [...other.values()], used, max };
}

/** Where an item is kept, written for a person ("Vault A · Shelf 3, box 12"). */
export function whereText(t: (key: 'vault.map.where', params: { s: string; b: string }) => string, f: { digits(s: string | number): string }, l: ItemLocation): string {
  return `${l.vault} · ${t('vault.map.where', { s: f.digits(l.shelf), b: f.digits(l.box) })}`;
}

/** The key of the map square an item sits in, or a key for its off-grid place. */
export function cellKey(l: ItemLocation): string {
  return isNum(l.shelf) && isNum(l.box) && num(l.shelf) > 0 && num(l.box) > 0 ? `${num(l.shelf)}:${num(l.box)}` : `else:${slotKey(l)}`;
}
