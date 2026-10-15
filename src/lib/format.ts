/**
 * Language-aware formatting. Stored values are never touched: these helpers only
 * decide how a number, date or weight is shown (Latin vs Bengali digits, month
 * names, lakh/crore grouping, currency label).
 */
import type { Lang } from './types';
import type { ISODate } from './dates';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBnDigits = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[+d]);
export const toLatinDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Parse user input in either digit system. Returns NaN for empty/invalid input. */
export function parseNum(input: string | number | undefined | null): number {
  if (typeof input === 'number') return input;
  if (!input) return NaN;
  const s = toLatinDigits(String(input)).replace(/[,\s৳]/g, '');
  if (s === '' || s === '.' || s === '-') return NaN;
  return Number(s);
}

/** Accept Bengali digits when matching typed text (search boxes, IDs). */
export const normalizeQuery = (s: string) => toLatinDigits(s).trim().toLowerCase();

// en-IN gives lakh/crore grouping (12,48,500), which is how amounts are read in Bangladesh.
const locale = (lang: Lang) => (lang === 'bn' ? 'bn-BD' : 'en-IN');

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, maxFrac: number, minFrac = 0): Intl.NumberFormat {
  const key = `${lang}:${maxFrac}:${minFrac}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: maxFrac, minimumFractionDigits: minFrac });
    nfCache.set(key, f);
  }
  return f;
}

const dfCache = new Map<string, Intl.DateTimeFormat>();
function df(lang: Lang, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${lang}:${key}`;
  let f = dfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', opts);
    dfCache.set(k, f);
  }
  return f;
}

const utcDate = (iso: ISODate) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** bn-BD puts a comma after the month ("১৩ অক্টোবর, ২০২৬"); written Bangla does not. */
const bnTidy = (s: string) => s.replace(/, (?=[০-৯]{4})/, ' ');

function bnPeriod(h: number): string {
  if (h >= 4 && h < 12) return 'সকাল';
  if (h < 15 && h >= 12) return 'দুপুর';
  if (h >= 15 && h < 18) return 'বিকাল';
  if (h >= 18 && h < 20) return 'সন্ধ্যা';
  return 'রাত';
}

function timeText(stamp: string, lang: Lang): string {
  const d = new Date(stamp);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lang === 'bn') return `${bnPeriod(h)} ${toBnDigits(`${h12}:${m}`)}`;
  return `${h12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export interface Fmt {
  lang: Lang;
  /** Plain number with lakh/crore grouping. */
  n(v: number, maxFrac?: number, minFrac?: number): string;
  /** Currency: ৳ + number. */
  money(v: number, maxFrac?: number): string;
  /** Currency with an explicit sign for deltas. */
  signedMoney(v: number): string;
  /** 12.5 lakh style short form for axes and tight spaces. */
  compact(v: number): string;
  pct(v: number): string;
  date(iso: ISODate): string;
  dateLong(iso: ISODate): string;
  dateShort(iso: ISODate): string;
  monthYear(iso: ISODate | string): string;
  monthShort(iso: ISODate | string): string;
  dateTime(stamp: string): string;
  time(stamp: string): string;
  weight(g: number): string;
  vori(g: number): string;
  /** Identifiers such as LN-2026-00045 always keep Latin digits. */
  code(s: string): string;
  /** Digits only → Bengali digits when the language asks for them. */
  digits(s: string | number): string;
  words(v: number): string;
}

const SIGN_MINUS = '−';

export function makeFmt(lang: Lang): Fmt {
  const n = (v: number, maxFrac = 0, minFrac = 0) => nf(lang, maxFrac, minFrac).format(Number.isFinite(v) ? v : 0);
  const money = (v: number, maxFrac = 0) => `৳\u00a0${n(v, maxFrac)}`;
  return {
    lang,
    n,
    money,
    signedMoney: (v) => (v < 0 ? `${SIGN_MINUS}${money(Math.abs(v))}` : v > 0 ? `+${money(v)}` : money(0)),
    compact: (v) => compact(v, lang),
    pct: (v) => `${n(v, 2)}%`,
    date: (iso) => {
      const out = df(lang, 'd', { day: 'numeric', month: lang === 'bn' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(utcDate(iso));
      return lang === 'bn' ? bnTidy(out) : out;
    },
    dateLong: (iso) => {
      const out = df(lang, 'dl', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(iso));
      return lang === 'bn' ? bnTidy(out) : out;
    },
    dateShort: (iso) => df(lang, 'ds', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utcDate(iso)),
    monthYear: (iso) => df(lang, 'my', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(iso.length === 7 ? `${iso}-01` : iso)),
    monthShort: (iso) => df(lang, 'ms', { month: 'short', timeZone: 'UTC' }).format(utcDate(iso.length === 7 ? `${iso}-01` : iso)),
    dateTime: (stamp) => {
      const day = df(lang, 'dd', { day: 'numeric', month: lang === 'bn' ? 'long' : 'short', year: 'numeric' }).format(new Date(stamp));
      return `${lang === 'bn' ? bnTidy(day) : day}, ${timeText(stamp, lang)}`;
    },
    time: (stamp) => timeText(stamp, lang),
    weight: (g) => (lang === 'bn' ? `${n(g, 2, 2)} গ্রাম` : `${n(g, 2, 2)} g`),
    vori: (g) => voriText(g, lang),
    code: (s) => s,
    digits: (s) => (lang === 'bn' ? toBnDigits(String(s)) : String(s)),
    words: (v) => (lang === 'bn' ? wordsBn(v) : wordsEn(v)),
  };
}

// ---------------------------------------------------------------------------
// Compact numbers (lakh / crore)
// ---------------------------------------------------------------------------
function compact(v: number, lang: Lang): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? SIGN_MINUS : '';
  const fmt = (x: number) => nf(lang, x >= 100 ? 0 : 1).format(x);
  if (abs >= 1e7) return `${sign}${fmt(abs / 1e7)}${lang === 'bn' ? ' কোটি' : ' Cr'}`;
  if (abs >= 1e5) return `${sign}${fmt(abs / 1e5)}${lang === 'bn' ? ' লাখ' : ' L'}`;
  if (abs >= 1e3) return `${sign}${fmt(abs / 1e3)}${lang === 'bn' ? ' হাজার' : 'k'}`;
  return `${sign}${nf(lang, 0).format(abs)}`;
}

// ---------------------------------------------------------------------------
// Vori / ana / roti / point  (1 vori = 11.664 g, 16 ana, 6 roti per ana, 10 point per roti)
// ---------------------------------------------------------------------------
export const GRAMS_PER_VORI = 11.664;
const POINTS_PER_VORI = 16 * 6 * 10;

export function toVori(grams: number): { vori: number; ana: number; roti: number; point: number } {
  const total = Math.round((grams / GRAMS_PER_VORI) * POINTS_PER_VORI);
  const vori = Math.floor(total / POINTS_PER_VORI);
  let rem = total % POINTS_PER_VORI;
  const ana = Math.floor(rem / 60);
  rem %= 60;
  const roti = Math.floor(rem / 10);
  const point = rem % 10;
  return { vori, ana, roti, point };
}

function voriText(grams: number, lang: Lang): string {
  const v = toVori(grams);
  const names = lang === 'bn' ? ['ভরি', 'আনা', 'রতি', 'পয়েন্ট'] : ['vori', 'ana', 'roti', 'point'];
  const parts: string[] = [];
  const vals = [v.vori, v.ana, v.roti, v.point];
  vals.forEach((val, i) => {
    if (val > 0) parts.push(`${lang === 'bn' ? toBnDigits(String(val)) : val} ${names[i]}`);
  });
  if (parts.length === 0) parts.push(`${lang === 'bn' ? '০' : '0'} ${names[0]}`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Amount in words
// ---------------------------------------------------------------------------
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelow100(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${EN_TENS[t]}-${EN_ONES[o]}` : EN_TENS[t];
}

function enBelow1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (r) parts.push(enBelow100(r));
  return parts.join(' ');
}

export function wordsEn(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero Taka only';
  const units: [number, string][] = [[10_000_000, 'crore'], [100_000, 'lakh'], [1000, 'thousand']];
  const parts: string[] = [];
  for (const [size, name] of units) {
    if (n >= size) {
      parts.push(`${enBelow1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(enBelow1000(n));
  const text = parts.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} Taka only`;
}

const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোল', 'সতেরো', 'আঠারো', 'ঊনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আঠাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'অষ্টাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

function bnBelow1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${BN_0_99[h]} শত`);
  if (r) parts.push(BN_0_99[r]);
  return parts.join(' ');
}

export function wordsBn(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'শূন্য টাকা মাত্র';
  const units: [number, string][] = [[10_000_000, 'কোটি'], [100_000, 'লক্ষ'], [1000, 'হাজার']];
  const parts: string[] = [];
  for (const [size, name] of units) {
    if (n >= size) {
      parts.push(`${bnBelow1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(bnBelow1000(n));
  return `${parts.join(' ')} টাকা মাত্র`;
}
