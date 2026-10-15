import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../components/overlays';
import { Avatar, StateChip } from '../components/blocks';
import { useFmt, useRows, useT, useToday } from '../lib/hooks';
import { isDueSoon } from '../lib/selectors';
import { normalizeQuery } from '../lib/format';

/** Choose which active loan a payment is for. */
export function LoanPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (loanId: string) => void }) {
  const t = useT();
  const f = useFmt();
  const rows = useRows();
  const today = useToday();
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = normalizeQuery(q).split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => r.loan.status === 'active')
      .filter((r) => {
        if (!needle.length) return true;
        const hay = `${r.loan.number} ${r.customer.name} ${r.customer.mobile} ${r.customer.code}`.toLowerCase();
        return needle.every((w) => hay.includes(w));
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue || a.loan.maturityDate.localeCompare(b.loan.maturityDate))
      .slice(0, 40);
  }, [rows, q]);

  return (
    <Modal open={open} onClose={() => { onClose(); setQ(''); }} title={t('pay.picker.title')} subtitle={t('pay.picker.sub')} width={620}>
      <div className="picker">
        <label className="searchbox">
          <Search size={17} aria-hidden />
          <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pay.picker.ph')} aria-label={t('common.search')} autoComplete="off" />
        </label>
        <div className="picker__list" data-lenis-prevent>
          {list.length === 0 ? <div className="combo__empty">{t('pay.picker.none')}</div> : null}
          {list.map((r) => (
            <button key={r.loan.id} type="button" className="picker__row" onClick={() => { onPick(r.loan.id); setQ(''); }}>
              <Avatar name={r.customer.name} size="sm" />
              <span className="cell-main grow">
                <b className="truncate">{r.customer.name}</b>
                <span><span className="mono">{r.loan.number}</span> · {f.date(r.loan.maturityDate)}</span>
              </span>
              <StateChip state={r.state} dueSoon={isDueSoon(r, today)} />
              <b className="num picker__due">{f.money(r.calc.totalOutstanding)}</b>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
