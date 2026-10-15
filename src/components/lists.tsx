import { useCallback, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cx } from '../lib/cx';

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function useSort<K extends string>(initial: K, dir: SortDir = 'desc', textKeys: readonly K[] = []) {
  const [sort, set] = useState<SortState<K>>({ key: initial, dir });
  const toggle = useCallback(
    (key: K) =>
      set((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: textKeys.includes(key) ? 'asc' : 'desc' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return [sort, toggle] as const;
}

export const compareValues = (a: string | number | undefined, b: string | number | undefined): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' });
};

export function SortTh<K extends string>({ id, label, sort, onSort, align, className }: { id: K; label: ReactNode; sort: SortState<K>; onSort: (k: K) => void; align?: 'right' | 'center'; className?: string }) {
  const active = sort.key === id;
  return (
    <th className={cx(align === 'right' && 'r', align === 'center' && 'c', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={cx('sort-btn', active && 'is-active', align === 'right' && 'sort-btn--r')} onClick={() => onSort(id)}>
        {label}
        {active ? sort.dir === 'asc' ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden /> : <ChevronsUpDown size={13} aria-hidden />}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Layout bits shared by list and detail screens
// ---------------------------------------------------------------------------
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('toolbar', className)}>{children}</div>;
}

export function StatTile({ label, value, sub, tone, icon, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'ok' | 'gold' | 'warn'; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx('stat', tone && `stat--${tone}`, className)}>
      <div className="stat__top">
        {icon ? <span className="stat__icon">{icon}</span> : null}
        <span className="stat__label">{label}</span>
      </div>
      <b className="stat__value serif-num">{value}</b>
      {sub ? <span className="stat__sub">{sub}</span> : null}
    </div>
  );
}

export function KV({ items, tight }: { items: { label: ReactNode; value: ReactNode; hide?: boolean }[]; tight?: boolean }) {
  return (
    <dl className={cx('kv', tight && 'kv--tight')}>
      {items
        .filter((i) => !i.hide)
        .map((i, idx) => (
          <div key={idx} style={{ display: 'contents' }}>
            <dt>{i.label}</dt>
            <dd>{i.value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** A section heading inside a card or page. */
export function SectionTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="section-title">
      <div style={{ minWidth: 0 }}>
        <h2 className="h3">{title}</h2>
        {sub ? <p className="muted small" style={{ marginTop: 2 }}>{sub}</p> : null}
      </div>
      {actions ? <div className="row" style={{ flex: 'none' }}>{actions}</div> : null}
    </div>
  );
}
