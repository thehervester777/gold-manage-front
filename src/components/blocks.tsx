import { Fragment, useMemo, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cx } from '../lib/cx';
import { useFmt, useLang, useT } from '../lib/hooks';
import type { LoanState } from '../lib/domain';
import { Button, Chip, type Tone } from './controls';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ children, className, pad, flat, sunken, spot, clip, as, style, ...rest }: { children: ReactNode; className?: string; pad?: boolean; flat?: boolean; sunken?: boolean; spot?: boolean; clip?: boolean; as?: ElementType; style?: CSSProperties } & Record<string, unknown>) {
  const Tag = as ?? 'section';
  return (
    <Tag className={cx('card', pad && 'card--pad', flat && 'card--flat', sunken && 'card--sunken', spot && 'spot', clip && 'card--clip', className)} style={style} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHead({ title, sub, actions, id }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="card__head">
      <div className="card__titles">
        <h2 className="card__title" id={id}>{title}</h2>
        {sub ? <p className="card__sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row" style={{ flex: 'none' }}>{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------
export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, subtitle, actions, crumbs, badge }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; badge?: ReactNode }) {
  const lang = useLang();
  return (
    <header className="page-head">
      {crumbs?.length ? (
        <nav className="crumbs" aria-label="Breadcrumb" data-fx="fade">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 ? <ChevronRight size={14} aria-hidden /> : null}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </Fragment>
          ))}
        </nav>
      ) : null}
      <div className="page-head__row">
        <div style={{ minWidth: 0 }}>
          <div className="row row--wrap" style={{ gap: 12 }}>
            {typeof title === 'string' ? (
              <h1 key={lang} className="h1 page-head__title" data-fx="split">{title}</h1>
            ) : (
              <h1 className="h1 page-head__title">{title}</h1>
            )}
            {badge}
          </div>
          {subtitle ? <p className="page-head__sub" data-fx="rise" data-fx-delay="0.15">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-head__actions" data-fx="fade" data-fx-delay="0.2">{actions}</div> : null}
      </div>
      <div className="streak page-head__streak" data-fx="line" data-fx-delay="0.1" />
    </header>
  );
}

// ---------------------------------------------------------------------------
// Empty state, avatar, status
// ---------------------------------------------------------------------------
export function EmptyState({ title, body, action, compact }: { title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className="empty" style={compact ? { padding: '28px 20px' } : undefined}>
      <svg className="empty__art" width="76" height="56" viewBox="0 0 76 56" fill="none" aria-hidden="true">
        <path d="M14 30 22 16h32l8 14H14Z" fill="currentColor" opacity="0.28" />
        <path d="M14 30h48v14a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V30Z" fill="currentColor" opacity="0.55" />
        <path d="M22 16h32l8 14H14l8-14Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M6 52h64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </svg>
      <div className="empty__title">{title}</div>
      {body ? <div className="empty__body">{body}</div> : null}
      {action}
    </div>
  );
}

/** First visible letter of a name — handles Bangla conjunct clusters correctly. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const seg = (w: string) => {
    try {
      const S = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
      if (S) return [...new S(undefined, { granularity: 'grapheme' }).segment(w)][0].segment;
    } catch {
      /* fall through */
    }
    return Array.from(w)[0] ?? '';
  };
  const first = seg(words[0]);
  const isLatin = /^[A-Za-z]/.test(first);
  return isLatin && words.length > 1 ? (first + seg(words[words.length - 1])).toUpperCase() : first.toUpperCase();
}

export function Avatar({ name, size, tone }: { name: string; size?: 'sm' | 'lg' | 'xl'; tone?: 'gold' | 'ink' }) {
  return (
    <span className={cx('avatar', size && `avatar--${size}`, tone === 'ink' && 'avatar--ink')} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const STATE_TONE: Record<LoanState, Tone> = { active: 'info', overdue: 'danger', released: 'ok' };
export function StateChip({ state, large, dueSoon }: { state: LoanState; large?: boolean; dueSoon?: boolean }) {
  const t = useT();
  if (state === 'active' && dueSoon) return <Chip tone="warn" large={large}>{t('status.dueSoon')}</Chip>;
  return <Chip tone={STATE_TONE[state]} large={large} pulse={state === 'overdue'}>{t(`status.${state}`)}</Chip>;
}

// ---------------------------------------------------------------------------
// Search box, pagination
// ---------------------------------------------------------------------------
export function SearchBox({ value, onChange, placeholder, className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  const t = useT();
  return (
    <div className={cx('searchbox', className)}>
      <Search size={17} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t('common.search')} aria-label={placeholder ?? t('common.search')} autoFocus={autoFocus} />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label={t('common.clear')}>
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

export function usePaged<T>(list: T[], size = 12) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / size));
  const safe = Math.min(page, pages - 1);
  const slice = useMemo(() => list.slice(safe * size, safe * size + size), [list, safe, size]);
  return { slice, page: safe, pages, setPage, total: list.length, from: list.length ? safe * size + 1 : 0, to: Math.min(list.length, safe * size + size), reset: () => setPage(0) };
}

export function Pager({ paged }: { paged: ReturnType<typeof usePaged> }) {
  const t = useT();
  const f = useFmt();
  if (paged.pages <= 1) return null;
  return (
    <div className="pager">
      <span>{t('common.showing', { a: f.digits(`${paged.from}–${paged.to}`), b: paged.total })}</span>
      <div className="pager__btns">
        <Button size="sm" aria-label={t('common.previous')} disabled={paged.page === 0} onClick={() => paged.setPage(paged.page - 1)} icon={<ChevronLeft size={16} />} />
        <Button size="sm" aria-label={t('common.next')} disabled={paged.page >= paged.pages - 1} onClick={() => paged.setPage(paged.page + 1)} icon={<ChevronRight size={16} />} />
      </div>
    </div>
  );
}

export const rowDelay = (i: number): CSSProperties => ({ ['--i' as string]: i });
