import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, Bell, DatabaseBackup, LogOut, Menu, Moon, Search, Settings as SettingsIcon, Sun, TriangleAlert } from 'lucide-react';
import { useApp, selectRole } from '../lib/store';
import { useUi } from '../lib/ui';
import { useBi, useDb, useFmt, useLang, usePortfolio, useRows, useT, useToday, useUser } from '../lib/hooks';
import { Avatar } from '../components/blocks';
import { Chip } from '../components/controls';
import { cx } from '../lib/cx';
import { maturingSoon } from '../lib/selectors';
import { diffDays, localDateOf } from '../lib/dates';
import { gsap } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import type { Lang } from '../lib/types';

function useOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, ref, close]);
}

function useReveal(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && ref.current && fullMotion()) gsap.fromTo(ref.current, { opacity: 0, y: -8, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'igh' });
  }, [open]);
  return ref;
}

export function LanguageToggle({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const setLang = useApp((s) => s.setUserLanguage);
  const t = useT();
  const items: { id: Lang; label: string }[] = [
    { id: 'en', label: 'EN' },
    { id: 'bn', label: 'বাং' },
  ];
  return (
    <div className={cx('lang-toggle', compact && 'lang-toggle--compact')} role="group" aria-label={t('top.language')}>
      <span className="lang-toggle__thumb" style={{ transform: `translateX(${lang === 'en' ? 0 : 100}%)` }} />
      {items.map((i) => (
        <button key={i.id} type="button" aria-pressed={lang === i.id} onClick={() => setLang(i.id)} lang={i.id}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function ThemeToggle() {
  const t = useT();
  const theme = useApp((s) => s.prefs.theme);
  const setPrefs = useApp((s) => s.setPrefs);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <button className="icon-btn" aria-label={t('top.theme')} title={t('top.theme')} onClick={() => setPrefs({ theme: dark ? 'light' : 'dark' })}>
      <span className="icon-btn__swap" data-dark={dark}>
        <Sun size={19} />
        <Moon size={19} />
      </span>
    </button>
  );
}

function Notifications() {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const rows = useRows();
  const today = useToday();
  const db = useDb();
  const pf = usePortfolio();
  const role = useApp(selectRole);
  const open = useUi((s) => s.notifOpen);
  const setOpen = useUi((s) => s.setNotif);
  const wrap = useRef<HTMLDivElement>(null);
  useOutside(wrap, open, () => setOpen(false));
  const panel = useReveal(open);

  const items = useMemo(() => {
    const out: { id: string; tone: 'danger' | 'warn' | 'info'; icon: typeof Bell; text: string; to: string }[] = [];
    if (pf.overdueCount > 0) out.push({ id: 'o', tone: 'danger', icon: TriangleAlert, text: t('notif.overdue', { n: pf.overdueCount }), to: '/loans?state=overdue' });
    const soon = maturingSoon(rows, today, 7).length;
    if (soon > 0) out.push({ id: 'm', tone: 'warn', icon: AlarmClock, text: t('notif.maturing', { n: soon }), to: '/loans?state=soon' });
    if (role?.permissions.includes('backup.manage')) {
      const last = [...db.backups].sort((a, b) => b.at.localeCompare(a.at))[0];
      if (!last) out.push({ id: 'b', tone: 'info', icon: DatabaseBackup, text: t('notif.backupNone'), to: '/backup' });
      else if (diffDays(localDateOf(last.at), today) > 1) out.push({ id: 'b', tone: 'info', icon: DatabaseBackup, text: t('notif.backupOld'), to: '/backup' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today, db.backups, pf.overdueCount, role?.id, f.lang]);

  return (
    <div className="pop-wrap" ref={wrap}>
      <button className="icon-btn" aria-label={t('top.notifications')} title={t('top.notifications')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell size={19} />
        {items.length ? <span className="icon-btn__dot" /> : null}
      </button>
      {open ? (
        <div className="menu menu--notif" ref={panel}>
          <div className="menu__head">{t('top.notifications')}</div>
          {items.length === 0 ? <div className="menu__empty">{t('top.noNotifications')}</div> : null}
          {items.map((n) => (
            <button key={n.id} className="notif" onClick={() => { setOpen(false); nav(n.to); }}>
              <span className={`notif__icon notif__icon--${n.tone}`}><n.icon size={17} /></span>
              <span className="notif__text">{n.text}</span>
              <span className="notif__go">{t('notif.review')}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const t = useT();
  const bi = useBi();
  const user = useUser();
  const role = useApp(selectRole);
  const logout = useApp((s) => s.logout);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useOutside(wrap, open, () => setOpen(false));
  const panel = useReveal(open);
  return (
    <div className="pop-wrap" ref={wrap}>
      <button className="user-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={user.name}>
        <Avatar name={user.name} />
        <span className="user-btn__text hide-md">
          <b>{user.name}</b>
          <span>{role ? bi(role.name) : ''}</span>
        </span>
      </button>
      {open ? (
        <div className="menu menu--user" ref={panel}>
          <div className="menu__who">
            <Avatar name={user.name} size="lg" />
            <div style={{ minWidth: 0 }}>
              <b className="truncate" style={{ display: 'block' }}>{user.name}</b>
              <span className="muted small">@{user.username}</span>
              <div style={{ marginTop: 6 }}>{role ? <Chip tone="gold" plain>{bi(role.name)}</Chip> : null}</div>
            </div>
          </div>
          <Link to="/settings" className="menu__item" onClick={() => setOpen(false)}>
            <SettingsIcon size={17} />
            {t('nav.settings')}
          </Link>
          <button className="menu__item" onClick={() => { setOpen(false); logout(); }}>
            <LogOut size={17} />
            {t('top.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar() {
  const t = useT();
  const setPalette = useUi((s) => s.setPalette);
  const setMenu = useUi((s) => s.setMenu);
  const demo = useDb().meta.demo;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="topbar">
      <button className="icon-btn topbar__menu" aria-label={t('nav.openMenu')} onClick={() => setMenu(true)}>
        <Menu size={21} />
      </button>
      <button className="topbar__search" onClick={() => setPalette(true)} aria-label={t('top.searchShort')}>
        <Search size={17} aria-hidden />
        <span className="topbar__search-text hide-sm">{t('top.search')}</span>
        <span className="topbar__search-text show-sm-only">{t('top.searchShort')}</span>
        <span className="kbd-group hide-md">
          <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
          <span className="kbd">K</span>
        </span>
      </button>
      <div className="topbar__spacer" />
      {demo ? (
        <span className="topbar__demo hide-md" title={t('top.sampleDataHint')}>
          <Chip tone="gold" plain>{t('top.sampleData')}</Chip>
        </span>
      ) : null}
      <LanguageToggle />
      <ThemeToggle />
      <Notifications />
      <UserMenu />
    </header>
  );
}
