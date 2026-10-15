/**
 * Calendar-date helpers. Dates are plain ISO strings (YYYY-MM-DD) so they can be
 * stored, compared and sorted without time-zone surprises.
 */
export type ISODate = string;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** Today in the user's local time zone. `__IGH_TODAY__` lets tests pin the date. */
export function todayISO(): ISODate {
  const pinned = (globalThis as { __IGH_TODAY__?: string }).__IGH_TODAY__;
  if (pinned) return pinned;
  const n = new Date();
  return toISO(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function nowStamp(): string {
  return new Date().toISOString();
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(s: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(s);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Calendar month shift; the day is clamped to the target month's length. */
export function addMonths(s: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const A = parseISO(a);
  const B = parseISO(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86_400_000);
}

export const cmpISO = (a: ISODate, b: ISODate): number => (a < b ? -1 : a > b ? 1 : 0);
export const maxISO = (a: ISODate, b: ISODate): ISODate => (a >= b ? a : b);
export const minISO = (a: ISODate, b: ISODate): ISODate => (a <= b ? a : b);

export function startOfMonth(s: ISODate): ISODate {
  const { y, m } = parseISO(s);
  return toISO(y, m, 1);
}

export function endOfMonth(s: ISODate): ISODate {
  const { y, m } = parseISO(s);
  return toISO(y, m, daysInMonth(y, m));
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

/** `count` month keys ending with the month of `end`, oldest first. */
export function lastMonthKeys(end: ISODate, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(monthKey(addMonths(startOfMonth(end), -i)));
  return out;
}

/**
 * A Bangladesh wall-clock time as a UTC ISO timestamp (used by the seed data). Every stamp in the
 * database uses this one shape, so plain string comparison puts stamps in true time order.
 */
export function stampAt(date: ISODate, hour: number, minute: number): string {
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00+06:00`).toISOString();
}

/** The calendar day a stamp falls on in the viewer's own time zone (stamps are UTC). */
export function localDateOf(stamp: string): ISODate {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return stamp.slice(0, 10);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** `YYYY-MM-DD HH:mm` of a stamp in the viewer's own time zone (for spreadsheets and file names). */
export function localStampText(stamp: string): string {
  const d = new Date(stamp);
  if (Number.isNaN(d.getTime())) return stamp.slice(0, 16).replace('T', ' ');
  return `${localDateOf(stamp)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
