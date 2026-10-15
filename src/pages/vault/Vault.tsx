import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Gem, LayoutGrid, Map as MapIcon, MapPin, Plus, Scale, Vault as VaultIcon, X } from 'lucide-react';
import { Avatar, Card, EmptyState, PageHeader, Pager, SearchBox, rowDelay, usePaged } from '../../components/blocks';
import { Button, ButtonLink, Chip, Segmented, SelectField } from '../../components/controls';
import { ItemArt } from '../../components/ItemArt';
import { StatTile, Toolbar } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { scrollToElement } from '../../motion/smooth';
import { useCan, useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { normalizeQuery } from '../../lib/format';
import { saveCsv } from '../../lib/files';
import { toast } from '../../lib/ui';
import { cx } from '../../lib/cx';
import { CARATS, CATEGORIES, type Category, type GoldItem, type ItemLocation } from '../../lib/types';
import { ItemDrawer } from './ItemDrawer';
import { VaultMap } from './VaultMap';
import { buildMap, cellKey, slotKey, vaultNames, vaultRows, whereText, type VaultRow } from './model';

type Status = 'custody' | 'released' | 'all';
type SortKey = 'new' | 'value' | 'weight' | 'where';
type View = 'gallery' | 'map';

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function GalleryCard({ row, onOpen, onLocate }: { row: VaultRow; onOpen: (id: string) => void; onLocate: (item: GoldItem) => void }) {
  const t = useT();
  const f = useFmt();
  const { item, loan, customer } = row;
  return (
    <article className={cx('gcard spot', item.status === 'released' && 'is-released')} data-tilt="2.5">
      <button type="button" className="gcard__media" onClick={() => onOpen(item.id)} aria-label={t('vault.card.open', { name: item.description })}>
        {item.photo ? <img src={item.photo} alt="" loading="lazy" /> : <ItemArt category={item.category} size={104} className="gcard__art" />}
        <span className="gcard__carat">{t('dash.rate.carat', { n: item.carat })}</span>
        {item.status === 'released' ? <Chip tone="ok" className="gcard__state">{t('status.released')}</Chip> : null}
        {item.tagNo ? <span className="gcard__tag mono">{item.tagNo}</span> : null}
      </button>
      <div className="gcard__body">
        <div className="gcard__title">
          <b>{item.description}</b>
          <span>{t(`cat.${item.category}`)} · <span className="mono">{item.ref}</span></span>
        </div>
        <div className="gcard__owner">
          <Avatar name={customer.name} size="sm" />
          <span className="cell-main grow">
            <b className="truncate">{customer.name}</b>
            <span className="mono">{loan.number}</span>
          </span>
        </div>
        <div className="gcard__nums">
          <div>
            <span>{t('wiz.i.net')}</span>
            <b className="num">{f.weight(item.netWeight)}</b>
            <small>{f.vori(item.netWeight)}</small>
          </div>
          <div>
            <span>{t('wiz.i.valuation')}</span>
            <b className="num">{f.money(item.valuation)}</b>
          </div>
        </div>
        <div className="gcard__foot">
          <span className="gcard__loc">
            <MapPin size={14} aria-hidden />
            <span className="truncate">{whereText(t, f, item.location)}</span>
          </span>
          {item.status === 'in_custody' ? (
            <Button size="sm" variant="ghost" icon={<MapIcon size={16} />} aria-label={t('vault.card.locate')} title={t('vault.card.locate')} onClick={() => onLocate(item)} />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function Vault() {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const ref = usePageFX();
  const canCreate = useCan('loans.create');
  const [sp, setSp] = useSearchParams();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('custody');
  const [cat, setCat] = useState<'all' | Category>('all');
  const [carat, setCarat] = useState<'all' | string>('all');
  const [sort, setSort] = useState<SortKey>('new');
  const [loc, setLoc] = useState<ItemLocation | null>(null);
  const [vault, setVault] = useState('');
  const [sel, setSel] = useState<string | null>(null);

  const view: View = sp.get('view') === 'map' ? 'map' : 'gallery';
  const openId = sp.get('item');
  const setParam = (key: string, value: string | null, replace = true) => {
    const next = new URLSearchParams(sp);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setSp(next, { replace });
  };
  const setView = (v: View) => setParam('view', v === 'map' ? 'map' : null);
  const openItem = (id: string) => setParam('item', id, false);
  const closeItem = () => setParam('item', null);

  const all = useMemo(() => vaultRows(db), [db]);
  const custody = useMemo(() => all.filter((r) => r.item.status === 'in_custody'), [all]);

  const stats = useMemo(() => {
    const net = custody.reduce((s, r) => s + r.item.netWeight, 0);
    const value = custody.reduce((s, r) => s + r.item.valuation, 0);
    const boxes = new Set(custody.map((r) => slotKey(r.item.location)));
    const loans = new Set(custody.map((r) => r.item.loanId));
    const capacity = vaultNames(custody).reduce((s, v) => {
      const m = buildMap(custody, v);
      return s + m.shelves * m.boxes;
    }, 0);
    return { count: custody.length, net, value, boxes: boxes.size, loans: loans.size, capacity, avg: custody.length ? Math.round(value / custody.length) : 0 };
  }, [custody]);

  const vaults = useMemo(() => vaultNames(custody), [custody]);
  const activeVault = vaults.includes(vault) ? vault : vaults[0] ?? '';

  const matcher = useMemo(() => {
    const words = normalizeQuery(q).split(/\s+/).filter(Boolean);
    return (r: VaultRow) => {
      if (cat !== 'all' && r.item.category !== cat) return false;
      if (carat !== 'all' && String(r.item.carat) !== carat) return false;
      if (!words.length) return true;
      const hay = `${r.item.description} ${r.item.tagNo} ${r.item.ref} ${r.customer.name} ${r.customer.mobile} ${r.customer.code} ${r.loan.number} ${t(`cat.${r.item.category}`)} ${r.item.location.vault} ${r.item.location.shelf} ${r.item.location.box}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
  }, [q, cat, carat, t]);

  const list = useMemo(() => {
    const out = all.filter((r) => {
      if (status === 'custody' && r.item.status !== 'in_custody') return false;
      if (status === 'released' && r.item.status !== 'released') return false;
      if (loc && slotKey(r.item.location) !== slotKey(loc)) return false;
      return matcher(r);
    });
    const byWhere = (a: VaultRow, b: VaultRow) =>
      natural.compare(a.item.location.vault, b.item.location.vault) || natural.compare(a.item.location.shelf, b.item.location.shelf) || natural.compare(a.item.location.box, b.item.location.box);
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'value': return b.item.valuation - a.item.valuation;
        case 'weight': return b.item.netWeight - a.item.netWeight;
        case 'where': return byWhere(a, b);
        default: return b.item.createdAt.localeCompare(a.item.createdAt) || a.item.ref.localeCompare(b.item.ref);
      }
    });
  }, [all, status, loc, matcher, sort]);

  const mapRows = useMemo(() => custody.filter(matcher), [custody, matcher]);

  const counts = useMemo(() => {
    const open = all.filter((r) => r.item.status === 'in_custody').length;
    return { custody: open, released: all.length - open, all: all.length };
  }, [all]);

  const paged = usePaged(list, 12);
  const filtered = !!q || cat !== 'all' || carat !== 'all' || status !== 'custody' || !!loc;
  const clear = () => {
    setQ('');
    setCat('all');
    setCarat('all');
    setStatus('custody');
    setLoc(null);
    paged.reset();
  };

  // a deep link to a box (from the map) clears itself once the gallery is left
  useEffect(() => {
    if (view === 'map') setLoc(null);
  }, [view]);

  const locate = (item: GoldItem) => {
    setVault(item.location.vault);
    setSel(cellKey(item.location));
    const next = new URLSearchParams(sp);
    next.set('view', 'map');
    next.delete('item');
    setSp(next, { replace: true });
    window.setTimeout(() => scrollToElement('.vmap', -96), 120);
  };
  const showInGallery = (l: ItemLocation) => {
    setLoc(l);
    setStatus('custody');
    paged.reset();
    setView('gallery');
  };

  const exportCsv = async () => {
    const head = [t('vault.d.ref'), t('wiz.i.desc'), t('wiz.i.category'), t('wiz.i.carat'), t('wiz.i.gross'), t('wiz.i.stone'), t('wiz.i.net'), t('wiz.i.valuation'), t('wiz.i.tag'), t('wiz.i.vault'), t('wiz.i.shelf'), t('wiz.i.box'), t('common.status'), t('common.customer'), t('common.mobile'), t('common.loan')];
    const body = list.map(({ item, loan, customer }) => [
      item.ref,
      item.description,
      t(`cat.${item.category}`),
      item.carat,
      item.grossWeight,
      item.stoneWeight,
      item.netWeight,
      item.valuation,
      item.tagNo,
      item.location.vault,
      item.location.shelf,
      item.location.box,
      item.status === 'in_custody' ? t('status.inCustody') : t('status.released'),
      customer.name,
      customer.mobile,
      loan.number,
    ]);
    const res = await saveCsv(`${t('vault.csv.file')}-${today}.csv`, [head, ...body]);
    if (res === 'saved') toast.success(t('common.exportCsv'));
  };

  const drawerItem = openId ? all.find((r) => r.item.id === openId) : undefined;

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('nav.vault')}
        subtitle={t('vault.subtitle')}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={() => void exportCsv()} disabled={!list.length}>{t('common.exportCsv')}</Button>
            {canCreate ? <ButtonLink to="/loans/new" variant="primary" icon={<Plus size={17} />} magnetic>{t('nav.newLoan')}</ButtonLink> : null}
          </>
        }
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<Gem size={17} />} label={t('vault.sum.items')} value={<Num value={stats.count} />} sub={t('vault.sum.itemsSub', { n: stats.loans })} />
        <StatTile icon={<Scale size={17} />} tone="gold" label={t('vault.sum.gold')} value={<Num value={stats.net} kind="weight" />} sub={f.vori(stats.net)} />
        <StatTile icon={<Gem size={17} />} tone="gold" label={t('vault.sum.value')} value={<Num value={stats.value} kind="money" />} sub={stats.count ? t('vault.sum.valueSub', { v: f.money(stats.avg) }) : undefined} />
        <StatTile icon={<VaultIcon size={17} />} label={t('vault.sum.slots')} value={<Num value={stats.boxes} />} sub={stats.capacity ? t('vault.sum.slotsSub', { n: stats.capacity }) : undefined} />
      </div>

      <Card className={cx('list-card', view === 'map' && 'list-card--bare')} data-fx="rise">
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('vault.search')} className="toolbar__search" />
          {view === 'gallery' ? (
            <Segmented<Status>
              label={t('common.status')}
              value={status}
              onChange={(v) => { setStatus(v); paged.reset(); }}
              items={[
                { id: 'custody', label: t('vault.f.custody'), count: counts.custody },
                { id: 'released', label: t('vault.f.released'), count: counts.released },
                { id: 'all', label: t('vault.f.all'), count: counts.all },
              ]}
            />
          ) : null}
          <span className="toolbar__spacer" />
          <Segmented<View>
            label={t('common.view')}
            value={view}
            onChange={setView}
            items={[
              { id: 'gallery', label: t('vault.view.gallery'), icon: <LayoutGrid size={15} /> },
              { id: 'map', label: t('vault.view.map'), icon: <MapIcon size={15} /> },
            ]}
          />
                  <div className="toolbar__selects">
            <SelectField<'all' | Category>
              aria-label={t('wiz.i.category')}
              value={cat}
              onChange={(v) => { setCat(v); paged.reset(); }}
              options={[{ value: 'all', label: t('vault.f.allCat') }, ...CATEGORIES.map((c) => ({ value: c as Category, label: t(`cat.${c}.plural`) }))]}
            />
            <SelectField<string>
              aria-label={t('wiz.i.carat')}
              value={carat}
              onChange={(v) => { setCarat(v); paged.reset(); }}
              options={[{ value: 'all', label: t('vault.f.allCarat') }, ...CARATS.map((c) => ({ value: String(c), label: t('dash.rate.carat', { n: c }) }))]}
            />
            {view === 'gallery' ? (
              <SelectField<SortKey>
                aria-label={t('vault.sort.label')}
                value={sort}
                onChange={(v) => { setSort(v); paged.reset(); }}
                options={[
                  { value: 'new', label: t('vault.sort.new') },
                  { value: 'value', label: t('vault.sort.value') },
                  { value: 'weight', label: t('vault.sort.weight') },
                  { value: 'where', label: t('vault.sort.where') },
                ]}
              />
            ) : null}
          </div>
</Toolbar>

        {view === 'gallery' && loc ? (
          <div className="vault-filterbar">
            <MapPin size={15} aria-hidden />
            <span>{t('vault.map.showing', { loc: whereText(t, f, loc) })}</span>
            <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => { setLoc(null); paged.reset(); }}>{t('vault.map.clear')}</Button>
          </div>
        ) : null}

        {view === 'gallery' ? (
          list.length === 0 ? (
            all.length === 0 ? (
              <EmptyState title={t('vault.empty.title')} body={t('vault.empty.body')} action={canCreate ? <ButtonLink to="/loans/new" variant="primary">{t('nav.newLoan')}</ButtonLink> : undefined} />
            ) : (
              <EmptyState title={t('vault.empty.search')} body={t('vault.empty.searchBody')} action={filtered ? <Button onClick={clear}>{t('common.reset')}</Button> : undefined} />
            )
          ) : (
            <>
              <ul className="gal" key={`${status}|${cat}|${carat}|${q}|${sort}|${loc ? slotKey(loc) : ''}|${paged.page}`}>
                {paged.slice.map((r, i) => (
                  <li key={r.item.id} className="row-in" style={rowDelay(i)}>
                    <GalleryCard row={r} onOpen={openItem} onLocate={locate} />
                  </li>
                ))}
              </ul>
              <Pager paged={paged} />
            </>
          )
        ) : null}
      </Card>

      {view === 'map' ? (
        <VaultMap
          rows={mapRows}
          vaults={vaults}
          vault={activeVault}
          onVault={(v) => { setVault(v); setSel(null); }}
          selected={sel}
          onSelect={setSel}
          onOpenItem={openItem}
          onShowGallery={showInGallery}
        />
      ) : null}

      <ItemDrawer itemId={drawerItem ? drawerItem.item.id : null} onClose={closeItem} onLocate={locate} />
    </div>
  );
}
