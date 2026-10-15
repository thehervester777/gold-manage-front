import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { Button, Chip, NumberField, Segmented, SelectField, Switch, TextAreaField } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { useApp } from '../../lib/store';
import { errorText, useDb, useFmt, useSettings, useT, useToday } from '../../lib/hooks';
import { calcLoan, lastPaymentDate } from '../../lib/domain';
import { addMonths, maxISO } from '../../lib/dates';
import { PAYMENT_METHODS, type PaymentMethod } from '../../lib/types';
import { toast } from '../../lib/ui';

// ---------------------------------------------------------------------------
// Renew
// ---------------------------------------------------------------------------
export function RenewModal({ loanId, open, onClose }: { loanId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const settings = useSettings();
  const renew = useApp((s) => s.renew);
  const loan = db.loans.find((l) => l.id === loanId);
  const [date, setDate] = useState(today);
  const [term, setTerm] = useState<number | null>(loan?.termMonths ?? settings.interest.defaultTermMonths);
  const [collect, setCollect] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && loan) {
      setDate(today);
      setTerm(loan.termMonths);
      setCollect(true);
      setMethod('cash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loanId]);

  const minDate = loan ? (lastPaymentDate(db, loan.id) ?? loan.disbursedOn) : today;
  const calc = useMemo(() => (loan ? calcLoan(db, loan, date < minDate ? minDate : date) : null), [db, loan, date, minDate]);
  if (!loan || !calc) return null;

  const valid = !!term && Number.isInteger(term) && term >= 1 && term <= 36 && date >= minDate && date <= today;
  const newMaturity = valid ? addMonths(maxISO(loan.maturityDate, date), term!) : undefined;

  const submit = () => {
    if (!valid) return;
    setBusy(true);
    try {
      renew({ loanId, date, termMonths: term!, collectInterest: collect && calc.interestOutstanding > 0, method });
      toast.success(t('renew.done'));
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('renew.title')}
      subtitle={t('renew.sub')}
      width={520}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>{t('renew.cta')}</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <div className="form-grid">
          <DateField label={t('renew.date')} value={date} onChange={(v) => setDate(v || today)} min={minDate} max={today} />
          <NumberField label={t('renew.term')} value={term} onChange={setTerm} suffix={t('common.months')} />
        </div>
        {calc.interestOutstanding > 0 ? (
          <div className="stack" style={{ '--gap': '14px' } as React.CSSProperties}>
            <label className="row" style={{ justifyContent: 'space-between', gap: 16 }}>
              <span>{t('renew.collect', { a: f.money(calc.interestOutstanding) })}</span>
              <Switch checked={collect} onChange={setCollect} label={t('renew.collect', { a: f.money(calc.interestOutstanding) })} />
            </label>
            {collect ? <SelectField<PaymentMethod> label={t('pay.method')} value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`method.${m}`) }))} /> : null}
          </div>
        ) : (
          <p className="muted small">{t('renew.noneDue')}</p>
        )}
        {newMaturity ? (
          <div className="callout callout--gold">
            <CircleCheck size={18} />
            <span><b>{t('renew.preview', { date: f.date(newMaturity) })}</b></span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Adjust interest (waiver / correction) — always with a reason
// ---------------------------------------------------------------------------
export function AdjustModal({ loanId, open, onClose }: { loanId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const adjust = useApp((s) => s.adjust);
  const loan = db.loans.find((l) => l.id === loanId);
  const [kind, setKind] = useState<'waiver' | 'correction'>('waiver');
  const [dir, setDir] = useState<'reduce' | 'increase'>('reduce');
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('waiver');
      setDir('reduce');
      setAmount(null);
      setReason('');
      setTried(false);
    }
  }, [open, loanId]);

  const calc = useMemo(() => (loan ? calcLoan(db, loan, today) : null), [db, loan, today]);
  if (!loan || !calc) return null;

  const signed = (kind === 'waiver' || dir === 'reduce' ? -1 : 1) * (amount ?? 0);
  const after = calc.interestOutstanding + signed;
  const errors = {
    amount: !amount || amount <= 0 ? t('err.amountInvalid') : after < 0 ? t('err.adjustTooLarge', { max: calc.interestOutstanding }) : undefined,
    reason: reason.trim().length < 5 ? t('err.reasonRequired') : undefined,
  };

  const submit = () => {
    setTried(true);
    if (errors.amount || errors.reason) return;
    setBusy(true);
    try {
      adjust({ loanId, date: today, kind, amount: signed, reason });
      toast.success(t('adj.done'));
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('adj.title')}
      subtitle={t('adj.sub')}
      width={520}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t('adj.cta')}</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <div className="callout callout--warn">
          <TriangleAlert size={18} />
          <span>{t('adj.current', { a: f.money(calc.interestOutstanding) })}</span>
        </div>
        <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
          <span className="field__label"><span>{t('adj.kind')}</span></span>
          <Segmented<'waiver' | 'correction'> value={kind} onChange={setKind} items={[{ id: 'waiver', label: t('adj.waiver') }, { id: 'correction', label: t('adj.correction') }]} />
        </div>
        {kind === 'correction' ? (
          <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
            <span className="field__label"><span>{t('adj.dir')}</span></span>
            <Segmented<'reduce' | 'increase'> value={dir} onChange={setDir} items={[{ id: 'reduce', label: t('adj.reduce') }, { id: 'increase', label: t('adj.increase') }]} />
          </div>
        ) : null}
        <NumberField label={t('adj.amount')} prefix="৳" big value={amount} onChange={setAmount} error={tried ? errors.amount : undefined} autoFocus />
        <TextAreaField label={t('adj.reason')} placeholder={t('adj.reasonPh')} value={reason} onChange={setReason} error={tried ? errors.reason : undefined} rows={3} />
        {amount ? (
          <p className="small">
            <Chip tone={after < 0 ? 'danger' : 'gold'} plain>{t('adj.after', { a: f.money(Math.max(0, after)) })}</Chip>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Check the interest by hand
// ---------------------------------------------------------------------------
export function CheckModal({ loanId, open, onClose }: { loanId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const check = useApp((s) => s.manualCheck);
  const loan = db.loans.find((l) => l.id === loanId);
  const [asOf, setAsOf] = useState(today);
  const [manual, setManual] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAsOf(today);
      setManual(null);
      setNote('');
    }
  }, [open, loanId, today]);

  const auto = useMemo(() => (loan ? calcLoan(db, loan, asOf).interestAccrued : 0), [db, loan, asOf]);
  if (!loan) return null;
  const diff = manual == null ? null : manual - auto;

  const submit = () => {
    if (manual == null) return;
    setBusy(true);
    try {
      check({ loanId, asOf, manualInterest: manual, note });
      toast.success(t('chk.done'));
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('chk.title')}
      subtitle={t('chk.sub')}
      width={520}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={manual == null}>{t('chk.cta')}</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <div className="form-grid">
          <DateField label={t('chk.asOf')} value={asOf} onChange={(v) => setAsOf(v || today)} min={loan.disbursedOn} max={today} />
          <NumberField label={t('chk.manual')} prefix="৳" big value={manual} onChange={setManual} autoFocus />
        </div>
        <dl className="kv kv--tight">
          <dt>{t('chk.auto')}</dt>
          <dd><b className="num">{f.money(auto)}</b></dd>
          <dt>{t('chk.var')}</dt>
          <dd><b className="num">{diff == null ? '—' : f.signedMoney(diff)}</b></dd>
        </dl>
        {diff != null ? (
          <div className={`callout ${diff === 0 ? 'callout--ok' : 'callout--warn'}`}>
            {diff === 0 ? <CircleCheck size={18} /> : <TriangleAlert size={18} />}
            <span>{diff === 0 ? t('chk.match') : t('chk.differ', { a: f.money(Math.abs(diff)) })}</span>
          </div>
        ) : null}
        <TextAreaField label={t('chk.note')} optional={t('common.optional')} value={note} onChange={setNote} rows={2} />
      </div>
    </Modal>
  );
}
