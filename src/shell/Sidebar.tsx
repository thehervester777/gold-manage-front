import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, TrendingDown, TrendingUp } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { gsap } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { useApp, selectRole } from '../lib/store';
import { useUi } from '../lib/ui';
import { useBi, useFmt, useSettings, useT } from '../lib/hooks';
import { NAV, NAV_GROUPS, NEW_LOAN } from './nav';
import { Plus } from 'lucide-react';
import { cx } from '../lib/cx';

export function Sidebar() {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const settings = useSettings();
  const loc = useLocation();
  const nav = useNavigate();
  const role = useApp(selectRole);
  const collapsed = useApp((s) => s.prefs.sidebarCollapsed);
  const setPrefs = useApp((s) => s.setPrefs);
  const menuOpen = useUi((s) => s.menuOpen);
  const setMenu = useUi((s) => s.setMenu);
  const ind = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLElement>(null);
  const first = useRef(true);

  const allowed = (perm?: string) => !perm || !!role?.permissions.includes(perm as never);
  const canNew = allowed(NEW_LOAN.perm);

  // slide the gold marker to the active item
  useLayoutEffect(() => {
    const root = list.current;
    const el = ind.current;
    if (!root || !el) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!active) {
        gsap.to(el, { opacity: 0, duration: 0.2 });
        return;
      }
      const a = active.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      const y = a.top - r.top + root.scrollTop;
      const h = a.height;
      if (first.current || !fullMotion()) {
        gsap.set(el, { y, height: h, opacity: 1 });
        first.current = false;
      } else {
        gsap.to(el, { y, height: h, opacity: 1, duration: 0.7, ease: 'igh' });
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => ro.disconnect();
  }, [loc.pathname, collapsed, role?.id]);

  useEffect(() => setMenu(false), [loc.pathname, setMenu]);

  // entrance
  const shell = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!fullMotion() || !shell.current) return;
    const items = shell.current.querySelectorAll('.sb-item, .sb-group, .sb-new');
    const tw = gsap.from(items, { opacity: 0, x: -14, duration: 0.8, stagger: 0.035, delay: 0.15, ease: 'igh', clearProps: 'all' });
    return () => void tw.kill();
  }, []);

  const rates = settings.goldRates;
  const today = rates.at(-1);
  const prev = rates.at(-2);
  const delta = today && prev ? ((today.k22 - prev.k22) / prev.k22) * 100 : 0;

  return (
    <aside ref={shell} className={cx('sidebar', menuOpen && 'is-open')} aria-label="Main">
      <div className="sb-brand">
        <LogoMark size={40} />
        <div className="sb-brand__text">
          <b>{bi(settings.business.name)}</b>
          <span>{t('shell.brandShort')}</span>
        </div>
      </div>

      {canNew ? (
        <button className="sb-new" onClick={() => nav(NEW_LOAN.path)} data-magnetic="0.15" title={t(NEW_LOAN.key)}>
          <Plus size={18} />
          <span className="sb-label">{t(NEW_LOAN.key)}</span>
        </button>
      ) : null}

      <nav className="sb-nav" ref={list} aria-label={t('nav.overview')} data-lenis-prevent>
        <span className="sb-ind" ref={ind} aria-hidden="true" />
        {NAV_GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g.id && allowed(n.perm));
          if (!items.length) return null;
          return (
            <div key={g.id} className="sb-section">
              <div className="sb-group">{t(g.key)}</div>
              {items.map((n) => (
                <NavLink key={n.path} to={n.path} end={n.end} className="sb-item" title={t(n.key)}>
                  <n.icon size={19} strokeWidth={1.8} />
                  <span className="sb-label">{t(n.key)}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sb-foot">
        {today ? (
          <Link to="/settings#rates" className="sb-rate" title={t('dash.rate.title')}>
            <div className="sb-rate__top">
              <span>{t('dash.rate.carat', { n: 22 })}</span>
              <em className={delta >= 0 ? 'up' : 'down'}>
                {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {f.n(Math.abs(delta), 2)}%
              </em>
            </div>
            <b>{f.money(today.k22)}</b>
            <span>{t('common.perVori')}</span>
          </Link>
        ) : null}
        <button className="sb-collapse" onClick={() => setPrefs({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? t('nav.expand') : t('nav.collapse')} title={collapsed ? t('nav.expand') : t('nav.collapse')}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          <span className="sb-label">{t('nav.collapse')}</span>
        </button>
      </div>
    </aside>
  );
}
