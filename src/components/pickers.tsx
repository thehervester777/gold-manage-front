import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { cx } from '../lib/cx';
import { useFmt, useLang, useT, useToday } from '../lib/hooks';
import { type ISODate, addMonths, cmpISO, daysInMonth, parseISO, toISO } from '../lib/dates';
import { normalizeQuery } from '../lib/format';
import { Field } from './controls';
import { gsap } from '../motion/gsap';
import { fullMotion } from '../motion/fx';

// ---------------------------------------------------------------------------
// Popover anchored to an element, rendered in a portal so dialogs never clip it
// ---------------------------------------------------------------------------
interface Pos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

function usePopoverPosition(anchor: RefObject<HTMLElement | null>, open: boolean, minWidth: number, estHeight: number): Pos | null {
  const [pos, setPos] = useState<Pos | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const below = vh - r.bottom;
      const flip = below < Math.min(estHeight, 320) && r.top > below;
      const width = Math.min(Math.max(r.width, minWidth), vw - 16);
      setPos({
        left: Math.max(8, Math.min(r.left, vw - width - 8)),
        width,
        top: flip ? undefined : r.bottom + 6,
        bottom: flip ? vh - r.top + 6 : undefined,
        maxHeight: Math.max(160, (flip ? r.top : below) - 18),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchor, minWidth, estHeight]);
  return pos;
}

function Popover({ anchor, open, onClose, minWidth = 0, estHeight = 320, className, children }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; minWidth?: number; estHeight?: number; className?: string; children: ReactNode }) {
  const pos = usePopoverPosition(anchor, open, minWidth, estHeight);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, anchor]);

  useLayoutEffect(() => {
    if (pos && ref.current && fullMotion()) {
      gsap.fromTo(ref.current, { opacity: 0, y: pos.top != null ? -8 : 8, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'igh', overwrite: true });
    }
    // animate only when it first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos == null]);

  if (!open || !pos) return null;
  return createPortal(
    <div
      ref={ref}
      className={cx('pop', className)}
      data-lenis-prevent
      style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Date field with a calendar that speaks the current language
// ---------------------------------------------------------------------------
interface DateFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  value: ISODate;
  onChange: (v: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  disabled?: boolean;
  className?: string;
  big?: boolean;
  placeholder?: string;
}

export function DateField({ label, hint, error, optional, value, onChange, min, max, disabled, className, big, placeholder }: DateFieldProps) {
  const f = useFmt();
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ISODate>(() => (value || today).slice(0, 8) + '01');
  const [focusDay, setFocusDay] = useState<ISODate | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) {
      setView((value || today).slice(0, 8) + '01');
      setFocusDay(value || today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { y, m } = parseISO(view);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = daysInMonth(y, m);
  const dow = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: lang === 'bn' ? 'short' : 'narrow', timeZone: 'UTC' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
  }, [lang]);
  const disabledDay = (iso: ISODate) => (min != null && cmpISO(iso, min) < 0) || (max != null && cmpISO(iso, max) > 0);
  const cells: (ISODate | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => toISO(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const pick = (iso: ISODate) => {
    if (disabledDay(iso)) return;
    onChange(iso);
    setOpen(false);
    btn.current?.focus();
  };
  const moveFocus = (iso: ISODate) => {
    setFocusDay(iso);
    const p = parseISO(iso);
    if (p.y !== y || p.m !== m) setView(toISO(p.y, p.m, 1));
  };
  const onGridKey = (e: KeyboardEvent) => {
    if (!focusDay) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      const p = parseISO(focusDay);
      const d = new Date(Date.UTC(p.y, p.m - 1, p.d + step[e.key]));
      moveFocus(toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    }
  };
  useEffect(() => {
    if (open && focusDay) document.querySelector<HTMLButtonElement>(`.cal [data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }, [focusDay, view, open]);

  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className} as="div">
      <button
        ref={btn}
        type="button"
        className={cx('input date-trigger', big && 'input--lg')}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={cx('truncate', !value && 'muted')}>{value ? f.date(value) : placeholder ?? t('common.select')}</span>
        <Calendar size={17} aria-hidden />
      </button>
      <Popover anchor={btn} open={open} onClose={close} minWidth={304} estHeight={380} className="pop--cal">
        <div className="cal" role="dialog" aria-label={f.monthYear(view)}>
          <div className="cal__head">
            <button type="button" className="cal__nav" aria-label={t('common.previous')} onClick={() => setView(addMonths(view, -12))}><ChevronsLeft size={16} /></button>
            <button type="button" className="cal__nav" aria-label={t('common.previous')} onClick={() => setView(addMonths(view, -1))}><ChevronLeft size={16} /></button>
            <b className="cal__title">{f.monthYear(view)}</b>
            <button type="button" className="cal__nav" aria-label={t('common.next')} onClick={() => setView(addMonths(view, 1))}><ChevronRight size={16} /></button>
            <button type="button" className="cal__nav" aria-label={t('common.next')} onClick={() => setView(addMonths(view, 12))}><ChevronsRight size={16} /></button>
          </div>
          <div className="cal__dow">{dow.map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="cal__grid" onKeyDown={onGridKey}>
            {cells.map((iso, i) =>
              iso ? (
                <button
                  key={iso}
                  type="button"
                  data-day={iso}
                  tabIndex={iso === focusDay ? 0 : -1}
                  className={cx('cal__day', iso === value && 'is-selected', iso === today && 'is-today')}
                  disabled={disabledDay(iso)}
                  onClick={() => pick(iso)}
                >
                  {f.digits(parseISO(iso).d)}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          <div className="cal__foot">
            <button type="button" className="link" disabled={disabledDay(today)} onClick={() => pick(today)}>{t('common.today')}</button>
          </div>
        </div>
      </Popover>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Searchable select
// ---------------------------------------------------------------------------
export interface ComboOption {
  id: string;
  label: string;
  sub?: string;
  /** Lower-case text the query is matched against. */
  search: string;
  right?: ReactNode;
}

interface ComboProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  big?: boolean;
  clearable?: boolean;
  /** Shown first when the query is empty. */
  max?: number;
}

export function Combobox({ label, hint, error, optional, value, onChange, options, placeholder, searchPlaceholder, emptyText, disabled, className, big, clearable, max = 50 }: ComboProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setQ('');
  }, []);

  const selected = options.find((o) => o.id === value);
  const results = useMemo(() => {
    const tokens = normalizeQuery(q).split(/\s+/).filter(Boolean);
    const found = tokens.length ? options.filter((o) => tokens.every((tk) => o.search.includes(tk))) : options;
    return found.slice(0, max);
  }, [q, options, max]);

  useEffect(() => setActive(0), [q, open]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (o: ComboOption) => {
    onChange(o.id);
    close();
    btn.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    }
  };

  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className} as="div">
      <button ref={btn} type="button" className={cx('input date-trigger', big && 'input--lg')} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={cx('truncate', !selected && 'muted')}>
          {selected ? (
            <>
              {selected.label}
              {selected.sub ? <span className="muted"> · {selected.sub}</span> : null}
            </>
          ) : (
            placeholder ?? t('common.select')
          )}
        </span>
        <ChevronDown size={17} aria-hidden />
      </button>
      <Popover anchor={btn} open={open} onClose={close} minWidth={300} estHeight={360} className="pop--combo">
        <div className="combo">
          <div className="combo__search">
            <Search size={16} aria-hidden />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={searchPlaceholder ?? t('common.search')} aria-label={t('common.search')} />
          </div>
          <div className="combo__list" ref={list} role="listbox">
            {results.length === 0 ? <div className="combo__empty">{emptyText ?? t('common.noResults')}</div> : null}
            {results.map((o, i) => (
              <button key={o.id} type="button" role="option" aria-selected={o.id === value} data-i={i} className={cx('combo__opt', i === active && 'is-active')} onMouseMove={() => setActive(i)} onClick={() => choose(o)}>
                <span className="combo__main">
                  <b>{o.label}</b>
                  {o.sub ? <span>{o.sub}</span> : null}
                </span>
                {o.right}
                {o.id === value ? <Check size={16} className="combo__check" aria-hidden /> : null}
              </button>
            ))}
          </div>
          {clearable && value ? (
            <button type="button" className="combo__clear" onClick={() => { onChange(null); close(); }}>
              {t('common.clear')}
            </button>
          ) : null}
        </div>
      </Popover>
    </Field>
  );
}
