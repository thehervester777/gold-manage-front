import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Coins, Database, Languages, Palette, Store, UserRound, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../../components/blocks';
import { usePageFX } from '../../motion/fx';
import { ScrollTrigger } from '../../motion/gsap';
import { scrollToElement } from '../../motion/smooth';
import { useCan, useT } from '../../lib/hooks';
import { cx } from '../../lib/cx';
import { SECTION_KEY, type SectionId } from './model';
import { LanguageSection } from './LanguageSection';
import { AccountSection } from './AccountSection';
import { BusinessSection } from './BusinessSection';
import { RatesSection } from './RatesSection';
import { AppearanceSection } from './AppearanceSection';
import { DataSection } from './DataSection';

const SECTIONS: { id: SectionId; icon: LucideIcon; manage?: boolean }[] = [
  { id: 'language', icon: Languages },
  { id: 'account', icon: UserRound },
  { id: 'business', icon: Store, manage: true },
  { id: 'rates', icon: Coins },
  { id: 'appearance', icon: Palette },
  { id: 'data', icon: Database, manage: true },
];

const isSection = (v: string | null | undefined): v is SectionId => !!v && SECTIONS.some((s) => s.id === v);

/** Language, account, business details, gold rates, appearance and data — one page, with a menu that follows the scroll. */
export function Settings() {
  const t = useT();
  const canManage = useCan('settings.manage');
  const ref = usePageFX();
  const nav = useRef<HTMLElement>(null);
  const layout = useRef<HTMLDivElement>(null);
  const lock = useRef(0);
  const loc = useLocation();
  const [params] = useSearchParams();

  const visible = useMemo(() => SECTIONS.filter((s) => !s.manage || canManage), [canManage]);
  const ids = visible.map((s) => s.id).join();
  const [active, setActive] = useState<SectionId>('language');

  const go = useCallback((id: SectionId) => {
    setActive(id);
    lock.current = performance.now() + 1100; // let the glide finish before the scroll-spy takes over again
    // each card carries its own scroll-margin, so no extra offset is needed
    scrollToElement(`#set-${id}`, 0);
  }, []);

  // Which section is under the reading line — worked out as the page scrolls.
  useEffect(() => {
    const secs = ids.split(',') as SectionId[];
    const pick = () => {
      if (performance.now() < lock.current) return;
      const line = window.innerHeight * 0.4;
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 6;
      let current: SectionId = secs[0];
      for (const id of secs) {
        const el = document.getElementById(`set-${id}`);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(atEnd ? secs[secs.length - 1] : current);
    };
    const st = ScrollTrigger.create({ trigger: layout.current, start: 'top bottom', end: 'bottom top', onUpdate: pick, onRefresh: pick });
    pick();
    return () => st.kill();
  }, [ids]);

  // Keep the active item in view when the menu is a sideways strip on small screens.
  useEffect(() => {
    const el = nav.current;
    const on = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el || !on || el.scrollWidth <= el.clientWidth + 2) return;
    el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  // A link such as /settings#rates (or ?s=rates) lands on that section once the page has settled in.
  const want = params.get('s') ?? loc.hash.replace('#', '');
  useEffect(() => {
    if (!isSection(want) || !visible.some((s) => s.id === want)) return;
    const id = window.setTimeout(() => go(want), 1000);
    return () => window.clearTimeout(id);
  }, [want, visible, go]);

  return (
    <div ref={ref} className="page set-page">
      <PageHeader title={t('nav.settings')} subtitle={t('set.subtitle')} />

      <div className="set-layout" ref={layout} data-scroll-section>
        <nav className="set-nav" ref={nav} aria-label={t('set.navLabel')} data-lenis-prevent-x>
          <span className="set-nav__rail" aria-hidden="true">
            <i data-scroll-fill />
          </span>
          {visible.map((s) => (
            <button key={s.id} type="button" className={cx('set-nav__item', active === s.id && 'is-active')} aria-current={active === s.id ? 'true' : undefined} onClick={() => go(s.id)}>
              <s.icon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>{t(SECTION_KEY[s.id])}</span>
            </button>
          ))}
        </nav>

        <div className="set-main">
          <LanguageSection />
          <AccountSection />
          {canManage ? <BusinessSection /> : null}
          <RatesSection />
          <AppearanceSection />
          {canManage ? <DataSection /> : null}
        </div>
      </div>
    </div>
  );
}
