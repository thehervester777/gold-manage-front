import type { Report, Section } from './build';

/** CSS pixels at 96 dpi: A4 is 210 x 297 mm. */
export const PAGE = {
  portrait: { w: 794, h: 1123 },
  landscape: { w: 1123, h: 794 },
} as const;

// Fixed heights, so every page can be laid out without measuring anything.
export const PAD_X = 44;
export const PAD_TOP = 40;
export const PAD_BOTTOM = 36;
export const FOOT_H = 30;
export const BRAND_H = 64;
export const TITLE_H = 62;
export const TITLE_GAP = 16;
export const META_ROW_H = 36;
export const HEAD_GAP = 14;
export const RUN_H = 42;
export const KPI_H = 90;
export const SEC_GAP = 18;
export const SEC_TITLE_H = 30;
export const SEC_NOTE_H = 22;
export const SEC_NOTE_H2 = 36;
export const THEAD_H = 30;
export const ROW_H = 27;
export const FOOT_ROW_H = 32;
export const EMPTY_H = 40;
export const META_COLS = 3;

export interface Frag {
  sec: Section;
  from: number;
  to: number;
  /** Continues a table that started on an earlier page. */
  cont: boolean;
  foot: boolean;
  empty: boolean;
}
export interface PageSpec {
  first: boolean;
  frags: Frag[];
}

/** A rough width for a line of text, in CSS pixels at the given font size (Bangla letters run wider). */
export function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[\u0980-\u09FF]/.test(ch) ? size * 0.62 : /[\u0030-\u0039]/.test(ch) ? size * 0.56 : size * 0.52;
  return w;
}

/** Notes sit under a section title; a long one takes two lines. */
export function noteHeight(s: Section, pageWidth: number): number {
  if (!s.note) return 0;
  return textWidth(s.note, 11.5) > pageWidth - PAD_X * 2 - 8 ? SEC_NOTE_H2 : SEC_NOTE_H;
}

export function metaRows(meta: Report['meta']): number {
  let rows = 0;
  let col = 0;
  for (const m of meta) {
    if (m.wide) {
      if (col > 0) rows += 1;
      rows += 1;
      col = 0;
    } else {
      if (col === 0) rows += 1;
      col = (col + 1) % META_COLS;
    }
  }
  return rows;
}

export const headHeight = (r: Report) => BRAND_H + TITLE_GAP + TITLE_H + metaRows(r.meta) * META_ROW_H + HEAD_GAP;

/** Splits a report into A4 pages, keeping headings with their rows and repeating table heads. */
export function paginate(r: Report): PageSpec[] {
  const dim = r.landscape ? PAGE.landscape : PAGE.portrait;
  const body = dim.h - PAD_TOP - PAD_BOTTOM - FOOT_H;
  const pages: PageSpec[] = [{ first: true, frags: [] }];
  let page = pages[0];
  let avail = body - headHeight(r) - (r.kpis.length ? KPI_H : 0);
  let used = 0;
  const next = () => {
    page = { first: false, frags: [] };
    pages.push(page);
    avail = body - RUN_H;
    used = 0;
  };

  for (const s of r.sections) {
    const n = s.rows.length;
    if (n === 0) {
      const need = (page.frags.length ? SEC_GAP : 0) + (s.title ? SEC_TITLE_H : 0) + noteHeight(s, dim.w) + EMPTY_H;
      if (used + need > avail && page.frags.length) next();
      page.frags.push({ sec: s, from: 0, to: 0, cont: false, foot: false, empty: true });
      used += need;
      continue;
    }
    let i = 0;
    let cont = false;
    while (i < n) {
      const gap = page.frags.length ? SEC_GAP : 0;
      const head = (s.title ? SEC_TITLE_H : 0) + (cont ? 0 : noteHeight(s, dim.w)) + THEAD_H;
      const room = avail - used - gap - head;
      const remain = n - i;
      const footH = s.foot ? FOOT_ROW_H : 0;
      if (room >= remain * ROW_H + footH) {
        page.frags.push({ sec: s, from: i, to: n, cont, foot: !!s.foot, empty: false });
        used += gap + head + remain * ROW_H + footH;
        break;
      }
      let take = Math.min(Math.floor(room / ROW_H), remain);
      if (take < Math.min(3, remain) && page.frags.length > 0) {
        next();
        continue;
      }
      if (take >= remain && s.foot) take = Math.max(1, remain - 1);
      // never leave a single row stranded on the next page
      if (take < remain && remain - take < 2 && take > 3) take -= 1;
      take = Math.max(1, take);
      page.frags.push({ sec: s, from: i, to: i + take, cont, foot: false, empty: false });
      i += take;
      cont = true;
      if (i < n || s.foot) next();
      else used += gap + head + take * ROW_H;
    }
  }
  return pages;
}
