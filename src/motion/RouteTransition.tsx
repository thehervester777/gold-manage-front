/**
 * Page transitions. Moving between sections wipes a gold-edged curtain across the
 * content area while the old page lifts away; moving inside a section (list to
 * detail) is a quicker fade. The new page mounts under the curtain, so its scroll
 * reveals are already primed when the curtain lifts.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, type Location } from 'react-router-dom';
import { gsap, ScrollTrigger } from './gsap';
import { fullMotion, gateFX } from './fx';
import { scrollToTop } from './smooth';
import { useApp } from '../lib/store';
import { useT } from '../lib/hooks';
import { sectionOf, titleKeyFor } from '../shell/nav';
import type { TKey } from '../lib/i18n';

/** Browser back/forward and typed addresses can reuse a history key, so the path is part of the identity. */
const sig = (l: Location) => `${l.pathname}${l.search}|${l.key}`;

export function RouteTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation();
  const t = useT();
  const [shown, setShown] = useState<Location>(location);
  const latest = useRef(location);
  latest.current = location;
  const busy = useRef(false);
  const mode = useRef<'curtain' | 'soft' | 'none'>('none');
  const first = useRef(true);
  const frame = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const [labelKey, setLabelKey] = useState<TKey | null>(null);

  // The curtain waits off to the left, hidden, until a move between sections needs it.
  useLayoutEffect(() => {
    gsap.set(curtain.current, { xPercent: -101, autoAlpha: 0 });
  }, []);

  // 1 — leave the current page
  useEffect(() => {
    if (sig(location) === sig(shown) || busy.current) return;
    // Same page, only the filters or the anchor changed: swap in place without a transition.
    if (location.pathname === shown.pathname) {
      mode.current = 'none';
      setShown(latest.current);
      return;
    }
    const animate = useApp.getState().prefs.transitions && fullMotion();
    if (!animate || !frame.current) {
      mode.current = 'none';
      scrollToTop(true);
      setShown(latest.current);
      return;
    }
    busy.current = true;
    const soft = sectionOf(location.pathname) === sectionOf(shown.pathname);
    mode.current = soft ? 'soft' : 'curtain';
    setLabelKey(titleKeyFor(location.pathname));
    const tl = gsap.timeline({
      onComplete: () => {
        busy.current = false;
        scrollToTop(true);
        gateFX(soft ? 120 : 480);
        setShown(latest.current);
      },
    });
    if (soft) {
      tl.to(frame.current, { opacity: 0, y: -10, duration: 0.22, ease: 'power2.in' });
    } else {
      tl.set(curtain.current, { xPercent: -101, autoAlpha: 1 }, 0)
        .to(frame.current, { opacity: 0, y: -18, duration: 0.34, ease: 'power2.in' }, 0)
        .to(curtain.current, { xPercent: 0, duration: 0.52, ease: 'expo.inOut' }, 0)
        .fromTo(label.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.4, ease: 'igh' }, 0.26);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search]);

  // 2 — reveal the new page (its DOM and scroll effects are already in place)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const f = frame.current;
    if (!f) return;
    const done = () => requestAnimationFrame(() => ScrollTrigger.refresh());
    if (mode.current === 'curtain') {
      gsap
        .timeline({ onComplete: () => { gsap.set(curtain.current, { xPercent: -101, autoAlpha: 0 }); done(); } })
        .to(label.current, { opacity: 0, y: -14, duration: 0.25, ease: 'power2.in' }, 0)
        .to(curtain.current, { xPercent: 101, duration: 0.7, ease: 'expo.inOut' }, 0.1)
        .fromTo(f, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.8, ease: 'igh', clearProps: 'transform,opacity' }, 0.32);
    } else if (mode.current === 'soft') {
      gsap.fromTo(f, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: 'igh', clearProps: 'transform,opacity', onComplete: done });
    } else {
      gsap.set(f, { clearProps: 'transform,opacity' });
      done();
    }
  }, [shown.key, shown.pathname]);

  return (
    <>
      <div ref={frame} className="route-frame">
        {children(shown)}
      </div>
      <div ref={curtain} className="curtain" aria-hidden="true">
        <div className="curtain__edge" />
        <div ref={label} className="curtain__label">
          <span className="display">{labelKey ? t(labelKey) : ''}</span>
        </div>
      </div>
    </>
  );
}
