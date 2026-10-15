import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { gsap, osReducedMotion } from '../motion/gsap';
import { gateFX } from '../motion/fx';
import { readPref } from '../lib/persist';

/**
 * The opening scene: the mark draws itself, the name rises into place, then the
 * screen parts along a gold seam to reveal the app. `onOpen` fires as the seam
 * opens, so the first screen can mount and prime its own reveals underneath.
 */
export function Splash({ ready, onOpen }: { ready: boolean; onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [introDone, setIntroDone] = useState(false);
  const [gone, setGone] = useState(false);
  const opened = useRef(false);
  const lang = readPref<{ loginLang?: string }>('prefs', {}).loginLang === 'bn' ? 'bn' : 'en';
  const name = lang === 'bn' ? 'ইথিকা গোল্ড হাউস' : 'Ithika Gold House';
  const calm = osReducedMotion() || readPref<{ motion?: string }>('prefs', {}).motion === 'calm';

  useEffect(() => {
    if (calm) {
      setIntroDone(true);
      return;
    }
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => setIntroDone(true) });
      tl.from('.splash__center svg', { scale: 0.55, opacity: 0, rotate: -8, duration: 1.1, ease: 'igh' }, 0)
        .from('.splash__center .logo-bar', { y: -14, opacity: 0, duration: 0.9, ease: 'igh' }, 0.25)
        .from('.splash__center .logo-streak', { scaleX: 0, transformOrigin: '50% 50%', duration: 0.9, ease: 'igh' }, 0.55)
        .from('.splash__name span', { yPercent: 115, duration: 1, stagger: lang === 'bn' ? 0.08 : 0.07, ease: 'igh' }, 0.35)
        .to('.splash__bar i', { scaleX: 1, duration: 1.15, ease: 'power2.inOut' }, 0.2);
    }, el);
    return () => ctx.revert();
  }, [calm, lang]);

  useEffect(() => {
    if (!ready || !introDone || opened.current) return;
    opened.current = true;
    if (calm) {
      onOpen();
      setGone(true);
      return;
    }
    gateFX(650);
    const tl = gsap.timeline({ onComplete: () => setGone(true) });
    tl.to('.splash__center', { opacity: 0, scale: 0.96, duration: 0.35, ease: 'power2.in' }, 0)
      .to('.splash__seam', { scaleX: 1, duration: 0.45, ease: 'expo.out' }, 0.05)
      .add(onOpen, 0.45)
      .to('.splash__half--top', { yPercent: -100, duration: 1, ease: 'expo.inOut' }, 0.5)
      .to('.splash__half--bottom', { yPercent: 100, duration: 1, ease: 'expo.inOut' }, 0.5)
      .to('.splash__seam', { opacity: 0, duration: 0.4 }, 0.8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, introDone]);

  if (gone) return null;
  const parts = lang === 'bn' ? name.split(' ') : name.split(' ');
  return (
    <div className="splash" ref={root} role="status" aria-label={name}>
      <div className="splash__half splash__half--top" />
      <div className="splash__half splash__half--bottom" />
      <div className="splash__seam" />
      <div className="splash__center">
        <LogoMark size={84} />
        <div className="splash__name" aria-hidden="true">
          {parts.map((p, i) => (
            <span key={i}>{p}{i < parts.length - 1 ? ' ' : ''}</span>
          ))}
        </div>
        <div className="splash__bar"><i /></div>
      </div>
    </div>
  );
}
