import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Landmark, Layers, Wallet, Coins } from 'lucide-react';
import { Card, CardHead, EmptyState, PageHeader, Pager, SearchBox, usePaged, rowDelay } from '../../components/blocks';
import { Button, Chip, Segmented } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { StackBars, type StackPoint } from '../../components/charts';
import { SortTh, StatTile, Toolbar, compareValues, useSort } from '../../components/lists';
import { LoanPicker } from '../../features/LoanPicker';
import { PaymentDrawer } from '../../features/PaymentDrawer';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useCan, useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from '../../lib/types';
import { addDays, cmpISO, monthKey } from '../../lib/dates';
import { RECEIPT_CODE } from '../../lib/domain';
import { normalizeQuery } from '../../lib/format';
import { saveCsv } from '../../lib/files';
import { toast } from '../../lib/ui';

type MethodFilter = 'all' | PaymentMethod;
type SortKey = 'date' | 'customer' | 'interest' | 'principal';

export function Payments() {
  const t = useT();
  const f = useFmt();
  const nav = useNavigate();
  const db = useDb();
  const today = useToday();
  const ref = usePageFX();
  const canCollect = useCan('payments.collect');
  const canReceipts = useCan('receipts.view');
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [sort, onSort] = useSort<SortKey>('date', 'desc', ['customer']);
  const [picker, setPicker] = useState(false);
  const [loanId, setLoanId] = useState<string | null>(null);

  // `?collect=1` (dashboard and command-palette shortcuts) opens the picker straight away
  useEffect(() => {
    if (sp.get('collect') === '1' && canCollect) {
      setPicker(true);
      const next = new URLSearchParams(sp);
      next.delete('collect');
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const loans = useMemo(() => new Map(db.loans.map((l) => [l.id, l])), [db.loans]);
  const customers = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const receipts = useMemo(() => new Map(db.receipts.map((r) => [r.id, r])), [db.receipts]);
  const users = useMemo(() => new Map(db.users.map((u) => [u.id, u.name])), [db.users]);

  const sums = useMemo(() => {
    const key = monthKey(today);
    const m = db.payments.filter((p) => monthKey(p.date) === key);
    return { interest: m.reduce((s, p) => s + p.interest, 0), principal: m.reduce((s, p) => s + p.principal, 0), count: m.length };
  }, [db.payments, today]);

  const series = useMemo<StackPoint[]>(() => {
    const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
    const map = new Map(days.map((d) => [d, { a: 0, b: 0 }]));
    for (const p of db.payments) {
      const e = map.get(p.date);
      if (e) {
        e.a += p.interest;
        e.b += p.principal;
      }
    }
    return days.map((d) => ({ label: f.date(d), tick: f.dateShort(d), a: map.get(d)!.a, b: map.get(d)!.b }));
  }, [db.payments, today, f]);

  const list = useMemo(() => {
    const needle = normalizeQuery(q);
    const out = db.payments.filter((p) => {
      if (method !== 'all' && p.method !== method) return false;
      if (from && cmpISO(p.date, from) < 0) return false;
      if (to && cmpISO(p.date, to) > 0) return false;
      if (!needle) return true;
      const c = customers.get(p.customerId);
      const hay = `${c?.name ?? ''} ${c?.mobile ?? ''} ${loans.get(p.loanId)?.number ?? ''} ${p.reference ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const val = (p: Payment): string | number => (sort.key === 'customer' ? customers.get(p.customerId)?.name ?? '' : sort.key === 'interest' ? p.interest : sort.key === 'principal' ? p.principal : p.date);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => compareValues(val(a), val(b)) * dir || b.createdAt.localeCompare(a.createdAt));
  }, [db.payments, q, method, from, to, sort, customers, loans]);

  const totals = useMemo(() => ({ interest: list.reduce((s, p) => s + p.interest, 0), principal: list.reduce((s, p) => s + p.principal, 0) }), [list]);
  const paged = usePaged(list, 12);
  const counts = useMemo(() => {
    const c: Record<MethodFilter, number> = { all: db.payments.length, cash: 0, bkash: 0, nagad: 0, bank: 0, cheque: 0 };
    for (const p of db.payments) c[p.method]++;
    return c;
  }, [db.payments]);

  const exportCsv = async () => {
    const head = [t('pays.col.date'), t('pays.col.customer'), t('common.mobile'), t('pays.col.loan'), t('pays.col.interest'), t('pays.col.principal'), t('pays.col.method'), t('common.reference'), t('pays.col.receipts')];
    const body = list.map((p) => {
      const c = customers.get(p.customerId);
      return [p.date, c?.name ?? '', c?.mobile ?? '', loans.get(p.loanId)?.number ?? '', p.interest, p.principal, t(`method.${p.method}`), p.reference ?? '', p.receiptIds.map((id) => receipts.get(id)?.number).filter(Boolean).join(' ')];
    });
    const res = await saveCsv(`${t('pays.csv.file')}-${today}.csv`, [head, ...body]);
    if (res === 'saved') toast.success(t('common.exportCsv'));
  };

  const filtered = !!q || !!from || !!to || method !== 'all';

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('pays.title')}
        subtitle={t('pays.subtitle')}
        actions={
          <>
            <Button icon={<Download size={17} />} onClick={() => void exportCsv()} disabled={!list.length}>{t('common.exportCsv')}</Button>
            {canCollect ? <Button variant="primary" icon={<Wallet size={18} />} onClick={() => setPicker(true)} magnetic>{t('pay.collect')}</Button> : null}
          </>
        }
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<Coins size={17} />} tone="gold" label={t('pays.sum.month')} value={<Num value={sums.interest + sums.principal} kind="money" />} />
        <StatTile icon={<Landmark size={17} />} label={t('pays.sum.interest')} value={<Num value={sums.interest} kind="money" />} />
        <StatTile icon={<Layers size={17} />} label={t('pays.sum.principal')} value={<Num value={sums.principal} kind="money" />} />
        <StatTile icon={<Wallet size={17} />} label={t('pays.sum.count')} value={<Num value={sums.count} />} />
      </div>

      <Card data-fx="rise">
        <CardHead title={t('pays.chart.title')} sub={t('pays.chart.sub')} actions={<div className="legend"><span><i style={{ background: 'var(--c1)' }} />{t('common.interest')}</span><span><i style={{ background: 'var(--c2)' }} />{t('common.principal')}</span></div>} />
        <div className="card__body" style={{ paddingTop: 4 }}>
          <StackBars data={series} aLabel={t('common.interest')} bLabel={t('common.principal')} />
        </div>
      </Card>

      <Card className="list-card" data-fx="rise">
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('pays.search')} className="toolbar__search" />
          <Segmented<MethodFilter>
            label={t('common.method')}
            value={method}
            onChange={(v) => { setMethod(v); paged.reset(); }}
            items={[{ id: 'all', label: t('pays.f.all'), count: counts.all }, ...PAYMENT_METHODS.map((m) => ({ id: m as MethodFilter, label: t(`method.${m}`), count: counts[m] }))]}
          />
          <div className="toolbar__dates">
            <DateField value={from} onChange={(v) => { setFrom(v); paged.reset(); }} max={to || today} placeholder={t('common.from')} />
            <DateField value={to} onChange={(v) => { setTo(v); paged.reset(); }} min={from || undefined} max={today} placeholder={t('common.to')} />
          </div>
        </Toolbar>

        {list.length === 0 ? (
          db.payments.length === 0 ? (
            <EmptyState title={t('pays.empty.title')} body={t('pays.empty.body')} action={canCollect ? <Button variant="primary" onClick={() => setPicker(true)}>{t('pay.collect')}</Button> : undefined} />
          ) : (
            <EmptyState title={t('pays.empty.search')} body={t('pays.empty.searchBody')} action={filtered ? <Button onClick={() => { setQ(''); setFrom(''); setTo(''); setMethod('all'); }}>{t('common.reset')}</Button> : undefined} />
          )
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <SortTh id="date" label={t('pays.col.date')} sort={sort} onSort={onSort} />
                    <SortTh id="customer" label={t('pays.col.customer')} sort={sort} onSort={onSort} />
                    <th className="hide-md">{t('pays.col.loan')}</th>
                    <SortTh id="interest" label={t('pays.col.interest')} sort={sort} onSort={onSort} align="right" />
                    <SortTh id="principal" label={t('pays.col.principal')} sort={sort} onSort={onSort} align="right" />
                    <th className="hide-md">{t('pays.col.method')}</th>
                    <th className="hide-sm">{t('pays.col.receipts')}</th>
                  </tr>
                </thead>
                <tbody key={`${method}|${q}|${from}|${to}|${sort.key}|${sort.dir}|${paged.page}`}>
                  {paged.slice.map((p, i) => {
                    const c = customers.get(p.customerId);
                    const loan = loans.get(p.loanId);
                    return (
                      <tr key={p.id} className="row-in is-link" style={rowDelay(i)} onClick={() => nav(`/loans/${p.loanId}`)}>
                        <td>
                          <div className="cell-main">
                            <b>{f.date(p.date)}</b>
                            <span>{users.get(p.createdBy) ?? ''}</span>
                          </div>
                        </td>
                        <td data-label={t('pays.col.customer')}><span className="truncate">{c?.name ?? '—'}</span></td>
                        <td className="hide-md" data-label={t('pays.col.loan')}><span className="mono">{loan?.number ?? '—'}</span></td>
                        <td className="r num" data-label={t('pays.col.interest')}>{p.interest ? f.money(p.interest) : <span className="muted">—</span>}</td>
                        <td className="r num" data-label={t('pays.col.principal')}>{p.principal ? f.money(p.principal) : <span className="muted">—</span>}</td>
                        <td className="hide-md" data-label={t('pays.col.method')}>
                          <span className="row" style={{ gap: 8 }}>
                            {t(`method.${p.method}`)}
                            {p.settlement ? <Chip tone="ok" plain>{t('pays.settled')}</Chip> : null}
                          </span>
                        </td>
                        <td className="hide-sm">
                          <span className="row row--wrap" style={{ gap: 6 }}>
                            {p.receiptIds.map((id) => {
                              const r = receipts.get(id);
                              if (!r) return null;
                              return canReceipts ? (
                                <Link key={id} to={`/receipts/${id}`} className={`rtag rtag--${r.type} rtag--link`} title={r.number} onClick={(e) => e.stopPropagation()}>{RECEIPT_CODE[r.type]}</Link>
                              ) : (
                                <span key={id} className={`rtag rtag--${r.type}`}>{RECEIPT_CODE[r.type]}</span>
                              );
                            })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="tbl-total">
                    <td colSpan={2} className="hide-sm">{t('pays.totals', { n: list.length })}</td>
                    <td className="hide-md" />
                    <td className="r num">{f.money(totals.interest)}</td>
                    <td className="r num">{f.money(totals.principal)}</td>
                    <td colSpan={2} className="hide-sm" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pager paged={paged} />
          </>
        )}
      </Card>

      <LoanPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); setLoanId(id); }} />
      {loanId ? <PaymentDrawer loanId={loanId} open onClose={() => setLoanId(null)} /> : null}
    </div>
  );
}
