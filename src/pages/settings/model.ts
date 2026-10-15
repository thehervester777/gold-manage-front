import type { GoldRate, Settings } from '../../lib/types';
import type { ISODate } from '../../lib/dates';
import type { TKey } from '../../lib/i18n';

export type SectionId = 'language' | 'account' | 'business' | 'rates' | 'appearance' | 'data';

export const SECTION_KEY: Record<SectionId, TKey> = {
  language: 'set.nav.language',
  account: 'set.nav.account',
  business: 'set.nav.business',
  rates: 'set.nav.rates',
  appearance: 'set.nav.appearance',
  data: 'set.nav.data',
};

// ---- gold rates ------------------------------------------------------------------------
export type CaratKey = 'k24' | 'k22' | 'k21' | 'k18';
export type Others = Record<'k24' | 'k21' | 'k18', number | null>;
export const OTHER_CARATS: { key: keyof Others; carat: number }[] = [
  { key: 'k24', carat: 24 },
  { key: 'k21', carat: 21 },
  { key: 'k18', carat: 18 },
];

/** The other carats worked out from the 22 carat price, by gold content. */
export function fromK22(k22: number): Others {
  const unit = k22 / 22;
  return { k24: Math.round(unit * 24), k21: Math.round(unit * 21), k18: Math.round(unit * 18) };
}

/** The most recent entry dated before `date` (or the newest one when nothing is older). */
export function previousRate(list: GoldRate[], date: ISODate): GoldRate | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].date < date) return list[i];
  return list.length ? list[list.length - 1] : undefined;
}

export const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : 0);

/** A move bigger than this between two entries is worth a second look before saving. */
export const BIG_MOVE_PCT = 8;

/** Higher carat gold never costs less than lower carat gold. */
export const inCaratOrder = (r: { k24: number; k22: number; k21: number; k18: number }) => r.k24 >= r.k22 && r.k22 >= r.k21 && r.k21 >= r.k18;

// ---- business details -----------------------------------------------------------------
export type Business = Settings['business'];

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^[0-9০-৯+\-\s()]{6,24}$/;

export const trimBusiness = (b: Business): Business => ({
  name: { en: b.name.en.trim(), bn: b.name.bn.trim() },
  tagline: { en: b.tagline.en.trim(), bn: b.tagline.bn.trim() },
  address: { en: b.address.en.trim(), bn: b.address.bn.trim() },
  phone: b.phone.trim(),
  email: b.email.trim(),
  licenseNo: b.licenseNo.trim(),
  receiptFooter: { en: b.receiptFooter.en.trim(), bn: b.receiptFooter.bn.trim() },
});

export const sameBusiness = (a: Business, b: Business) => JSON.stringify(trimBusiness(a)) === JSON.stringify(trimBusiness(b));

export interface BusinessErrors {
  nameEn?: TKey;
  nameBn?: TKey;
  phone?: TKey;
  email?: TKey;
}

export function validateBusiness(b: Business): BusinessErrors {
  const e: BusinessErrors = {};
  if (!b.name.en.trim()) e.nameEn = 'set.biz.err.name';
  if (!b.name.bn.trim()) e.nameBn = 'set.biz.err.name';
  if (b.phone.trim() && !PHONE_RE.test(b.phone.trim())) e.phone = 'set.biz.err.phone';
  if (b.email.trim() && !EMAIL_RE.test(b.email.trim())) e.email = 'set.biz.err.email';
  return e;
}

// ---- password strength --------------------------------------------------------------------
/** 0 = too short to rate, 1 = weak, 2 = fair, 3 = strong. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 6) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score >= 4 ? 3 : score >= 2 ? 2 : 1;
}
