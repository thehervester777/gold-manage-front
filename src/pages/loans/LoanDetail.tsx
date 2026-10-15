import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, CalendarClock, Gavel, HandCoins, Phone, RefreshCw, Scale, SlidersHorizontal, Wallet } from 'lucide-react';
import { Avatar, Card, CardHead, EmptyState, PageHeader, StateChip } from '../../components/blocks';
import { Button, ButtonLink, Chip } from '../../components/controls';
import { ItemArt } from '../../components/ItemArt';
import { StatTile } from '../../components/lists';
import { Ring } from '../../components/charts';
import { Num } from '../../motion/Num';
import { gsap, useGSAP } from '../../motion/gsap';
import { fullMotion, usePageFX } from '../../motion/fx';
import { PaymentDrawer } from '../../features/PaymentDrawer';
import { MonthLadder } from './MonthLadder';
import { AdjustModal, CheckModal, RenewModal } from './LoanDialogs';
import { useApp } from '../../lib/store';
import { errorText, useCan, useDb, useFmt, useLang, useRows, useT, useToday } from '../../lib/hooks';
import { isDueSoon } from '../../lib/selectors';
import { calcLoan, locationText } from '../../lib/domain';
import { diffDays } from '../../lib/dates';
import { auditLine, auditTone } from '../../lib/auditText';
import { confirmDialog, toast } from '../../lib/ui';
import { cx } from '../../lib/cx';

export function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const nav = useNavigate();
  const db = useDb();
  const rows = useRows();
  const today = useToday();
  const [sp, setSp] = useSearchParams();
  const release = useApp((s) => s.releaseLoan);
  const can = {
    pay: useCan('payments.collect'),
    renew: useCan('loans.renew'),
    release: useCan('loans.release'),
    override: useCan('interest.override'),
    audit: useCan('audit.view'),
    receipts: useCan('receipts.view'),
    items: useCan('items.view'),
  };
  const ref = usePageFX([id]);
  const [panel, setPanel] = useState<null | 'pay' | 'renew' | 'adjust' | 'check'>(null);

  const row = rows.find((r) => r.loan.id === id);

  // `?collect=1` opens the payment panel straight away (used by dashboard shortcuts).
  useEffect(() => {
    if (sp.get('collect') === '1' && row?.loan.status === 'active' && can.pay) {
      setPanel('pay');
      const next = new URLSearchParams(sp);
      next.delete('collect');
      setSp(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, row?.loan.id]);

  const ledger = useMemo(() => db.receipts.filter((r) => r.loanId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number.localeCompare(a.number)), [db.receipts, id]);
  const payments = useMemo(() => db.payments.filter((p) => p.loanId === id), [db.payments, id]);
  const history = useMemo(() => (row ? db.audit.filter((e) => e.entityId === row.loan.id || e.label.includes(row.loan.number)).filter((e) => e.action !== 'login').slice(-6).reverse() : []), [db.audit, row]);

  if (!row) {
    return (
      <Card style={{ marginTop: 24 }}>
        <EmptyState title={t('loan.d.notFound')} body={t('loan.d.notFoundBody')} action={<ButtonLink to="/loans" variant="primary">{t('loan.title')}</ButtonLink>} />
      </Card>
    );
  }

  const { loan, customer, calc, items } = row;
  const isActive = loan.status === 'active';
  const overdue = row.state === 'overdue';
  const dueSoon = isDueSoon(row, today);
  const daysTotal = Math.max(1, diffDays(loan.disbursedOn, loan.maturityDate));
  const daysUsed = diffDays(loan.disbursedOn, loan.closedOn ?? today);
  const elapsed = Math.max(0, Math.min(1, daysUsed / daysTotal));
  const left = diffDays(today, loan.maturityDate);
  const canRelease = isActive && calc.principalOutstanding === 0 && calc.interestOutstanding === 0;
  const inCustody = items.filter((i) => i.status === 'in_custody');
  const weight = items.reduce((s, i) => s + i.netWeight, 0);
  const value = items.reduce((s, i) => s + i.valuation, 0);
  const planName = loan.ratePlanId ? db.settings.ratePlans.find((p) => p.id === loan.ratePlanId)?.name[lang] : undefined;
  const issuer = db.users.find((u) => u.id === loan.createdBy)?.name ?? '—';

  const doRelease = async () => {
    const ok = await confirmDialog({ title: t('rel.title'), body: t('rel.body'), confirmLabel: t('rel.cta'), cancelLabel: t('common.cancel') });
    if (!ok) return;
    try {
      const res = release(loan.id, today);
      toast.success(t('rel.done'));
      if (res.receiptIds[0]) nav(`/receipts/${res.receiptIds[0]}`);
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  const status = isActive
    ? overdue
      ? t('loan.d.daysLate', { n: row.daysOverdue })
      : left === 0
        ? t('loan.d.dueToday')
        : t('loan.d.daysLeft', { n: left })
    : t('loan.d.releasedOn', { date: f.date(loan.closedOn ?? today) });

  return (
    <div ref={ref} className="page">
      <PageHeader
        crumbs={[{ label: t('loan.title'), to: '/loans' }, { label: loan.number }]}
        title={<span className="mono loan-title">{loan.number}</span>}
        badge={<StateChip state={row.state} dueSoon={dueSoon} large />}
        actions={
          <>
            {isActive && can.renew ? <Button icon={<RefreshCw size={17} />} onClick={() => setPanel('renew')}>{t('loan.d.renew')}</Button> : null}
            {isActive && can.release ? (
              <span data-tip={canRelease ? undefined : t('loan.d.releaseHint')}>
                <Button icon={<BadgeCheck size={17} />} disabled={!canRelease} onClick={() => void doRelease()}>{t('loan.d.release')}</Button>
              </span>
            ) : null}
            {isActive && can.pay ? <Button variant="primary" icon={<Wallet size={18} />} onClick={() => setPanel('pay')} magnetic>{t('pay.collect')}</Button> : null}
          </>
        }
      />

      <section className={cx('loan-hero', overdue && 'is-overdue', !isActive && 'is-closed')} data-fx="scale">
        <div className="loan-hero__glow" aria-hidden="true" data-parallax="0.3" />
        <div className="loan-hero__who">
          <Avatar name={customer.name} size="lg" />
          <div className="cell-main">
            <Link to={`/customers/${customer.id}`} className="loan-hero__name">{customer.name}</Link>
            <span className="mono">{customer.code}</span>
            <span className="loan-hero__phone"><Phone size={13} /> <span className="mono">{f.digits(customer.mobile)}</span></span>
          </div>
        </div>

        <div className="loan-hero__due">
          <span className="loan-hero__label">{isActive ? t('loan.d.totalDue') : t('loan.d.closedTitle')}</span>
          <div className="display loan-hero__amount">
            {isActive ? <Num value={calc.totalOutstanding} kind="money" immediate /> : f.money(0)}
          </div>
          {isActive ? (
            <div className="loan-hero__chips">
              <span className="chip chip--onink">{t('loan.d.principalOut')} · {f.money(calc.principalOutstanding)}</span>
              <span className="chip chip--onink">{t('loan.d.interestOut')} · {f.money(calc.interestOutstanding)}</span>
            </div>
          ) : (
            <p className="muted-ink">{t('loan.d.closedBody')}</p>
          )}
        </div>

        <TermRing elapsed={isActive ? elapsed : 1} danger={overdue} label={status} sub={t('loan.d.maturesOn', { date: f.date(loan.maturityDate) })} />
      </section>

      <div className="stat-strip" data-fx-group data-stagger="0.06">
        <StatTile icon={<HandCoins size={17} />} label={t('common.principal')} value={<Num value={loan.principal} kind="money" />} sub={t('loan.d.pledgedOn', { date: f.date(loan.disbursedOn) })} />
        <StatTile icon={<Scale size={17} />} label={t('common.rate')} value={<span>{f.pct(loan.rate)}</span>} sub={`${t('common.perMonth')} · ${t('common.monthCount', { n: loan.termMonths })}`} />
        <StatTile icon={<CalendarClock size={17} />} tone={overdue ? 'danger' : dueSoon ? 'warn' : undefined} label={t('loan.col.maturity')} value={<span className="serif-num" style={{ fontSize: 26 }}>{f.date(loan.maturityDate)}</span>} sub={status} />
        <StatTile icon={<Wallet size={17} />} tone="ok" label={t('loan.d.paid')} value={<Num value={calc.interestPaid + calc.principalRepaid} kind="money" />} sub={`${t('common.interest')} ${f.money(calc.interestPaid)} · ${t('common.principal')} ${f.money(calc.principalRepaid)}`} />
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          {/* ---- interest ---- */}
          <Card data-fx="rise">
            <CardHead
              title={t('loan.d.interestTitle')}
              sub={t('loan.d.interestSub', { date: f.date(calc.asOf) })}
              actions={
                can.override ? (
                  <>
                    <Button size="sm" onClick={() => setPanel('check')}>{t('loan.d.check')}</Button>
                    {isActive ? <Button size="sm" icon={<SlidersHorizontal size={15} />} onClick={() => setPanel('adjust')}>{t('loan.d.adjust')}</Button> : null}
                  </>
                ) : null
              }
            />
            <div className="card__body stack" style={{ '--gap': '18px' } as React.CSSProperties}>
              <MonthLadder calc={calc} />
              <div className="rule-note">
                <b>{ruleSentence(t, calc)}</b>
                {isActive ? <span>{t('loan.d.nextMonth', { date: f.date(calc.nextMonthOn) })}</span> : null}
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('loan.d.col.month')}</th>
                    <th className="hide-sm">{t('loan.d.col.period')}</th>
                    <th className="r">{t('loan.d.col.basis')}</th>
                    <th className="r">{t('loan.d.col.interest')}</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.periods.map((p) => (
                    <tr key={p.index}>
                      <td><b>{f.digits(p.index)}</b></td>
                      <td className="hide-sm muted">{f.dateShort(p.from)} – {f.date(p.to)}</td>
                      <td className="r num">
                        {f.money(p.basis)} {p.reduced ? <Chip tone="info" plain>{t('loan.d.reduced')}</Chip> : null}
                      </td>
                      <td className="r num">{f.money(p.interest)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>{t('loan.d.accrued')}</td>
                    <td className="r num">{f.money(calc.interestAccrued - calc.adjustments)}</td>
                  </tr>
                  {calc.adjustments !== 0 ? (
                    <tr>
                      <td colSpan={3}>{t('loan.d.adjustments')}</td>
                      <td className="r num">{f.signedMoney(calc.adjustments)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td colSpan={3}>{t('loan.d.paid')}</td>
                    <td className="r num">{f.signedMoney(-calc.interestPaid)}</td>
                  </tr>
                  <tr className="tbl-total">
                    <td colSpan={3}>{t('loan.d.outstanding')}</td>
                    <td className="r num">{f.money(calc.interestOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ---- gold ---- */}
          <Card data-fx="rise">
            <CardHead
              title={t('loan.d.itemsTitle')}
              sub={isActive ? t('loan.d.itemsSub', { n: inCustody.length, w: f.weight(weight), v: f.money(value) }) : t('loan.d.itemsReleased', { date: f.date(loan.closedOn ?? today) })}
              actions={can.items ? <Link className="link" to="/vault">{t('nav.vault')}</Link> : null}
            />
            <ul className="item-rows" data-fx-group data-stagger="0.06">
              {items.map((i) => (
                <li key={i.id} className="item-row">
                  <span className="item-row__pic">{i.photo ? <img src={i.photo} alt="" /> : <ItemArt category={i.category} size={44} />}</span>
                  <span className="cell-main grow">
                    <b>{i.description}</b>
                    <span className="mono">{i.ref} · {t('loan.d.tag', { tag: i.tagNo })}</span>
                    <span>{locationText(i.location)}</span>
                  </span>
                  <span className="item-row__nums">
                    <Chip tone="gold" plain>{i.carat}K</Chip>
                    <b className="num">{f.weight(i.netWeight)}</b>
                    <span className="muted small">{f.vori(i.netWeight)}</span>
                    <span className="num small">{f.money(i.valuation)}</span>
                  </span>
                  {i.status === 'released' ? <Chip tone="ok" plain>{t('status.released')}</Chip> : null}
                </li>
              ))}
            </ul>
          </Card>

          {/* ---- ledger ---- */}
          <Card data-fx="rise">
            <CardHead title={t('loan.d.paymentsTitle')} />
            {ledger.length === 0 ? (
              <p className="muted" style={{ padding: '0 24px 24px' }}>{t('loan.d.noPayments')}</p>
            ) : (
              <ul className="ledger" data-fx-group data-stagger="0.05">
                {ledger.map((r) => {
                  const pay = payments.find((p) => p.id === r.paymentId);
                  const inner = (
                    <>
                      <span className={`rtag rtag--${r.type}`}>{r.number.slice(0, 2)}</span>
                      <span className="cell-main grow">
                        <b>{t(`rtype.${r.type}`)} {pay?.settlement && r.type !== 'release' ? <Chip tone="gold" plain>{t('loan.d.settled')}</Chip> : null}</b>
                        <span>
                          <span className="mono">{r.number}</span> · {f.date(r.date)}
                          {pay ? ` · ${t(`method.${pay.method}`)}${pay.reference ? ` · ${pay.reference}` : ''}` : ''}
                        </span>
                      </span>
                      <b className="num">{r.amount ? f.money(r.amount) : '—'}</b>
                    </>
                  );
                  return <li key={r.id}>{can.receipts ? <Link to={`/receipts/${r.id}`} className="ledger__row">{inner}</Link> : <div className="ledger__row">{inner}</div>}</li>;
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <Card data-fx="rise" data-fx-delay="0.06">
            <CardHead title={t('loan.d.termsTitle')} />
            <div className="card__body">
              <dl className="kv kv--tight">
                <dt>{t('common.principal')}</dt>
                <dd className="num">{f.money(loan.principal)}</dd>
                <dt>{t('common.rate')}</dt>
                <dd>{f.pct(loan.rate)} {t('common.perMonth')}</dd>
                <dt>{t('loan.d.plan')}</dt>
                <dd>{loan.customRate ? t('loan.d.customRate') : planName ?? '—'}</dd>
                <dt>{t('common.term')}</dt>
                <dd>{t('common.monthCount', { n: loan.termMonths })}</dd>
                <dt>{t('loan.col.date')}</dt>
                <dd>{f.date(loan.disbursedOn)}</dd>
                <dt>{t('loan.col.maturity')}</dt>
                <dd>{f.date(loan.maturityDate)}</dd>
                <dt>{t('loan.d.issuedBy')}</dt>
                <dd>{issuer}</dd>
                {loan.notes ? (
                  <>
                    <dt>{t('common.notes')}</dt>
                    <dd>{loan.notes}</dd>
                  </>
                ) : null}
              </dl>
              <p className="muted small" style={{ marginTop: 14 }}>
                <Gavel size={13} style={{ verticalAlign: '-2px' }} /> {t('loan.d.rulesFrozen', { g: loan.policy.graceDays, m: loan.policy.minMonths })} {loan.policy.partialBase === 'remaining' ? t('loan.d.partialRemaining') : t('loan.d.partialOriginal')}
              </p>
            </div>
          </Card>

          {loan.renewals.length || loan.adjustments.length || loan.manualChecks.length ? (
            <Card data-fx="rise" data-fx-delay="0.1">
              <CardHead title={t('loan.d.history')} />
              <div className="card__body stack" style={{ '--gap': '18px' } as React.CSSProperties}>
                {loan.renewals.length ? (
                  <section>
                    <h4 className="h4">{t('loan.d.renewals')}</h4>
                    <ul className="plain-list">
                      {loan.renewals.map((r) => (
                        <li key={r.id}>{t('loan.d.renewalLine', { date: f.date(r.date), from: f.date(r.previousMaturity), to: f.date(r.newMaturity) })}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {loan.adjustments.length ? (
                  <section>
                    <h4 className="h4">{t('loan.d.adjustmentsTitle')}</h4>
                    <ul className="plain-list">
                      {loan.adjustments.map((a) => (
                        <li key={a.id}>
                          <b className="num">{f.signedMoney(a.amount)}</b> · {t(`loan.d.adj.${a.kind}`)} · {f.date(a.date)}
                          <div className="muted small">{a.reason}</div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {loan.manualChecks.length ? (
                  <section>
                    <h4 className="h4">{t('loan.d.checksTitle')}</h4>
                    <ul className="plain-list">
                      {loan.manualChecks.map((c) => (
                        <li key={c.id}>{t('loan.d.checkLine', { date: f.date(c.asOf), manual: f.money(c.manualInterest), auto: f.money(c.autoInterest), diff: f.signedMoney(c.variance) })}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            </Card>
          ) : null}

          {can.audit && history.length ? (
            <Card data-fx="rise" data-fx-delay="0.14">
              <CardHead title={t('cust.d.history')} />
              <ol className="timeline" style={{ paddingTop: 0 }}>
                {history.map((e) => (
                  <li key={e.id} className={`timeline__item timeline__item--${auditTone(e)}`}>
                    <span className="timeline__dot" />
                    <div>
                      <div className="timeline__text">{auditLine(e, lang)}</div>
                      <div className="timeline__meta">{e.userName} · {f.dateTime(e.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </div>

      {can.pay ? <PaymentDrawer loanId={loan.id} open={panel === 'pay'} onClose={() => setPanel(null)} /> : null}
      {can.renew ? <RenewModal loanId={loan.id} open={panel === 'renew'} onClose={() => setPanel(null)} /> : null}
      {can.override ? <AdjustModal loanId={loan.id} open={panel === 'adjust'} onClose={() => setPanel(null)} /> : null}
      {can.override ? <CheckModal loanId={loan.id} open={panel === 'check'} onClose={() => setPanel(null)} /> : null}
    </div>
  );
}

function ruleSentence(t: ReturnType<typeof useT>, c: ReturnType<typeof calcLoan>) {
  const m = c.months;
  const g = c.policy.graceDays;
  if (m.rule === 'minimum') return t('loan.d.rule.minimum');
  if (m.rule === 'exact') return t('loan.d.rule.exact', { m: m.fullMonths });
  if (m.rule === 'grace') return t('loan.d.rule.grace', { m: m.fullMonths, e: m.extraDays, g });
  if (m.rule === 'threshold') return t('loan.d.rule.threshold', { m: m.fullMonths, e: m.extraDays, g: g + 1 });
  return t('loan.d.rule.none');
}

function TermRing({ elapsed, danger, label, sub }: { elapsed: number; danger: boolean; label: string; sub: string }) {
  const f = useFmt();
  const ring = useRef<SVGCircleElement>(null);
  const size = 150;
  const thickness = 12;
  useGSAP(
    () => {
      const el = ring.current;
      if (!el) return;
      const C = Number(el.dataset.ringLen);
      const to = Math.max(0.001, elapsed) * C;
      if (!fullMotion()) {
        el.style.strokeDasharray = `${to} ${C}`;
        return;
      }
      gsap.fromTo(el, { strokeDasharray: `0 ${C}` }, { strokeDasharray: `${to} ${C}`, duration: 1.6, delay: 0.5, ease: 'igh' });
    },
    { dependencies: [elapsed] },
  );
  return (
    <div className="loan-hero__ring">
      <Ring value={elapsed} size={size} thickness={thickness} color={danger ? '#ff8d80' : 'var(--gold-300)'} track="rgba(255,255,255,0.1)" progressRef={ring}>
        <div className="ring-center">
          <b className="serif-num">{f.n(Math.round(elapsed * 100))}%</b>
        </div>
      </Ring>
      <div className="loan-hero__ringtext">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}
