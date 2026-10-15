/**
 * Pointer-driven polish, installed once for the whole app with delegated
 * listeners: spotlight cards follow the cursor, [data-tilt] leans toward it and
 * [data-magnetic] buttons are gently pulled. All of it is skipped on touch
 * devices and when motion is calm.
 */
import { gsap, canHover } from './gsap';
import { fullMotion } from './fx';

type Setter = { x: (v: number) => void; y: (v: number) => void; rx?: (v: number) => void; ry?: (v: number) => void };
const setters = new WeakMap<Element, Setter>();

function magnet(el: HTMLElement): Setter {
  let s = setters.get(el);
  if (!s) {
    s = {
      x: gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' }),
      y: gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' }),
    };
    setters.set(el, s);
  }
  return s;
}

function tilt(el: HTMLElement): Setter {
  let s = setters.get(el);
  if (!s) {
    gsap.set(el, { transformPerspective: 900 });
    s = {
      x: gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' }),
      y: gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' }),
      rx: gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' }),
      ry: gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' }),
    };
    setters.set(el, s);
  }
  return s;
}

let installed = false;
let lastTilt: HTMLElement | null = null;
let lastMagnet: HTMLElement | null = null;

function release(el: HTMLElement | null) {
  if (!el) return;
  const s = setters.get(el);
  if (!s) return;
  s.x(0);
  s.y(0);
  s.rx?.(0);
  s.ry?.(0);
}

export function installPointerFX() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const hover = canHover();

  document.addEventListener(
    'pointermove',
    (e) => {
      if (!hover || e.pointerType === 'touch') return;
      const target = e.target as Element | null;
      if (!target || !target.closest) return;

      const spot = target.closest<HTMLElement>('.spot');
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', `${e.clientX - r.left}px`);
        spot.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
      if (!fullMotion()) return;

      const t = target.closest<HTMLElement>('[data-tilt]');
      if (lastTilt && lastTilt !== t) release(lastTilt);
      lastTilt = t;
      if (t) {
        const r = t.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        const amt = parseFloat(t.dataset.tilt || '5');
        const s = tilt(t);
        s.ry?.(px * amt * 2);
        s.rx?.(-py * amt * 2);
      }

      const m = target.closest<HTMLElement>('[data-magnetic]');
      if (lastMagnet && lastMagnet !== m) release(lastMagnet);
      lastMagnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const strength = parseFloat(m.dataset.magnetic || '0.25');
        const s = magnet(m);
        s.x((e.clientX - (r.left + r.width / 2)) * strength);
        s.y((e.clientY - (r.top + r.height / 2)) * strength);
      }
    },
    { passive: true },
  );

  document.addEventListener(
    'pointerleave',
    () => {
      release(lastTilt);
      release(lastMagnet);
      lastTilt = lastMagnet = null;
    },
    true,
  );
}
