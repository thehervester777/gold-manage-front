import {
  forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cx } from '../lib/cx';
import { useFmt, useLang } from '../lib/hooks';
import { parseNum } from '../lib/format';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'outline-danger' | 'onink';
interface BtnBase {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  magnetic?: boolean;
}
const btnClass = (p: BtnBase, hasChildren: boolean, extra?: string) =>
  cx('btn', `btn--${p.variant ?? 'secondary'}`, p.size && p.size !== 'md' && `btn--${p.size}`, !hasChildren && 'btn--icon', p.block && 'btn--block', extra);

export const Button = forwardRef<HTMLButtonElement, BtnBase & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>(function Button(
  { variant, size, icon, iconRight, block, magnetic, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={btnClass({ variant, size, block }, children != null && children !== false, className)}
      disabled={disabled || loading}
      data-magnetic={magnetic ? '0.22' : undefined}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function ButtonLink({ variant, size, icon, iconRight, block, magnetic, className, children, ...rest }: BtnBase & LinkProps) {
  return (
    <Link className={btnClass({ variant, size, block }, children != null, className)} data-magnetic={magnetic ? '0.22' : undefined} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
interface FieldShell {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  className?: string;
}

export function Field({ label, hint, error, optional, className, children, as = 'label' }: FieldShell & { children: ReactNode; as?: 'label' | 'div' }) {
  const Tag = as;
  return (
    <Tag className={cx('field', error && 'field--error', className)}>
      {label ? (
        <span className="field__label">
          <span>{label}</span>
          {optional ? <small>{optional}</small> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="field__error" role="alert">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </Tag>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void; mono?: boolean; big?: boolean }>(
  function TextField({ label, hint, error, optional, className, value, onChange, mono, big, ...rest }, ref) {
    return (
      <Field label={label} hint={hint} error={error} optional={optional} className={className}>
        <input ref={ref} className={cx('input', mono && 'input--mono', big && 'input--lg')} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      </Field>
    );
  },
);

export function TextAreaField({ label, hint, error, optional, className, value, onChange, ...rest }: FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea className="textarea" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function SelectField<T extends string>({ label, hint, error, optional, className, value, onChange, options, ...rest }: FieldShell & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[] }) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

interface NumberFieldProps extends FieldShell {
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  big?: boolean;
  id?: string;
  'aria-label'?: string;
  onBlur?: () => void;
}

/** Number input that accepts Bengali or Latin digits and shows lakh grouping when you leave it. */
export function NumberField({ label, hint, error, optional, className, value, onChange, prefix, suffix, decimals = 0, big, ...rest }: NumberFieldProps) {
  const f = useFmt();
  const display = useCallback((v: number | null) => (v == null ? '' : f.n(v, decimals)), [f, decimals]);
  const [text, setText] = useState(display(value));
  const focused = useRef(false);
  const last = useRef(value);

  useEffect(() => {
    if (!focused.current || last.current !== value) setText(display(value));
    last.current = value;
  }, [value, display]);

  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      <span className={cx('input-group', suffix && 'input-group--post')}>
        {prefix ? <span className="input-group__pre">{prefix}</span> : null}
        <input
          className={cx('input', big && 'input--lg')}
          style={prefix ? undefined : { paddingLeft: 13 }}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onFocus={(e) => {
            focused.current = true;
            // show a plain editable number while typing
            setText(value == null ? '' : String(value).replace(/\d/g, (d) => (f.lang === 'bn' ? '০১২৩৪৫৬৭৮৯'[+d] : d)));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const n = parseNum(raw);
            const v = Number.isNaN(n) ? null : decimals === 0 ? Math.round(n) : Math.round(n * 10 ** decimals) / 10 ** decimals;
            last.current = v;
            onChange(v);
          }}
          onBlur={() => {
            focused.current = false;
            setText(display(value));
            rest.onBlur?.();
          }}
          {...{ placeholder: rest.placeholder, disabled: rest.disabled, autoFocus: rest.autoFocus, id: rest.id, 'aria-label': rest['aria-label'] }}
        />
        {suffix ? <span className="input-group__post">{suffix}</span> : null}
      </span>
    </Field>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" />
      <span className="switch__thumb" />
    </span>
  );
}

export function CheckBox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Segmented control and tabs (both slide an indicator to the active item)
// ---------------------------------------------------------------------------
interface Item<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

function useIndicator(value: string, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const lang = useLang();
  const measure = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    setBox(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, []);
  useLayoutEffect(measure, [value, lang, measure, ...deps]);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
  }, [measure]);
  return { ref, box };
}

export function Segmented<T extends string>({ items, value, onChange, label }: { items: Item<T>[]; value: T; onChange: (v: T) => void; label?: string }) {
  const { ref, box } = useIndicator(value, [items.length]);
  const f = useFmt();
  return (
    <div className="seg" role="group" aria-label={label} ref={ref}>
      {box ? <span className="seg__thumb" style={{ transform: `translateX(${box.x}px)`, width: box.w }} /> : null}
      {items.map((it) => (
        <button key={it.id} type="button" className="seg__btn" aria-pressed={it.id === value} data-active={it.id === value} onClick={() => onChange(it.id)}>
          {it.icon}
          {it.label}
          {it.count != null ? <span className="seg__count">{f.n(it.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange, label }: { items: Item<T>[]; value: T; onChange: (v: T) => void; label?: string }) {
  const { ref, box } = useIndicator(value, [items.length]);
  const id = useId();
  const f = useFmt();
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={ref}>
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" id={`${id}-${it.id}`} className="tab" aria-selected={it.id === value} data-active={it.id === value} onClick={() => onChange(it.id)}>
          {it.icon}
          {it.label}
          {it.count != null ? <span className="seg__count" style={{ background: 'var(--surface-3)' }}>{f.n(it.count)}</span> : null}
        </button>
      ))}
      {box ? <span className="tabs__ind" style={{ transform: `translateX(${box.x}px)`, width: box.w }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'gold';
export function Chip({ tone = 'neutral', children, plain, large, className, pulse }: { tone?: Tone; children: ReactNode; plain?: boolean; large?: boolean; className?: string; pulse?: boolean }) {
  return <span className={cx('chip', tone !== 'neutral' && `chip--${tone}`, plain && 'chip--plain', large && 'chip--lg', pulse && 'chip--pulse', className)}>{children}</span>;
}
