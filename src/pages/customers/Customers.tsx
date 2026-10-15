import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, UserPlus, Users, UsersRound, TriangleAlert, Banknote } from 'lucide-react';
import { Card, EmptyState, PageHeader, Pager, SearchBox, Avatar, usePaged, rowDelay } from '../../components/blocks';
import { Button, Chip, Segmented } from '../../components/controls';
import { SortTh, StatTile, Toolbar, compareValues, useSort } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useCan, useDb, useFmt, useRows, useT } from '../../lib/hooks';
import { customerRows } from '../../lib/selectors';
import { localDateOf } from '../../lib/dates';
import { normalizeQuery } from '../../lib/format';
import { CustomerForm } from './CustomerForm';

type Filter = 'all' | 'active' | 'overdue' | 'none';
type SortKey = 'name' | 'loans' | 'owed' | 'last';

export function Customers() {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const db = useDb();
  const rows = useRows();
  const canEdit = useCan('customers.edit');
  const ref = usePageFX();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const filter = (sp.get('f') as Filter) || 'all';
  const [sort, onSort] = useSort<SortKey>('last', 'desc', ['name']);

  const all = useMemo(() => customerRows(db, rows), [db, rows]);
  const sums = useMemo(
    () => ({
      total: all.length,
      withLoans: all.filter((c) => c.activeLoans > 0).length,
      overdue: all.filter((c) => c.overdue > 0).length,
      owed: all.reduce((s, c) => s + c.principalOutstanding + c.interestOutstanding, 0),
    }),
    [all],
  );

  const list = useMemo(() => {
    const needle = normalizeQuery(q);
    let out = all.filter((c) => {
      if (filter === 'active' && c.activeLoans === 0) return false;
      if (filter === 'overdue' && c.overdue === 0) return false;
      if (filter === 'none' && c.activeLoans > 0) return false;
      if (!needle) return true;
      const hay = `${c.customer.name} ${c.customer.mobile} ${c.customer.code} ${c.customer.address} ${c.customer.nid ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const va = sort.key === 'name' ? a.customer.name : sort.key === 'loans' ? a.loans : sort.key === 'owed' ? a.principalOutstanding + a.interestOutstanding : a.lastActivity;
      const vb = sort.key === 'name' ? b.customer.name : sort.key === 'loans' ? b.loans : sort.key === 'owed' ? b.principalOutstanding + b.interestOutstanding : b.lastActivity;
      return compareValues(va, vb) * dir;
    });
    return out;
  }, [all, q, filter, sort]);

  const paged = usePaged(list, 12);
  const setFilter = (v: Filter) => {
    setSp(v === 'all' ? {} : { f: v }, { replace: true });
    paged.reset();
  };

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('cust.title')}
        subtitle={t('cust.subtitle')}
        actions={canEdit ? <Button variant="primary" icon={<UserPlus size={18} />} onClick={() => setAdding(true)} magnetic>{t('cust.add')}</Button> : null}
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<Users size={17} />} label={t('cust.sum.total')} value={<Num value={sums.total} />} />
        <StatTile icon={<UsersRound size={17} />} label={t('cust.sum.withLoans')} value={<Num value={sums.withLoans} />} />
        <StatTile icon={<TriangleAlert size={17} />} tone={sums.overdue ? 'danger' : undefined} label={t('cust.sum.overdue')} value={<Num value={sums.overdue} />} />
        <StatTile icon={<Banknote size={17} />} tone="gold" label={t('cust.sum.owed')} value={<Num value={sums.owed} kind="money" />} />
      </div>

      <Card className="list-card" data-fx="rise">
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('cust.search')} className="toolbar__search" />
          <Segmented<Filter>
            label={t('common.filters')}
            value={filter}
            onChange={setFilter}
            items={[
              { id: 'all', label: t('cust.f.all') },
              { id: 'active', label: t('cust.f.active') },
              { id: 'overdue', label: t('cust.f.overdue') },
              { id: 'none', label: t('cust.f.none') },
            ]}
          />
        </Toolbar>

        {list.length === 0 ? (
          q || filter !== 'all' ? (
            <EmptyState title={t('cust.empty.search')} body={t('cust.empty.searchBody')} action={<Button onClick={() => { setQ(''); setFilter('all'); }}>{t('common.reset')}</Button>} />
          ) : (
            <EmptyState title={t('cust.empty.title')} body={t('cust.empty.body')} action={canEdit ? <Button variant="primary" onClick={() => setAdding(true)}>{t('cust.add')}</Button> : undefined} />
          )
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <SortTh id="name" label={t('cust.col.customer')} sort={sort} onSort={onSort} />
                    <th className="hide-md">{t('cust.col.mobile')}</th>
                    <SortTh id="loans" label={t('cust.col.loans')} sort={sort} onSort={onSort} />
                    <SortTh id="owed" label={t('cust.col.owed')} sort={sort} onSort={onSort} align="right" />
                    <SortTh id="last" label={t('cust.col.last')} sort={sort} onSort={onSort} className="hide-md" />
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody key={`${filter}|${q}|${sort.key}|${sort.dir}|${paged.page}`}>
                  {paged.slice.map((c, i) => (
                    <tr key={c.customer.id} className="is-link row-in" style={rowDelay(i)} onClick={() => nav(`/customers/${c.customer.id}`)}>
                      <td>
                        <div className="cell-person">
                          <Avatar name={c.customer.name} />
                          <div className="cell-main">
                            <b className="truncate">{c.customer.name}</b>
                            <span className="mono">{c.customer.code}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-md mono" data-label={t('cust.col.mobile')}>{f.digits(c.customer.mobile)}</td>
                      <td data-label={t('cust.col.loans')}>
                        <div className="row row--wrap" style={{ gap: 8 }}>
                          <span>{c.loans ? t('cust.activeOf', { a: c.activeLoans, n: c.loans }) : '—'}</span>
                          {c.overdue ? <Chip tone="danger" plain pulse>{t('cust.overdueN', { n: c.overdue })}</Chip> : null}
                        </div>
                      </td>
                      <td className="r num" data-label={t('cust.col.owed')}>
                        {c.principalOutstanding + c.interestOutstanding > 0 ? <b>{f.money(c.principalOutstanding + c.interestOutstanding)}</b> : <span className="muted">—</span>}
                      </td>
                      <td className="hide-md muted" data-label={t('cust.col.last')}>{f.date(localDateOf(c.lastActivity))}</td>
                      <td className="c hide-sm"><ChevronRight size={17} className="row-chevron" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager paged={paged} />
          </>
        )}
      </Card>

      <CustomerForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => nav(`/customers/${id}`)} />
    </div>
  );
}
