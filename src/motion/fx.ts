/**
 * Declarative scroll effects. Markup opts in with data attributes and a screen
 * calls `usePageFX()` once; everything is created inside a gsap.context, so it is
 * undone cleanly when the screen unmounts.
 *
 *   data-fx="rise|fade|scale|left|right|line|clip|split"   single element reveal
 *   data-fx-group                                           children reveal as they enter
 *   data-fx-delay="0.2"  data-fx-y="40"                    tuning
 *   data-parallax="0.3"                                    drifts against the scroll
 *   data-draw                                              SVG stroke draws on enter
 */
import { useRef } from 'react';
import { gsap, ScrollTrigger, SplitText, useGSAP } from './gsap';
import { useApp } from '../lib/store';

let gateUntil = 0;
/** Hold scroll reveals back for a moment (while a page curtain is still lifting). */
export const gateFX = (ms: number) => {
  gateUntil = performance.now() + ms;
};
const gateSeconds = () => Math.max(0, (gateUntil - performance.now()) / 1000);
export const fullMotion = () => useApp.getState().prefs.motion === 'full';

type From = gsap.TweenVars;
const FROM: Record<string, From> = {
  rise: { opacity: 0, y: 28 },
  fade: { opacity: 0 },
  scale: { opacity: 0, scale: 0.94, y: 18 },
  left: { opacity: 0, x: -40 },
  right: { opacity: 0, x: 40 },
  line: { scaleX: 0, transformOrigin: '0% 50%' },
  clip: { clipPath: 'inset(0 0 100% 0)', opacity: 0.4 },
};
const TO: Record<string, From> = {
  rise: { opacity: 1, y: 0 },
  fade: { opacity: 1 },
  scale: { opacity: 1, scale: 1, y: 0 },
  left: { opacity: 1, x: 0 },
  right: { opacity: 1, x: 0 },
  line: { scaleX: 1 },
  clip: { clipPath: 'inset(0 0 0% 0)', opacity: 1 },
};

const num = (v: string | undefined, d: number) => {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export function setupFX(root: HTMLElement) {
  if (!fullMotion()) return;
  const wait = gateSeconds();
  const lang = document.documentElement.lang === 'bn' ? 'bn' : 'en';
  const all = <T extends Element = HTMLElement>(sel: string) => gsap.utils.toArray<T>(sel, root);
  const later = (fn: () => void) => (wait > 0 ? gsap.delayedCall(wait, fn) : fn());

  // ---- single reveals -------------------------------------------------------
  all('[data-fx]').forEach((el) => {
    if (el.closest('[data-fx-group]') && !el.hasAttribute('data-fx-group')) return;
    const kind = el.dataset.fx ?? 'rise';
    if (kind === 'split') return;
    const from: From = { ...(FROM[kind] ?? FROM.rise) };
    if (el.dataset.fxY && 'y' in from) from.y = num(el.dataset.fxY, 28);
    gsap.set(el, from);
    later(() =>
      gsap.to(el, {
        ...(TO[kind] ?? TO.rise),
        duration: kind === 'line' ? 1.3 : 0.95,
        delay: num(el.dataset.fxDelay, 0),
        ease: 'igh',
        ...(kind === 'line' || kind === 'clip' ? {} : { clearProps: 'transform,opacity' }),
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      }),
    );
  });

  // ---- groups ---------------------------------------------------------------
  all('[data-fx-group]').forEach((group) => {
    const kind = group.dataset.fxGroup || 'rise';
    const items = group.querySelectorAll<HTMLElement>('[data-fx-item]');
    const targets = items.length ? Array.from(items) : (Array.from(group.children) as HTMLElement[]);
    if (!targets.length) return;
    const from: From = { ...(FROM[kind] ?? FROM.rise) };
    if (group.dataset.fxY && 'y' in from) from.y = num(group.dataset.fxY, 28);
    const stagger = num(group.dataset.stagger, 0.07);
    gsap.set(targets, from);
    later(() =>
      ScrollTrigger.batch(targets, {
        start: 'top 92%',
        once: true,
        batchMax: 12,
        interval: 0.08,
        onEnter: (batch) =>
          gsap.to(batch, { ...(TO[kind] ?? TO.rise), duration: 0.9, stagger, ease: 'igh', overwrite: true, clearProps: 'transform,opacity' }),
      }),
    );
  });

  // ---- split headlines --------------------------------------------------------
  all('[data-fx="split"]').forEach((el) => {
    const delay = num(el.dataset.fxDelay, 0) + wait;
    const words = lang === 'bn';
    SplitText.create(el, {
      type: words ? 'words' : 'lines,words',
      mask: words ? 'words' : 'lines',
      linesClass: 'split-line',
      wordsClass: 'split-word',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(words ? self.words : self.lines, {
          yPercent: 112,
          duration: 1.05,
          ease: 'igh',
          stagger: words ? 0.05 : 0.11,
          delay,
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        }),
    });
  });

  // ---- parallax ----------------------------------------------------------------
  all('[data-parallax]').forEach((el) => {
    const speed = num(el.dataset.parallax, 0.2);
    gsap.fromTo(
      el,
      { y: -speed * 90 },
      {
        y: speed * 90,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
      },
    );
  });

  // ---- svg strokes ---------------------------------------------------------------
  all<SVGGeometryElement>('[data-draw]').forEach((el) => {
    const svg = (el as unknown as SVGElement).ownerSVGElement ?? el;
    gsap.set(el, { drawSVG: '0%' });
    later(() =>
      gsap.to(el, {
        drawSVG: '100%',
        duration: num((el as unknown as HTMLElement).dataset.drawDuration, 1.6),
        delay: num((el as unknown as HTMLElement).dataset.fxDelay, 0),
        ease: 'power2.inOut',
        scrollTrigger: { trigger: svg, start: 'top 92%', once: true },
      }),
    );
  });

  // ---- scroll progress bars ----------------------------------------------------------
  all('[data-scroll-fill]').forEach((el) => {
    const target = el.closest<HTMLElement>('[data-scroll-section]') ?? el.parentElement ?? el;
    gsap.fromTo(el, { scaleY: 0, transformOrigin: '50% 0%' }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: target, start: 'top 70%', end: 'bottom 60%', scrub: true } });
  });
}

/** Attach to a screen's root element: `<div ref={usePageFX()}>`. */
export function usePageFX<T extends HTMLElement = HTMLDivElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      if (ref.current) setupFX(ref.current);
    },
    { scope: ref, dependencies: deps, revertOnUpdate: true },
  );
  return ref;
}
