import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Download, HandCoins, Plus, TriangleAlert, Wallet, Coins } from 'lucide-react';
import { Avatar, Card, EmptyState, PageHeader, Pager, SearchBox, StateChip, usePaged, rowDelay } from '../../components/blocks';
import { Button, ButtonLink, Segmented } from '../../components/controls';
import { SortTh, StatTile, Toolbar, compareValues, useSort } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useCan, useFmt, useRows, useT, useToday } from '../../lib/hooks';
import { isDueSoon, type LoanRow } from '../../lib/selectors';
import { normalizeQuery } from '../../lib/format';
import { saveCsv } from '../../lib/files';
import { toast } from '../../lib/ui';

type StateFilter = 'all' | 'active' | 'soon' | 'overdue' | 'released';
type SortKey = 'loan' | 'customer' | 'date' | 'principal' | 'maturity' | 'due';

const sortValue = (r: LoanRow, k: SortKey): string | number => {
  switch (k) {
    case 'loan': return r.loan.number;
    case 'customer': return r.customer.name;
    case 'date': return r.loan.disbursedOn;
    case 'principal': return r.loan.principal;
    case 'maturity': return r.loan.maturityDate;
    default: return r.loan.status === 'active' ? r.calc.totalOutstanding : -1;
  }
};

export function Loans() {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const rows = useRows();
  const today = useToday();
  const canCreate = useCan('loans.create');
  const ref = usePageFX();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const state = (sp.get('state') as StateFilter) || 'all';
  const [sort, onSort] = useSort<SortKey>('date', 'desc', ['loan', 'customer']);

  const sums = useMemo(() => {
    const active = rows.filter((r) => r.loan.status === 'active');
    return {
      active: active.length,
      principal: active.reduce((s, r) => s + r.calc.principalOutstanding, 0),
      interest: active.reduce((s, r) => s + r.calc.interestOutstanding, 0),
      overdue: active.filter((r) => r.state === 'overdue').length,
    };
  }, [rows]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.state === 'active').length,
      soon: rows.filter((r) => isDueSoon(r, today)).length,
      overdue: rows.filter((r) => r.state === 'overdue').length,
      released: rows.filter((r) => r.state === 'released').length,
    }),
    [rows, today],
  );

  const list = useMemo(() => {
    const needle = normalizeQuery(q);
    const out = rows.filter((r) => {
      if (state === 'active' && r.state !== 'active') return false;
      if (state === 'soon' && !isDueSoon(r, today)) return false;
      if (state === 'overdue' && r.state !== 'overdue') return false;
      if (state === 'released' && r.state !== 'released') return false;
      if (!needle) return true;
      const hay = `${r.loan.number} ${r.customer.name} ${r.customer.mobile} ${r.customer.code} ${r.items.map((i) => `${i.description} ${i.ref} ${i.tagNo}`).join(' ')}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => compareValues(sortValue(a, sort.key), sortValue(b, sort.key)) * dir || b.loan.createdAt.localeCompare(a.loan.createdAt));
  }, [rows, q, state, sort, today]);

  const paged = usePaged(list, 12);
  const setState = (v: StateFilter) => {
    const next = new URLSearchParams(sp);
    if (v === 'all') next.delete('state');
    else next.set('state', v);
    setSp(next, { replace: true });
    paged.reset();
  };

  const exportCsv = async () => {
    const head = [t('loan.col.loan'), t('loan.col.customer'), t('common.mobile'), t('loan.col.date'), t('loan.col.principal'), t('common.rate'), t('common.term'), t('loan.col.maturity'), t('loan.col.status'), t('loan.sum.principal'), t('loan.sum.interest'), t('loan.col.due')];
    const body = list.map((r) => [
      r.loan.number, r.customer.name, r.customer.mobile, r.loan.disbursedOn, r.loan.principal, r.loan.rate, r.loan.termMonths, r.loan.maturityDate,
      t(`status.${r.state}`), r.loan.status === 'active' ? r.calc.principalOutstanding : 0, r.loan.status === 'active' ? r.calc.interestOutstanding : 0, r.loan.status === 'active' ? r.calc.totalOutstanding : 0,
    ]);
    const res = await saveCsv(`${t('loan.csv.file')}-${today}.csv`, [head, ...body]);
    if (res === 'saved') toast.success(t('common.exportCsv'));
  };

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('loan.title')}
        subtitle={t('loan.subtitle')}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={() => void exportCsv()} disabled={!list.length}>{t('common.exportCsv')}</Button>
            {canCreate ? <ButtonLink to="/loans/new" variant="primary" icon={<Plus size={18} />} magnetic>{t('nav.newLoan')}</ButtonLink> : null}
          </>
        }
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<HandCoins size={17} />} label={t('loan.sum.active')} value={<Num value={sums.active} />} />
        <StatTile icon={<Coins size={17} />} tone="gold" label={t('loan.sum.principal')} value={<Num value={sums.principal} kind="money" />} />
        <StatTile icon={<Wallet size={17} />} label={t('loan.sum.interest')} value={<Num value={sums.interest} kind="money" />} />
        <StatTile icon={<TriangleAlert size={17} />} tone={sums.overdue ? 'danger' : undefined} label={t('loan.sum.overdue')} value={<Num value={sums.overdue} />} />
      </div>

      <Card className="list-card" data-fx="rise">
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('loan.search')} className="toolbar__search" />
          <Segmented<StateFilter>
            label={t('common.filters')}
            value={state}
            onChange={setState}
            items={[
              { id: 'all', label: t('loan.f.all'), count: counts.all },
              { id: 'active', label: t('loan.f.active'), count: counts.active },
              { id: 'soon', label: t('loan.f.soon'), count: counts.soon },
              { id: 'overdue', label: t('loan.f.overdue'), count: counts.overdue },
              { id: 'released', label: t('loan.f.released'), count: counts.released },
            ]}
          />
        </Toolbar>

        {list.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState title={t('loan.empty.title')} body={t('loan.empty.body')} action={canCreate ? <ButtonLink to="/loans/new" variant="primary">{t('nav.newLoan')}</ButtonLink> : undefined} />
          ) : (
            <EmptyState title={t('loan.empty.search')} body={t('loan.empty.searchBody')} action={<Button onClick={() => { setQ(''); setState('all'); }}>{t('common.reset')}</Button>} />
          )
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <SortTh id="loan" label={t('loan.col.loan')} sort={sort} onSort={onSort} />
                    <SortTh id="customer" label={t('loan.col.customer')} sort={sort} onSort={onSort} />
                    <SortTh id="principal" label={t('loan.col.principal')} sort={sort} onSort={onSort} align="right" />
                    <th className="hide-md">{t('loan.col.rate')}</th>
                    <SortTh id="maturity" label={t('loan.col.maturity')} sort={sort} onSort={onSort} className="hide-md" />
                    <th>{t('loan.col.status')}</th>
                    <SortTh id="due" label={t('loan.col.due')} sort={sort} onSort={onSort} align="right" />
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody key={`${state}|${q}|${sort.key}|${sort.dir}|${paged.page}`}>
                  {paged.slice.map((r, i) => (
                    <tr key={r.loan.id} className="is-link row-in" style={rowDelay(i)} onClick={() => nav(`/loans/${r.loan.id}`)}>
                      <td>
                        <div className="cell-main">
                          <b className="mono">{r.loan.number}</b>
                          <span>{f.date(r.loan.disbursedOn)}</span>
                        </div>
                      </td>
                      <td data-label={t('loan.col.customer')}>
                        <div className="cell-person">
                          <Avatar name={r.customer.name} size="sm" />
                          <span className="truncate">{r.customer.name}</span>
                        </div>
                      </td>
                      <td className="r num" data-label={t('loan.col.principal')}>{f.money(r.loan.principal)}</td>
                      <td className="hide-md" data-label={t('loan.col.rate')}>{f.pct(r.loan.rate)}</td>
                      <td className="hide-md" data-label={t('loan.col.maturity')}>{f.date(r.loan.maturityDate)}</td>
                      <td data-label={t('loan.col.status')}><StateChip state={r.state} dueSoon={isDueSoon(r, today)} /></td>
                      <td className="r num" data-label={t('loan.col.due')}>{r.loan.status === 'active' ? <b>{f.money(r.calc.totalOutstanding)}</b> : <span className="muted">—</span>}</td>
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
    </div>
  );
}
