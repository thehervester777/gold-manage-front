import type { AuditEntity, AuditEntry, Database } from '../../lib/types';
import type { TFn, TKey } from '../../lib/i18n';
import type { Fmt } from '../../lib/format';
import { hasKey } from '../../lib/auditText';

export type Area = 'loans' | 'customers' | 'items' | 'people' | 'settings' | 'backup' | 'signins';
export const AREAS: Area[] = ['loans', 'customers', 'items', 'people', 'settings', 'backup', 'signins'];

export const AREA_OF: Record<AuditEntity, Area> = {
  customer: 'customers',
  loan: 'loans',
  payment: 'loans',
  receipt: 'loans',
  interest: 'loans',
  item: 'items',
  user: 'people',
  role: 'people',
  settings: 'settings',
  rate_plan: 'settings',
  backup: 'backup',
  session: 'signins',
};

/** Changes that matter for access, money rules and data safety. */
export const isAdminEntry = (e: AuditEntry) => e.entity === 'user' || e.entity === 'role' || e.entity === 'settings' || e.entity === 'rate_plan' || e.action === 'restore';
export const isHandEntry = (e: AuditEntry) => e.action === 'override' || e.action === 'manual_check';

/** Where the record an entry is about can be opened, if it still exists. */
export function recordLink(db: Database, e: AuditEntry): { to: string; perm: 'loans.view' | 'customers.view' | 'receipts.view' } | null {
  switch (e.entity) {
    case 'loan':
    case 'interest':
      return db.loans.some((l) => l.id === e.entityId) ? { to: `/loans/${e.entityId}`, perm: 'loans.view' } : null;
    case 'payment': {
      const p = db.payments.find((x) => x.id === e.entityId);
      return p ? { to: `/loans/${p.loanId}`, perm: 'loans.view' } : null;
    }
    case 'customer':
      return db.customers.some((c) => c.id === e.entityId) ? { to: `/customers/${e.entityId}`, perm: 'customers.view' } : null;
    case 'receipt':
      return db.receipts.some((r) => r.id === e.entityId) ? { to: `/receipts/${e.entityId}`, perm: 'receipts.view' } : null;
    default:
      return null;
  }
}

const MONEY_META = new Set(['principal', 'interest', 'amount', 'collected', 'auto', 'manual', 'variance']);

/** The numbers and choices recorded alongside an entry, worded for a reader. */
export function metaFacts(e: AuditEntry, t: TFn, f: Fmt): { key: string; label: string; value: string }[] {
  if (!e.meta) return [];
  const out: { key: string; label: string; value: string }[] = [];
  for (const [k, raw] of Object.entries(e.meta)) {
    if (!hasKey(`aud.meta.${k}`)) continue;
    const num = Number(raw);
    let value: string;
    if (MONEY_META.has(k)) value = f.money(num);
    else if (k === 'rate') value = f.pct(num);
    else if (k === 'items') value = t('common.itemCount', { n: num });
    else if (k === 'termMonths') value = t('common.monthCount', { n: num });
    else if (k === 'customers' || k === 'loans') value = f.n(num);
    else if (k === 'size') value = t('aud.kb', { n: f.n(num / 1024, 1) });
    else if (k === 'method') value = hasKey(`method.${raw}`) ? t(`method.${raw}` as TKey) : String(raw);
    else if (k === 'type') value = hasKey(`rtype.${raw}`) ? t(`rtype.${raw}` as TKey) : String(raw);
    else if (k === 'scope') value = hasKey(`aud.scope.${raw}`) ? t(`aud.scope.${raw}` as TKey) : String(raw);
    else if (k === 'kind') {
      const key = e.entity === 'backup' ? `aud.bk.${raw}` : `loan.d.adj.${raw}`;
      value = hasKey(key) ? t(key as TKey) : String(raw);
    } else value = String(raw);
    out.push({ key: k, label: t(`aud.meta.${k}` as TKey), value });
  }
  return out;
}
