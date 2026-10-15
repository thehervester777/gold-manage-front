import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, ReceiptText, Sparkles } from 'lucide-react';
import { Drawer } from '../components/overlays';
import { Button, Chip, Segmented, SelectField, TextAreaField, TextField, NumberField } from '../components/controls';
import { DateField } from '../components/pickers';
import { ItemArt } from '../components/ItemArt';
import { gsap } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { useApp } from '../lib/store';
import { errorText, useDb, useFmt, useT, useToday } from '../lib/hooks';
import { calcLoan, lastPaymentDate, loanItems } from '../lib/domain';
import { diffDays } from '../lib/dates';
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from '../lib/types';
import { locationText } from '../lib/domain';
import { toast } from '../lib/ui';
import { cx } from '../lib/cx';

type Mode = 'interest' | 'settle' | 'custom';
interface Done {
  paymentId: string;
  receiptIds: string[];
  released: boolean;
  amount: number;
}

export function PaymentDrawer({ loanId, open, onClose }: { loanId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const pay = useApp((s) => s.addPayment);
  const loan = db.loans.find((l) => l.id === loanId);
  const customer = loan ? db.customers.find((c) => c.id === loan.customerId) : undefined;

  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<Mode>('interest');
  const [interestIn, setInterestIn] = useState<number | null>(null);
  const [principalIn, setPrincipalIn] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setMode('interest');
    setInterestIn(null);
    setPrincipalIn(null);
    setMethod('cash');
    setReference('');
    setNote('');
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loanId]);

  const minDate = loan ? (lastPaymentDate(db, loan.id) ?? loan.disbursedOn) : today;
  const before = useMemo(() => (loan ? calcLoan(db, loan, date < minDate ? minDate : date) : null), [db, loan, date, minDate]);

  const interest = mode === 'custom' ? interestIn ?? 0 : before ? before.interestOutstanding : 0;
  const principal = mode === 'custom' ? principalIn ?? 0 : mode === 'settle' && before ? before.principalOutstanding : 0;

  const after = useMemo(() => {
    if (!loan || !before) return null;
    const sim: Payment = { id: 'sim', loanId: loan.id, customerId: loan.customerId, date, interest, principal, method, settlement: false, receiptIds: [], createdAt: '', createdBy: '' };
    return calcLoan({ payments: [...db.payments, sim] }, loan, date);
  }, [db.payments, loan, before, date, interest, principal, method]);

  if (!loan || !customer || !before) return null;

  const total = interest + principal;
  const errs = {
    date: date < minDate ? t('err.dateBeforePayment', { date: f.date(minDate) }) : date > today ? t('err.dateFuture') : undefined,
    interest: interest > before.interestOutstanding ? t('err.interestTooHigh', { max: before.interestOutstanding }) : undefined,
    principal: principal > before.principalOutstanding ? t('err.principalTooHigh', { max: before.principalOutstanding }) : undefined,
  };
  const invalid = !!(errs.date || errs.interest || errs.principal) || total <= 0;
  const clears = !!after && after.principalOutstanding === 0 && after.interestOutstanding === 0 && total > 0;
  const untilNext = diffDays(date, before.nextMonthOn);

  const submit = () => {
    if (invalid) return;
    setBusy(true);
    try {
      const res = pay({ loanId: loan.id, date, interest, principal, method, reference, note });
      setDone({ ...res, amount: total });
      toast.success(res.released ? t('pay.done.released') : t('pay.done.title'));
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const setCustomInterest = (v: number | null) => {
    if (mode !== 'custom') setPrincipalIn(principal || null);
    setMode('custom');
    setInterestIn(v);
  };
  const setCustomPrincipal = (v: number | null) => {
    if (mode !== 'custom') setInterestIn(interest || null);
    setMode('custom');
    setPrincipalIn(v);
  };

  const body = done ? (
    <PaymentDone loanNumber={loan.number} done={done} loanId={loan.id} onClose={onClose} />
  ) : (
    <div className="stack" style={{ '--gap': '20px' } as React.CSSProperties}>
      <div className="pay-strip">
        <div>
          <span>{t('pay.due.interest')}</span>
          <b className="serif-num">{f.money(before.interestOutstanding)}</b>
        </div>
        <div>
          <span>{t('pay.due.principal')}</span>
          <b className="serif-num">{f.money(before.principalOutstanding)}</b>
        </div>
        <div className="pay-strip__total">
          <span>{t('pay.due.total')}</span>
          <b className="serif-num">{f.money(before.totalOutstanding)}</b>
        </div>
      </div>

      <div className="callout callout--gold">
        <Info size={18} />
        <div>
          <b>{t('pay.rule.title')}</b>
          <div className="small">{ruleLine(t, before)}</div>
          <div className="small">{t('pay.rule.next', { date: f.date(before.nextMonthOn) })} {untilNext > 0 ? <span className="muted">({t('common.dayCount', { n: untilNext })})</span> : null}</div>
        </div>
      </div>

      <DateField label={t('pay.date')} value={date} onChange={(v) => setDate(v || today)} min={minDate} max={today} error={errs.date} />

      <div className="stack" style={{ '--gap': '8px' } as React.CSSProperties}>
        <span className="field__label"><span>{t('pay.quick')}</span></span>
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === 'custom') {
              setInterestIn(null);
              setPrincipalIn(null);
            }
          }}
          items={[
            { id: 'interest', label: t('pay.q.interest') },
            { id: 'settle', label: t('pay.q.settle') },
            { id: 'custom', label: t('common.custom') },
          ]}
        />
      </div>

      <div className="form-grid">
        <NumberField
          label={t('pay.interestAmt')}
          prefix="৳"
          big
          value={interest || null}
          onChange={setCustomInterest}
          hint={t('pay.upTo', { max: f.money(before.interestOutstanding) })}
          error={errs.interest}
          placeholder="0"
        />
        <NumberField
          label={t('pay.principalAmt')}
          prefix="৳"
          big
          value={principal || null}
          onChange={setCustomPrincipal}
          hint={t('pay.upTo', { max: f.money(before.principalOutstanding) })}
          error={errs.principal}
          placeholder="0"
        />
      </div>

      <div className="form-grid">
        <SelectField<PaymentMethod> label={t('pay.method')} value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`method.${m}`) }))} />
        {method !== 'cash' ? <TextField label={t('pay.reference')} value={reference} onChange={setReference} mono autoComplete="off" /> : <span />}
      </div>
      <TextAreaField label={t('pay.note')} optional={t('common.optional')} value={note} onChange={setNote} rows={2} />

      {after ? (
        <div className={cx('pay-after', clears && 'is-clear')}>
          <div className="pay-after__head">{t('pay.after')}</div>
          <div className="pay-after__grid">
            <div>
              <span>{t('pay.after.principal')}</span>
              <b className="num">{f.money(after.principalOutstanding)}</b>
            </div>
            <div>
              <span>{t('pay.after.interest')}</span>
              <b className="num">{f.money(after.interestOutstanding)}</b>
            </div>
            <div>
              <span>{t('pay.after.total')}</span>
              <b className="num">{f.money(after.totalOutstanding)}</b>
            </div>
          </div>
          {clears ? (
            <div className="pay-after__release">
              <Sparkles size={16} />
              <span>{t('pay.willRelease')}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title={done ? (done.released ? t('pay.done.released') : t('pay.done.title')) : t('pay.title')}
      subtitle={`${loan.number} · ${customer.name}`}
      onSubmit={
        done
          ? undefined
          : (e) => {
              e.preventDefault();
              submit();
            }
      }
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>{t('pay.done.close')}</Button>
        ) : (
          <>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={invalid}>
              {total > 0 ? t('pay.cta', { amount: f.money(total) }) : t('pay.enter')}
            </Button>
          </>
        )
      }
    >
      {body}
    </Drawer>
  );
}

function ruleLine(t: ReturnType<typeof useT>, c: ReturnType<typeof calcLoan>) {
  const m = c.months;
  const g = c.policy.graceDays;
  if (m.rule === 'minimum') return t('loan.d.rule.minimum');
  if (m.rule === 'exact') return t('loan.d.rule.exact', { m: m.fullMonths });
  if (m.rule === 'grace') return t('loan.d.rule.grace', { m: m.fullMonths, e: m.extraDays, g });
  if (m.rule === 'threshold') return t('loan.d.rule.threshold', { m: m.fullMonths, e: m.extraDays, g: g + 1 });
  return t('loan.d.rule.none');
}
export { ruleLine };

function PaymentDone({ done, loanId, loanNumber, onClose }: { done: Done; loanId: string; loanNumber: string; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const root = useRef<HTMLDivElement>(null);
  const seal = useRef<SVGSVGElement>(null);
  const receipts = done.receiptIds.map((id) => db.receipts.find((r) => r.id === id)).filter(Boolean) as typeof db.receipts;
  const items = done.released ? loanItems(db, loanId) : [];

  useEffect(() => {
    if (!fullMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      const circle = seal.current?.querySelector<SVGCircleElement>('.seal-ring');
      const tick = seal.current?.querySelector<SVGPathElement>('.seal-tick');
      if (circle && tick) {
        const lc = circle.getTotalLength();
        const lt = tick.getTotalLength();
        gsap.set(circle, { strokeDasharray: lc, strokeDashoffset: lc });
        gsap.set(tick, { strokeDasharray: lt, strokeDashoffset: lt });
        gsap.timeline()
          .to(circle, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' })
          .to(tick, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, '-=0.15')
          .fromTo(seal.current, { scale: 0.9 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1,0.5)' }, '-=0.4');
      }
      gsap.from('.pd-item', { opacity: 0, y: 18, duration: 0.7, stagger: 0.08, delay: 0.5, ease: 'igh' });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="pay-done" ref={root}>
      <svg ref={seal} className={cx('pay-done__seal', done.released && 'is-gold')} width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle className="seal-ring" cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="4" />
        <path className="seal-tick" d="m30 49 12 12 25-27" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="display pay-done__amount pd-item">{f.money(done.amount)}</h3>
      <p className="muted pd-item" style={{ textAlign: 'center' }}>{done.released ? t('pay.done.releasedBody') : t('pay.done.body', { amount: f.money(done.amount), loan: loanNumber })}</p>

      {items.length ? (
        <div className="pd-item pay-done__block">
          <h4 className="h3">{t('pay.done.items')}</h4>
          <ul className="handback">
            {items.map((i) => (
              <li key={i.id}>
                {i.photo ? <img src={i.photo} alt="" /> : <ItemArt category={i.category} size={40} />}
                <span className="cell-main">
                  <b>{i.description}</b>
                  <span className="mono">{i.ref} · {t('loan.d.tag', { tag: i.tagNo })} · {locationText(i.location)}</span>
                </span>
                <Chip tone="gold" plain>{i.carat}K</Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pd-item pay-done__block">
        <h4 className="h3">{t('pay.done.receipts')}</h4>
        <ul className="mini-list">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link to={`/receipts/${r.id}`} className="mini-row" onClick={onClose}>
                <span className={`rtag rtag--${r.type}`}><ReceiptText size={15} /></span>
                <span className="cell-main grow">
                  <b className="mono">{r.number}</b>
                  <span>{t(`rtype.${r.type}`)}</span>
                </span>
                <b className="num">{r.amount ? f.money(r.amount) : '—'}</b>
                <span className="link">{t('pay.done.view')}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
