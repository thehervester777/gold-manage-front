import { useEffect, useMemo, useRef } from 'react';
import { ChevronRight, LayoutGrid, MapPin, Vault } from 'lucide-react';
import { Card, CardHead, EmptyState } from '../../components/blocks';
import { Button, Chip, Segmented } from '../../components/controls';
import { ItemArt } from '../../components/ItemArt';
import { gsap, ScrollTrigger, useGSAP } from '../../motion/gsap';
import { fullMotion } from '../../motion/fx';
import { scrollToElement } from '../../motion/smooth';
import { useFmt, useT } from '../../lib/hooks';
import { cx } from '../../lib/cx';
import type { ItemLocation } from '../../lib/types';
import { buildMap, cellKey, type VaultRow } from './model';

interface Props {
  /** Items in custody that match the filters on the page. */
  rows: VaultRow[];
  vaults: string[];
  vault: string;
  onVault: (v: string) => void;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onOpenItem: (id: string) => void;
  onShowGallery: (loc: ItemLocation) => void;
}

const level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);

export function VaultMap({ rows, vaults, vault, onVault, selected, onSelect, onOpenItem, onShowGallery }: Props) {
  const t = useT();
  const f = useFmt();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const model = useMemo(() => buildMap(rows, vault), [rows, vault]);

  // the squares are laid onto the shelves one after another
  useGSAP(
    () => {
      if (!fullMotion()) return;
      const cells = gsap.utils.toArray<HTMLElement>('.vmap__cell', root.current);
      if (!cells.length) return;
      gsap.set(cells, { opacity: 0, scale: 0.5 });
      gsap.to(cells, {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: 'igh',
        stagger: { each: 0.0045, from: 'start' },
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: root.current, start: 'top 88%', once: true },
      });
      return () => ScrollTrigger.getAll().forEach((s) => s.trigger === root.current && s.kill());
    },
    { scope: root, dependencies: [vault, model.shelves, model.boxes], revertOnUpdate: true },
  );

  const shown = useMemo(() => {
    if (!selected) return null;
    if (selected.startsWith('else:')) {
      const e = model.elsewhere.find((x) => `else:${x.key}` === selected);
      return e ? { title: e.label, sub: vault, loc: e.loc, rows: e.rows } : null;
    }
    const [s, b] = selected.split(':').map(Number);
    const c = model.cells[s - 1]?.[b - 1];
    if (!c) return null;
    return { title: t('vault.map.where', { s: f.digits(s), b: f.digits(b) }), sub: vault, loc: { vault, shelf: String(s), box: String(b) } as ItemLocation, rows: c.rows };
  }, [selected, model, vault, t, f]);

  const pick = (key: string) => {
    onSelect(selected === key ? null : key);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches && selected !== key) {
      window.setTimeout(() => panel.current && scrollToElement(panel.current, -92), 60);
    }
  };

  // keep the selected square in view when it was chosen from elsewhere
  useEffect(() => {
    if (!selected || selected.startsWith('else:')) return;
    const el = root.current?.querySelector<HTMLElement>(`[data-cell="${selected}"]`);
    if (el && fullMotion()) gsap.fromTo(el, { scale: 1.5 }, { scale: 1, duration: 0.7, ease: 'back.out(2.4)', clearProps: 'transform' });
  }, [selected, vault]);

  if (rows.length === 0) {
    return (
      <Card data-fx="rise">
        <EmptyState title={t('vault.empty.search')} body={t('vault.map.none')} />
      </Card>
    );
  }

  return (
    <div className="vmap" ref={root}>
      <Card className="vmap__card" data-fx="rise">
        <CardHead
          title={t('vault.map.title')}
          sub={t('vault.map.sub')}
          actions={
            vaults.length > 1 ? (
              <Segmented<string> label={t('vault.map.vault')} value={vault} onChange={onVault} items={vaults.map((v) => ({ id: v, label: v }))} />
            ) : undefined
          }
        />
        <div className="vmap__body">
          {model.cells.map((shelf, si) => {
            const count = shelf.reduce((n, c) => n + c.rows.length, 0);
            return (
              <div className="vmap__shelf" key={si}>
                <div className="vmap__label">
                  <b>{t('vault.map.shelf', { n: f.digits(si + 1) })}</b>
                  <span>{t('vault.map.items', { n: count })}</span>
                </div>
                <div className="vmap__boxes" role="group" aria-label={t('vault.map.shelf', { n: f.digits(si + 1) })}>
                  {shelf.map((c) => {
                    const key = `${c.shelf}:${c.box}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-cell={key}
                        className={cx('vmap__cell', `lvl-${level(c.rows.length)}`, selected === key && 'is-on')}
                        aria-pressed={selected === key}
                        aria-label={`${t('vault.map.where', { s: f.digits(c.shelf), b: f.digits(c.box) })}: ${c.rows.length ? t('vault.map.items', { n: c.rows.length }) : t('vault.map.empty')}`}
                        title={`${t('vault.map.boxOf', { b: f.digits(c.box) })} · ${c.rows.length ? t('vault.map.items', { n: c.rows.length }) : t('vault.map.empty')}`}
                        onClick={() => pick(key)}
                      >
                        {f.digits(c.box)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="vmap__legend" aria-hidden="true">
          <span>{t('vault.map.less')}</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`vmap__sw lvl-${l}`} />
          ))}
          <span>{t('vault.map.more')}</span>
        </div>

        {model.elsewhere.length ? (
          <div className="vmap__else">
            <h3 className="idr__h">{t('vault.map.others')}</h3>
            <p>{t('vault.map.othersSub')}</p>
            <div className="vmap__chips">
              {model.elsewhere.map((e) => (
                <button key={e.key} type="button" className={cx('chip-btn', selected === `else:${e.key}` && 'is-on')} onClick={() => pick(`else:${e.key}`)}>
                  <MapPin size={14} aria-hidden />
                  {e.label}
                  <span className="seg__count">{f.digits(e.rows.length)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <aside className="vmap__side" ref={panel} aria-live="polite">
        <Card className="vmap__info" key={selected ?? 'idle'} spot>
          {shown ? (
            <div className="vmap__pane">
              <div className="vmap__pane-head">
                <span className="vmap__pane-ico"><Vault size={18} aria-hidden /></span>
                <div className="grow">
                  <h3>{shown.title}</h3>
                  <p>{shown.sub}</p>
                </div>
                <Chip tone={shown.rows.length ? 'gold' : 'neutral'} plain>{shown.rows.length ? t('vault.map.items', { n: shown.rows.length }) : t('vault.map.empty')}</Chip>
              </div>
              {shown.rows.length ? (
                <ul className="vmap__items" data-lenis-prevent>
                  {shown.rows.map((r) => (
                    <li key={r.item.id}>
                      <button type="button" className="vmap__item" onClick={() => onOpenItem(r.item.id)}>
                        <span className="vmap__thumb">{r.item.photo ? <img src={r.item.photo} alt="" /> : <ItemArt category={r.item.category} size={30} />}</span>
                        <span className="cell-main grow">
                          <b className="truncate">{r.item.description}</b>
                          <span className="truncate">{t('dash.rate.carat', { n: r.item.carat })} · {f.weight(r.item.netWeight)} · {r.customer.name}</span>
                        </span>
                        <ChevronRight size={16} aria-hidden className="row-chevron" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vmap__none">{t('vault.map.empty')}</p>
              )}
              {shown.rows.length ? (
                <Button type="button" variant="soft" icon={<LayoutGrid size={16} />} onClick={() => onShowGallery(shown.loc)} block>{t('vault.map.gallery')}</Button>
              ) : null}
            </div>
          ) : (
            <div className="vmap__idle">
              <span className="vmap__pane-ico"><Vault size={20} aria-hidden /></span>
              <p>{t('vault.map.hint')}</p>
            </div>
          )}
        </Card>
      </aside>
    </div>
  );
}

export { cellKey };
