import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Download, FileText, HandCoins, Receipt as ReceiptIcon, Unlock, Wallet, X } from 'lucide-react';
import { Card, EmptyState, PageHeader, Pager, SearchBox, usePaged, rowDelay } from '../../components/blocks';
import { Button, Segmented } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { SortTh, StatTile, Toolbar, compareValues, useSort } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { RECEIPT_TYPES, type Receipt, type ReceiptType } from '../../lib/types';
import { cmpISO, monthKey } from '../../lib/dates';
import { RECEIPT_CODE } from '../../lib/domain';
import { normalizeQuery } from '../../lib/format';
import { saveCsv } from '../../lib/files';
import { toast } from '../../lib/ui';

type TypeFilter = 'all' | ReceiptType;
type SortKey = 'number' | 'date' | 'customer' | 'amount';

const sortValue = (r: Receipt, k: SortKey): string | number => {
  switch (k) {
    case 'number': return r.number;
    case 'customer': return r.snapshot.customerName;
    case 'amount': return r.amount;
    default: return r.date;
  }
};

export function Receipts() {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const db = useDb();
  const today = useToday();
  const ref = usePageFX();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const type = (sp.get('type') as TypeFilter) || 'all';
  const [sort, onSort] = useSort<SortKey>('date', 'desc', ['number', 'customer']);

  const all = db.receipts;
  const sums = useMemo(() => {
    const key = monthKey(today);
    const month = all.filter((r) => monthKey(r.date) === key);
    return {
      total: all.length,
      month: month.length,
      collected: month.filter((r) => r.type === 'interest' || r.type === 'principal').reduce((s, r) => s + r.amount, 0),
      released: month.filter((r) => r.type === 'release').length,
    };
  }, [all, today]);

  const counts = useMemo(() => {
    const c: Record<TypeFilter, number> = { all: all.length, new_loan: 0, interest: 0, principal: 0, release: 0 };
    for (const r of all) c[r.type]++;
    return c;
  }, [all]);

  const list = useMemo(() => {
    const needle = normalizeQuery(q);
    const out = all.filter((r) => {
      if (type !== 'all' && r.type !== type) return false;
      if (from && cmpISO(r.date, from) < 0) return false;
      if (to && cmpISO(r.date, to) > 0) return false;
      if (!needle) return true;
      const s = r.snapshot;
      const hay = `${r.number} ${s.customerName} ${s.customerMobile} ${s.customerCode} ${s.loanNumber}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => compareValues(sortValue(a, sort.key), sortValue(b, sort.key)) * dir || b.createdAt.localeCompare(a.createdAt));
  }, [all, q, type, from, to, sort]);

  const paged = usePaged(list, 12);
  const setType = (v: TypeFilter) => {
    const next = new URLSearchParams(sp);
    if (v === 'all') next.delete('type');
    else next.set('type', v);
    setSp(next, { replace: true });
    paged.reset();
  };
  const filtered = !!q || !!from || !!to || type !== 'all';
  const clear = () => {
    setQ('');
    setFrom('');
    setTo('');
    setType('all');
  };

  const exportCsv = async () => {
    const head = [t('rcp.col.number'), t('rcp.col.type'), t('rcp.col.date'), t('rcp.col.customer'), t('common.mobile'), t('rcp.col.loan'), t('rcp.col.amount'), t('common.method'), t('common.reference')];
    const body = list.map((r) => [r.number, t(`rtype.${r.type}`), r.date, r.snapshot.customerName, r.snapshot.customerMobile, r.snapshot.loanNumber, r.amount, r.snapshot.method ? t(`method.${r.snapshot.method}`) : '', r.snapshot.reference ?? '']);
    const res = await saveCsv(`${t('rcp.csv.file')}-${today}.csv`, [head, ...body]);
    if (res === 'saved') toast.success(t('common.exportCsv'));
  };

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('rcp.title')}
        subtitle={t('rcp.subtitle')}
        actions={<Button icon={<Download size={17} />} onClick={() => void exportCsv()} disabled={!list.length}>{t('common.exportCsv')}</Button>}
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<ReceiptIcon size={17} />} label={t('rcp.sum.total')} value={<Num value={sums.total} />} />
        <StatTile icon={<FileText size={17} />} label={t('rcp.sum.month')} value={<Num value={sums.month} />} />
        <StatTile icon={<Wallet size={17} />} tone="gold" label={t('rcp.sum.collected')} value={<Num value={sums.collected} kind="money" />} />
        <StatTile icon={<Unlock size={17} />} tone="ok" label={t('rcp.sum.released')} value={<Num value={sums.released} />} />
      </div>

      <Card className="list-card" data-fx="rise">
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('rcp.search')} className="toolbar__search" />
          <Segmented<TypeFilter>
            label={t('common.filters')}
            value={type}
            onChange={setType}
            items={[
              { id: 'all', label: t('rcp.f.all'), count: counts.all },
              ...RECEIPT_TYPES.map((k) => ({ id: k as TypeFilter, label: RECEIPT_CODE[k], count: counts[k] })),
            ]}
          />
          <div className="toolbar__dates">
            <DateField value={from} onChange={(v) => { setFrom(v); paged.reset(); }} max={to || today} placeholder={t('common.from')} />
            <DateField value={to} onChange={(v) => { setTo(v); paged.reset(); }} min={from || undefined} max={today} placeholder={t('common.to')} />
            {from || to ? <Button size="sm" variant="ghost" icon={<X size={15} />} aria-label={t('common.clear')} onClick={() => { setFrom(''); setTo(''); paged.reset(); }} /> : null}
          </div>
        </Toolbar>

        {list.length === 0 ? (
          all.length === 0 ? (
            <EmptyState title={t('rcp.empty.title')} body={t('rcp.empty.body')} />
          ) : (
            <EmptyState title={t('rcp.empty.search')} body={t('rcp.empty.searchBody')} action={filtered ? <Button onClick={clear}>{t('common.reset')}</Button> : undefined} />
          )
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <SortTh id="number" label={t('rcp.col.number')} sort={sort} onSort={onSort} />
                    <th className="hide-md">{t('rcp.col.type')}</th>
                    <SortTh id="date" label={t('rcp.col.date')} sort={sort} onSort={onSort} className="hide-md" />
                    <SortTh id="customer" label={t('rcp.col.customer')} sort={sort} onSort={onSort} />
                    <th className="hide-md">{t('rcp.col.loan')}</th>
                    <SortTh id="amount" label={t('rcp.col.amount')} sort={sort} onSort={onSort} align="right" />
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody key={`${type}|${q}|${from}|${to}|${sort.key}|${sort.dir}|${paged.page}`}>
                  {paged.slice.map((r, i) => (
                    <tr key={r.id} className="is-link row-in" style={rowDelay(i)} onClick={() => nav(`/receipts/${r.id}`)}>
                      <td>
                        <div className="cell-person">
                          <span className={`rtag rtag--${r.type}`}>{RECEIPT_CODE[r.type]}</span>
                          <div className="cell-main">
                            <b className="mono">{r.number}</b>
                            <span className="only-md">{f.date(r.date)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-md" data-label={t('rcp.col.type')}>{t(`rtype.${r.type}`)}</td>
                      <td className="hide-md" data-label={t('rcp.col.date')}>{f.date(r.date)}</td>
                      <td data-label={t('rcp.col.customer')}><span className="truncate">{r.snapshot.customerName}</span></td>
                      <td className="hide-md" data-label={t('rcp.col.loan')}>
                        <Link className="link mono" to={`/loans/${r.loanId}`} onClick={(e) => e.stopPropagation()}>{r.snapshot.loanNumber}</Link>
                      </td>
                      <td className="r num" data-label={t('rcp.col.amount')}>
                        {r.type === 'release' && r.amount === 0 ? <span className="muted">{t('rcp.zero')}</span> : <b>{f.money(r.amount)}</b>}
                      </td>
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

void HandCoins;
