import { useCallback, useMemo } from 'react';
import type { Bilingual, Database, Lang, Permission, Role, Settings, User } from './types';
import type { ISODate } from './dates';
import { useApp, selectLang, selectRole, selectUser } from './store';
import { makeT, type TFn, type TKey } from './i18n';
import { makeFmt, type Fmt } from './format';
import { AppError } from './domain';
import { loanRows, portfolio, kpiTrend, type LoanRow, type Portfolio, type KpiTrend } from './selectors';
import { toast } from './ui';

export const useLang = (): Lang => useApp(selectLang);
export const useT = (): TFn => {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
};
export const useFmt = (): Fmt => {
  const lang = useLang();
  return useMemo(() => makeFmt(lang), [lang]);
};
/** Pick the right half of a bilingual pair. */
export const useBi = () => {
  const lang = useLang();
  return useCallback((b: Bilingual) => b[lang] || b.en, [lang]);
};

export const useDb = (): Database => {
  const db = useApp((s) => s.db);
  if (!db) throw new Error('Database is not ready');
  return db;
};
export const useSettings = (): Settings => useDb().settings;
export const useToday = (): ISODate => useApp((s) => s.today);
export const useUser = (): User => {
  const u = useApp(selectUser);
  if (!u) throw new Error('Not signed in');
  return u;
};
export const useRole = (): Role | undefined => useApp(selectRole);
export const useCan = (perm: Permission): boolean => useApp((s) => !!selectRole(s)?.permissions.includes(perm));
/** Several permissions at once, as a stable object. */
export const useCanAll = <K extends Permission>(perms: readonly K[]): Record<K, boolean> => {
  const role = useApp(selectRole);
  return useMemo(() => Object.fromEntries(perms.map((p) => [p, !!role?.permissions.includes(p)])) as Record<K, boolean>, [role, perms]);
};

// ---- memoised read models ---------------------------------------------------
const rowsCache = new WeakMap<Database, { today: ISODate; rows: LoanRow[]; pf?: Portfolio; trend?: KpiTrend }>();

function cached(db: Database, today: ISODate) {
  let e = rowsCache.get(db);
  if (!e || e.today !== today) {
    e = { today, rows: loanRows(db, today) };
    rowsCache.set(db, e);
  }
  return e;
}

export const useRows = (): LoanRow[] => {
  const db = useDb();
  const today = useToday();
  return cached(db, today).rows;
};

export const usePortfolio = (): Portfolio => {
  const db = useDb();
  const today = useToday();
  const e = cached(db, today);
  return (e.pf ??= portfolio(db, e.rows, today));
};

export const useKpiTrend = (): KpiTrend => {
  const db = useDb();
  const today = useToday();
  const e = cached(db, today);
  return (e.trend ??= kpiTrend(db, today, 8));
};

// ---- error handling ---------------------------------------------------------
export function errorText(t: TFn, e: unknown): string {
  if (e instanceof AppError) return t(e.key as TKey, e.params);
  return t('err.unexpected');
}

/** Wrap an action so any thrown AppError becomes a toast. Returns undefined on failure. */
export function useAction() {
  const t = useT();
  return useCallback(
    <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R | undefined => {
        try {
          return fn(...args);
        } catch (e) {
          toast.error(errorText(t, e));
          return undefined;
        }
      },
    [t],
  );
}
