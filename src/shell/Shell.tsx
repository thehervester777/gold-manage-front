import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { gsap, ScrollTrigger } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { scrollToTop } from '../motion/smooth';
import { installPointerFX } from '../motion/pointer';
import { useApp } from '../lib/store';
import { useUi } from '../lib/ui';
import { useT } from '../lib/hooks';
import { cx } from '../lib/cx';

function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!bar.current) return;
    gsap.set(bar.current, { scaleX: 0, transformOrigin: '0% 50%' });
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => void (bar.current && gsap.set(bar.current, { scaleX: self.progress })),
    });
    return () => st.kill();
  }, []);
  return <div className="progress" aria-hidden="true"><div ref={bar} className="progress__bar" /></div>;
}

function BackToTop() {
  const t = useT();
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = btn.current;
    if (!el) return;
    gsap.set(el, { autoAlpha: 0, y: 14 });
    let shown = false;
    const st = ScrollTrigger.create({
      start: 640,
      end: 'max',
      onUpdate: (self) => {
        const want = self.scroll() > 640;
        if (want !== shown) {
          shown = want;
          gsap.to(el, { autoAlpha: want ? 1 : 0, y: want ? 0 : 14, duration: 0.45, ease: 'igh', overwrite: true });
        }
      },
    });
    return () => st.kill();
  }, []);
  return (
    <button ref={btn} className="to-top" onClick={() => scrollToTop(false)} aria-label={t('top.scrollTop')} title={t('top.scrollTop')}>
      <ArrowUp size={18} />
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const collapsed = useApp((s) => s.prefs.sidebarCollapsed);
  const menuOpen = useUi((s) => s.menuOpen);
  const setMenu = useUi((s) => s.setMenu);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    installPointerFX();
  }, []);

  // Keep scroll positions correct when content height changes (data, fonts, filters).
  useEffect(() => {
    const el = main.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout>;
    let last = el.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.offsetHeight - last) < 4) return;
      last = el.offsetHeight;
      clearTimeout(timer);
      timer = setTimeout(() => ScrollTrigger.refresh(), 220);
    });
    ro.observe(el);
    document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => undefined);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // calm mode → CSS flag so decorative ambient animation can switch off
  const motion = useApp((s) => s.prefs.motion);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);
  void fullMotion;

  return (
    <div className={cx('shell', collapsed && 'is-collapsed')}>
      <a href="#main" className="skip-link">{t('top.skipToContent')}</a>
      <ScrollProgress />
      <Sidebar />
      {menuOpen ? <div className="shell__scrim" onClick={() => setMenu(false)} /> : null}
      <div className="shell__main">
        <Topbar />
        <main id="main" ref={main} className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BackToTop />
      <CommandPalette />
    </div>
  );
}
