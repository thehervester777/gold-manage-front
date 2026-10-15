import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { gsap } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { lockScroll } from '../motion/smooth';
import { useT } from '../lib/hooks';
import { useUi } from '../lib/ui';
import { Button } from './controls';
import { cx } from '../lib/cx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
  dismissable?: boolean;
  /** Wrap body and footer in a <form>. */
  onSubmit?: (e: FormEvent) => void;
  className?: string;
  bare?: boolean;
}

/** Open overlays, oldest first. Only the top one answers the Escape key. */
const overlayStack: symbol[] = [];

/** Shared mount/unmount, focus handling and animation for modals and drawers. */
function useOverlay(open: boolean, onClose: () => void, dismissable: boolean, kind: 'modal' | 'drawer') {
  const [mounted, setMounted] = useState(open);
  const scrim = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Escape also works when focus has dropped to the page (for example after a button became disabled)
  useEffect(() => {
    if (!mounted || !open || !dismissable) return;
    const id = Symbol('overlay');
    overlayStack.push(id);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || overlayStack[overlayStack.length - 1] !== id) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = overlayStack.indexOf(id);
      if (i >= 0) overlayStack.splice(i, 1);
    };
  }, [mounted, open, dismissable]);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    lockScroll(true);
    return () => {
      lockScroll(false);
      prevFocus.current?.focus?.({ preventScroll: true });
    };
  }, [mounted]);

  // enter
  useLayoutEffect(() => {
    if (!mounted || !open) return;
    const b = box.current;
    if (!b) return;
    if (fullMotion()) {
      gsap.killTweensOf([b, scrim.current]);
      gsap.fromTo(scrim.current, { opacity: 0 }, { opacity: 1, duration: 0.32, ease: 'power2.out' });
      if (kind === 'modal') gsap.fromTo(b, { opacity: 0, y: 30, scale: 0.965 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'igh' });
      else gsap.fromTo(b, { xPercent: 100 }, { xPercent: 0, duration: 0.7, ease: 'igh' });
    }
    const raf = requestAnimationFrame(() => {
      const el = b.querySelector<HTMLElement>('[data-autofocus]') ?? b.querySelector<HTMLElement>('.modal__body input, .drawer__body input, .modal__body select, .drawer__body select, .modal__body textarea');
      (el ?? b).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [mounted, open, kind]);

  // exit
  useEffect(() => {
    if (open || !mounted) return;
    if (!fullMotion()) {
      setMounted(false);
      return;
    }
    const tl = gsap.timeline({ onComplete: () => setMounted(false) });
    if (kind === 'modal') tl.to(box.current, { opacity: 0, y: 16, scale: 0.985, duration: 0.24, ease: 'power2.in' }, 0);
    else tl.to(box.current, { xPercent: 100, duration: 0.4, ease: 'power3.in' }, 0);
    tl.to(scrim.current, { opacity: 0, duration: 0.26 }, 0);
    return () => void tl.kill();
  }, [open, mounted, kind]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return { mounted, scrim, box, onKeyDown };
}

export function Modal({ open, onClose, title, subtitle, footer, children, width = 560, dismissable = true, onSubmit, className, bare }: OverlayProps) {
  const t = useT();
  const id = useId();
  const { mounted, scrim, box, onKeyDown } = useOverlay(open, onClose, dismissable, 'modal');
  if (!mounted) return null;
  const Body = onSubmit ? 'form' : 'div';
  const bodyProps = onSubmit ? { onSubmit, noValidate: true, className: 'modal__form' } : { className: 'modal__form' };
  return createPortal(
    <>
      <div className="scrim" ref={scrim} onClick={dismissable ? onClose : undefined} />
      <div className="modal-host">
        <div className={cx('modal', className)} ref={box} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} tabIndex={-1} style={{ ['--w' as string]: `${width}px` }} onKeyDown={onKeyDown}>
          {!bare && (title || dismissable) ? (
            <header className="modal__head">
              <div style={{ minWidth: 0 }}>
                {title ? <h2 className="modal__title" id={id}>{title}</h2> : null}
                {subtitle ? <p className="modal__sub">{subtitle}</p> : null}
              </div>
              {dismissable ? (
                <Button variant="ghost" size="sm" aria-label={t('common.close')} onClick={onClose} icon={<X size={18} />} data-close />
              ) : null}
            </header>
          ) : null}
          <Body {...bodyProps}>
            <div className="modal__body" data-lenis-prevent>{children}</div>
            {footer ? <footer className="modal__foot">{footer}</footer> : null}
          </Body>
        </div>
      </div>
    </>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, footer, children, width = 560, dismissable = true, onSubmit }: OverlayProps) {
  const t = useT();
  const id = useId();
  const { mounted, scrim, box, onKeyDown } = useOverlay(open, onClose, dismissable, 'drawer');
  if (!mounted) return null;
  const Body = onSubmit ? 'form' : 'div';
  const bodyProps = onSubmit ? { onSubmit, noValidate: true, className: 'drawer__form' } : { className: 'drawer__form' };
  return createPortal(
    <>
      <div className="scrim" ref={scrim} onClick={dismissable ? onClose : undefined} />
      <div className="drawer-host">
        <aside className="drawer" ref={box} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} tabIndex={-1} style={{ ['--w' as string]: `${width}px` }} onKeyDown={onKeyDown}>
          <header className="drawer__head">
            <div style={{ minWidth: 0 }}>
              {title ? <h2 className="modal__title" id={id}>{title}</h2> : null}
              {subtitle ? <p className="modal__sub">{subtitle}</p> : null}
            </div>
            <Button variant="ghost" size="sm" aria-label={t('common.close')} onClick={onClose} icon={<X size={18} />} />
          </header>
          <Body {...bodyProps}>
            <div className="drawer__body" data-lenis-prevent>{children}</div>
            {footer ? <footer className="drawer__foot">{footer}</footer> : null}
          </Body>
        </aside>
      </div>
    </>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (driven by confirmDialog() in lib/ui)
// ---------------------------------------------------------------------------
export function ConfirmHost() {
  const spec = useUi((s) => s.confirm);
  const [typed, setTyped] = useState('');
  const last = useRef(spec);
  if (spec) last.current = spec;
  useEffect(() => setTyped(''), [spec]);
  const s = spec ?? last.current;
  if (!s) return null;
  const blocked = !!s.requireText && typed.trim().toLowerCase() !== s.requireText.toLowerCase();
  return (
    <Modal
      open={!!spec}
      onClose={() => spec?.resolve(false)}
      title={s.title}
      width={460}
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) spec?.resolve(true);
      }}
      footer={
        <>
          <Button onClick={() => spec?.resolve(false)}>{s.cancelLabel}</Button>
          <Button type="submit" variant={s.tone === 'danger' ? 'danger' : 'primary'} disabled={blocked} data-autofocus={!s.requireText || undefined}>
            {s.confirmLabel}
          </Button>
        </>
      }
    >
      {s.body ? <p className="muted" style={{ lineHeight: 1.6 }}>{s.body}</p> : null}
      {s.requireText ? (
        <label className="field" style={{ marginTop: 16 }}>
          <span className="field__label">
            <span>{s.requireText}</span>
          </span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
        </label>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const drop = useUi((s) => s.dropToast);
  const t = useT();
  return createPortal(
    <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast--${x.kind} toast-in`} role={x.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast__icon">{x.kind === 'success' ? <CircleCheck size={16} /> : x.kind === 'error' ? <CircleAlert size={16} /> : <Info size={16} />}</span>
          <div>
            <div className="toast__title">{x.title}</div>
            {x.body ? <div className="toast__body">{x.body}</div> : null}
          </div>
          <button className="toast__x" onClick={() => drop(x.id)} aria-label={t('common.dismiss')}>
            <X size={15} />
          </button>
          <span className="toast__bar" />
        </div>
      ))}
    </div>,
    document.body,
  );
}
