import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, FileText, Gem, HandCoins, Plus, Search, UserPlus, Users, Wallet } from 'lucide-react';
import { Modal } from '../components/overlays';
import { useApp, selectRole } from '../lib/store';
import { useUi } from '../lib/ui';
import { useDb, useFmt, useRows, useT } from '../lib/hooks';
import { normalizeQuery } from '../lib/format';
import { NAV, NEW_LOAN } from './nav';
import { cx } from '../lib/cx';
import type { Permission } from '../lib/types';

interface Result {
  id: string;
  group: 'actions' | 'pages' | 'customers' | 'loans' | 'receipts' | 'items';
  icon: ReactNode;
  title: string;
  sub?: string;
  to: string;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPalette);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUi.getState().setPalette(!useUi.getState().paletteOpen);
      } else if (e.key === '/' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        useUi.getState().setPalette(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <Modal open={open} onClose={() => setOpen(false)} bare width={640} className="modal--palette">
      <PaletteBody onDone={() => setOpen(false)} />
    </Modal>
  );
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const rows = useRows();
  const nav = useNavigate();
  const role = useApp(selectRole);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const can = (p?: Permission) => !p || !!role?.permissions.includes(p);

  const results = useMemo<Result[]>(() => {
    const query = normalizeQuery(q);
    const tokens = query.split(/\s+/).filter(Boolean);
    const match = (hay: string) => tokens.every((tk) => hay.includes(tk));
    const out: Result[] = [];

    const actions: Result[] = [];
    if (can(NEW_LOAN.perm)) actions.push({ id: 'a-loan', group: 'actions', icon: <Plus size={18} />, title: t('nav.newLoan'), to: '/loans/new' });
    if (can('customers.edit')) actions.push({ id: 'a-cus', group: 'actions', icon: <UserPlus size={18} />, title: t('cmd.addCustomer'), to: '/customers?new=1' });
    if (can('payments.collect')) actions.push({ id: 'a-pay', group: 'actions', icon: <Wallet size={18} />, title: t('cmd.collect'), to: '/payments?collect=1' });

    const pages: Result[] = NAV.filter((n) => can(n.perm)).map((n) => ({ id: `p-${n.path}`, group: 'pages', icon: <n.icon size={18} />, title: t(n.key), to: n.path }));

    if (!tokens.length) return [...actions, ...pages.slice(0, 8)];

    out.push(...actions.filter((a) => match(a.title.toLowerCase())));
    out.push(...pages.filter((p) => match(p.title.toLowerCase())).slice(0, 4));

    if (can('customers.view')) {
      const hits = db.customers
        .filter((c) => match(`${c.name} ${c.mobile} ${c.altMobile ?? ''} ${c.code} ${c.nid ?? ''}`.toLowerCase()))
        .slice(0, 5);
      for (const c of hits) out.push({ id: `c-${c.id}`, group: 'customers', icon: <Users size={18} />, title: c.name, sub: `${c.code} · ${c.mobile}`, to: `/customers/${c.id}` });
    }
    if (can('loans.view')) {
      const hits = rows.filter((r) => match(`${r.loan.number} ${r.customer.name} ${r.customer.mobile}`.toLowerCase())).slice(0, 5);
      for (const r of hits) out.push({ id: `l-${r.loan.id}`, group: 'loans', icon: <HandCoins size={18} />, title: r.loan.number, sub: `${r.customer.name} · ${f.money(r.loan.principal)} · ${t(`status.${r.state}`)}`, to: `/loans/${r.loan.id}` });
    }
    if (can('receipts.view')) {
      const cmap = new Map(db.customers.map((c) => [c.id, c]));
      const hits = db.receipts.filter((r) => match(`${r.number} ${cmap.get(r.customerId)?.name ?? ''} ${r.snapshot.loanNumber}`.toLowerCase())).slice(0, 5);
      for (const r of hits) out.push({ id: `r-${r.id}`, group: 'receipts', icon: <FileText size={18} />, title: r.number, sub: `${r.snapshot.customerName} · ${f.money(r.amount)}`, to: `/receipts/${r.id}` });
    }
    if (can('items.view')) {
      const hits = db.items.filter((i) => match(`${i.ref} ${i.tagNo} ${i.description}`.toLowerCase())).slice(0, 4);
      for (const i of hits) out.push({ id: `i-${i.id}`, group: 'items', icon: <Gem size={18} />, title: i.ref, sub: `${i.description} · ${i.tagNo}`, to: `/vault?item=${i.id}` });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, db.customers, db.receipts, db.items, rows, role?.id, f.lang]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onDone();
    nav(r.to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  const groups: Result['group'][] = ['actions', 'pages', 'customers', 'loans', 'receipts', 'items'];
  const label: Record<Result['group'], string> = {
    actions: t('cmd.actions'),
    pages: t('cmd.pages'),
    customers: t('cmd.customers'),
    loans: t('cmd.loans'),
    receipts: t('cmd.receipts'),
    items: t('cmd.items'),
  };
  let idx = -1;

  return (
    <div className="palette">
      <div className="palette__input">
        <Search size={20} aria-hidden />
        <input autoFocus data-autofocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={t('cmd.placeholder')} aria-label={t('cmd.placeholder')} spellCheck={false} />
        <span className="kbd">Esc</span>
      </div>
      <div className="palette__list" ref={list} data-lenis-prevent role="listbox">
        {results.length === 0 ? <div className="palette__empty">{t('cmd.empty')}</div> : null}
        {groups.map((g) => {
          const items = results.filter((r) => r.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="palette__group">
              <div className="palette__label">{label[g]}</div>
              {items.map((r) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={r.id} type="button" role="option" aria-selected={i === active} data-i={i} className={cx('palette__item', i === active && 'is-active')} onMouseMove={() => setActive(i)} onClick={() => go(r)}>
                    <span className="palette__icon">{r.icon}</span>
                    <span className="palette__text">
                      <b>{r.title}</b>
                      {r.sub ? <span>{r.sub}</span> : null}
                    </span>
                    {i === active ? <CornerDownLeft size={15} className="palette__enter" /> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="palette__foot">
        <span><span className="kbd">↑</span><span className="kbd">↓</span> {t('cmd.navigate')}</span>
        <span><span className="kbd">↵</span> {t('cmd.open')}</span>
        <span><span className="kbd">Esc</span> {t('cmd.esc')}</span>
      </div>
    </div>
  );
}
