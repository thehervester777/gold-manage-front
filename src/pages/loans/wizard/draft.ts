import type { Carat, Category, Database, GoldRate, RatePlan } from '../../../lib/types';
import type { ISODate } from '../../../lib/dates';
import type { ItemInput } from '../../../lib/domain';
import { slotAt } from '../../../lib/domain';
import { GRAMS_PER_VORI } from '../../../lib/format';
import type { TKey } from '../../../lib/i18n';

export interface DraftItem {
  key: string;
  category: Category;
  description: string;
  carat: Carat;
  gross: number | null;
  stone: number | null;
  valuation: number | null;
  photo?: string;
  tagNo: string;
  vault: string;
  shelf: string;
  box: string;
}

export interface DraftTerms {
  date: ISODate;
  principal: number | null;
  /** A rate plan id, or "custom". */
  planId: string;
  customRate: number | null;
  term: number | null;
  notes: string;
}

export interface Draft {
  customerId: string | null;
  items: DraftItem[];
  terms: DraftTerms;
  confirm: boolean;
  confirmLtv: boolean;
}

let seq = 0;
export const itemKey = () => `di_${Date.now().toString(36)}_${seq++}`;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const netOf = (i: Pick<DraftItem, 'gross' | 'stone'>) => r3((i.gross ?? 0) - (i.stone ?? 0));

export function blankItem(db: Database, offset: number): DraftItem {
  const loc = slotAt(db.items.filter((i) => i.status === 'in_custody').length + offset);
  return {
    key: itemKey(),
    category: 'chain',
    description: '',
    carat: 22,
    gross: null,
    stone: null,
    valuation: null,
    tagNo: '',
    vault: loc.vault,
    shelf: loc.shelf,
    box: loc.box,
  };
}

export function blankDraft(db: Database, today: ISODate, plans: RatePlan[], term: number): Draft {
  const plan = plans.find((p) => p.active) ?? plans[0];
  return {
    customerId: null,
    items: [blankItem(db, 0)],
    terms: { date: today, principal: null, planId: plan?.id ?? 'custom', customRate: plan ? null : 5, term, notes: '' },
    confirm: false,
    confirmLtv: false,
  };
}

export interface ItemErrors {
  description?: TKey;
  gross?: TKey;
  stone?: TKey;
  valuation?: TKey;
}

export function itemErrors(i: DraftItem): ItemErrors {
  const e: ItemErrors = {};
  if (!i.description.trim()) e.description = 'err.descriptionRequired';
  if (!(i.gross && i.gross > 0)) e.gross = 'wiz.i.errGross';
  else if ((i.stone ?? 0) < 0 || netOf(i) <= 0) e.stone = 'wiz.i.errStone';
  if (!(i.valuation && i.valuation > 0)) e.valuation = 'wiz.i.errValue';
  return e;
}
export const itemValid = (i: DraftItem) => Object.keys(itemErrors(i)).length === 0;

const RATE_FIELD: Record<Carat, keyof GoldRate> = { 18: 'k18', 21: 'k21', 22: 'k22', 24: 'k24' };

/** Value of the net gold at today's market rate for its purity, to the nearest ten taka. */
export function marketValue(i: DraftItem, rates: GoldRate[]): number | null {
  const rate = rates[rates.length - 1];
  const net = netOf(i);
  if (!rate || net <= 0) return null;
  const perVori = rate[RATE_FIELD[i.carat]] as number;
  return Math.round(((net / GRAMS_PER_VORI) * perVori) / 10) * 10;
}

export const toItemInput = (i: DraftItem): ItemInput => ({
  category: i.category,
  description: i.description,
  carat: i.carat,
  grossWeight: i.gross ?? 0,
  stoneWeight: i.stone ?? 0,
  valuation: i.valuation ?? 0,
  photo: i.photo,
  tagNo: i.tagNo,
  location: { vault: i.vault.trim() || 'Vault A', shelf: i.shelf.trim() || '1', box: i.box.trim() || '1' },
});

export function totals(items: DraftItem[]) {
  return {
    count: items.length,
    net: r3(items.reduce((s, i) => s + netOf(i), 0)),
    gross: r3(items.reduce((s, i) => s + (i.gross ?? 0), 0)),
    value: items.reduce((s, i) => s + (i.valuation ?? 0), 0),
  };
}
