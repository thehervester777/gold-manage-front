/**
 * Inertial smooth scrolling. Lenis drives the page scroll and is advanced from
 * GSAP's ticker, so ScrollTrigger sees exactly the same scroll position as the
 * eye — pinned scenes, scrubbed timelines and parallax never drift.
 */
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { useApp } from '../lib/store';

let lenis: Lenis | null = null;
let locks = 0;

export const getLenis = () => lenis;

export function scrollToTop(immediate = true) {
  if (lenis) lenis.scrollTo(0, { immediate, force: true });
  else window.scrollTo({ top: 0, behavior: immediate ? 'auto' : 'smooth' });
}

export function scrollToElement(target: Element | string, offset = -96) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  // A reveal may still be easing this element into place; aim for where it will rest, not where it is this frame.
  const lift = Number(gsap.getProperty(el, 'y')) || 0;
  if (lenis) lenis.scrollTo(el as HTMLElement, { offset: offset - lift, duration: 1.3 });
  else (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Freeze page scrolling while a dialog is open. Calls nest safely. */
export function lockScroll(lock: boolean) {
  locks = Math.max(0, locks + (lock ? 1 : -1));
  const on = locks > 0;
  if (lenis) {
    if (on) lenis.stop();
    else lenis.start();
  } else {
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }
}

export function SmoothScroll() {
  const smooth = useApp((s) => s.prefs.smooth);

  useEffect(() => {
    if (!smooth) return;
    const instance = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.95,
      touchMultiplier: 1.35,
      anchors: false,
    });
    lenis = instance;
    instance.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    if (locks > 0) instance.stop();
    requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis = null;
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, [smooth]);

  return null;
}
