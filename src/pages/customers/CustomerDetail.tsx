import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, MapPin, PencilLine, Phone, Plus, IdCard } from 'lucide-react';
import { Avatar, Card, CardHead, EmptyState, PageHeader, StateChip, rowDelay } from '../../components/blocks';
import { Button, ButtonLink } from '../../components/controls';
import { StatTile } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useCan, useDb, useFmt, useLang, useRows, useT, useToday } from '../../lib/hooks';
import { isDueSoon } from '../../lib/selectors';
import { localDateOf } from '../../lib/dates';
import { auditLine, auditTone } from '../../lib/auditText';
import { toast } from '../../lib/ui';
import { CustomerForm } from './CustomerForm';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const nav = useNavigate();
  const db = useDb();
  const rows = useRows();
  const today = useToday();
  const canEdit = useCan('customers.edit');
  const canLoan = useCan('loans.create');
  const canAudit = useCan('audit.view');
  const canReceipts = useCan('receipts.view');
  const ref = usePageFX([id]);
  const [editing, setEditing] = useState(false);

  const customer = db.customers.find((c) => c.id === id);
  const mine = useMemo(() => rows.filter((r) => r.customer.id === id).sort((a, b) => b.loan.disbursedOn.localeCompare(a.loan.disbursedOn) || b.loan.createdAt.localeCompare(a.loan.createdAt)), [rows, id]);
  const payments = useMemo(() => db.payments.filter((p) => p.customerId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [db.payments, id]);
  const receipts = useMemo(() => db.receipts.filter((r) => r.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db.receipts, id]);
  const history = useMemo(() => db.audit.filter((e) => e.entity === 'customer' && e.entityId === id).slice(-5).reverse(), [db.audit, id]);

  if (!customer) {
    return (
      <Card style={{ marginTop: 24 }}>
        <EmptyState title={t('cust.d.notFound')} body={t('cust.d.notFoundBody')} action={<ButtonLink to="/customers" variant="primary">{t('cust.title')}</ButtonLink>} />
      </Card>
    );
  }

  const active = mine.filter((r) => r.loan.status === 'active');
  const principal = active.reduce((s, r) => s + r.calc.principalOutstanding, 0);
  const interest = active.reduce((s, r) => s + r.calc.interestOutstanding, 0);
  const borrowed = mine.reduce((s, r) => s + r.loan.principal, 0);
  const paid = payments.reduce((s, p) => s + p.interest + p.principal, 0);
  const loanNo = (loanId: string) => db.loans.find((l) => l.id === loanId)?.number ?? '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.info(text);
    }
  };

  return (
    <div ref={ref} className="page">
      <PageHeader
        crumbs={[{ label: t('cust.title'), to: '/customers' }, { label: customer.name }]}
        title={t('cust.d.profile')}
        actions={
          <>
            {canEdit ? <Button icon={<PencilLine size={17} />} onClick={() => setEditing(true)}>{t('common.edit')}</Button> : null}
            {canLoan ? <ButtonLink to={`/loans/new?customer=${customer.id}`} variant="primary" icon={<Plus size={18} />} magnetic>{t('nav.newLoan')}</ButtonLink> : null}
          </>
        }
      />

      <section className="person-hero" data-fx="scale">
        <div className="person-hero__glow" aria-hidden="true" data-parallax="0.3" />
        <Avatar name={customer.name} size="xl" />
        <div className="person-hero__main">
          <h2 className="display person-hero__name" key={lang}>{customer.name}</h2>
          <div className="person-hero__chips">
            <span className="chip chip--onink mono">{customer.code}</span>
            <span className="muted-ink">{t('cust.d.since', { date: f.date(localDateOf(customer.createdAt)) })}</span>
          </div>
          <div className="person-hero__facts">
            <button type="button" onClick={() => void copy(customer.mobile)} className="fact" title={t('common.copy')}>
              <Phone size={15} />
              <span className="mono">{f.digits(customer.mobile)}</span>
              <Copy size={13} className="fact__copy" />
            </button>
            <span className="fact">
              <MapPin size={15} />
              <span>{customer.address}</span>
            </span>
            {customer.nid ? (
              <span className="fact">
                <IdCard size={15} />
                <span className="mono">{f.digits(customer.nid)}</span>
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="stat-strip stat-strip--5" data-fx-group data-stagger="0.06">
        <StatTile label={t('cust.d.active')} value={<Num value={active.length} />} />
        <StatTile label={t('cust.d.principal')} value={<Num value={principal} kind="money" />} tone={principal ? 'gold' : undefined} />
        <StatTile label={t('cust.d.interest')} value={<Num value={interest} kind="money" />} tone={active.some((r) => r.state === 'overdue') ? 'danger' : undefined} />
        <StatTile label={t('cust.d.borrowed')} value={<Num value={borrowed} kind="money" />} />
        <StatTile label={t('cust.d.paid')} value={<Num value={paid} kind="money" />} tone="ok" />
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <Card data-fx="rise">
            <CardHead title={t('cust.d.loans')} />
            {mine.length === 0 ? (
              <EmptyState compact title={t('cust.d.loansEmpty')} body={t('cust.d.loansEmptyBody')} action={canLoan ? <ButtonLink to={`/loans/new?customer=${customer.id}`} variant="primary">{t('nav.newLoan')}</ButtonLink> : undefined} />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl tbl--stack">
                  <thead>
                    <tr>
                      <th>{t('common.loan')}</th>
                      <th className="r">{t('common.principal')}</th>
                      <th className="hide-md">{t('common.rate')}</th>
                      <th className="hide-md">{t('loan.col.maturity')}</th>
                      <th>{t('common.status')}</th>
                      <th className="r">{t('loan.col.due')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((r, i) => (
                      <tr key={r.loan.id} className="is-link row-in" style={rowDelay(i)} onClick={() => nav(`/loans/${r.loan.id}`)}>
                        <td>
                          <div className="cell-main">
                            <b className="mono nowrap">{r.loan.number}</b>
                            <span>{f.date(r.loan.disbursedOn)}</span>
                          </div>
                        </td>
                        <td className="r num" data-label={t('common.principal')}>{f.money(r.loan.principal)}</td>
                        <td className="hide-md" data-label={t('common.rate')}>
                          <div className="cell-main">
                            <b>{f.pct(r.loan.rate)}</b>
                            <span>{t('common.perMonth')}</span>
                          </div>
                        </td>
                        <td className="hide-md nowrap" data-label={t('loan.col.maturity')}>{f.date(r.loan.maturityDate)}</td>
                        <td data-label={t('common.status')}><StateChip state={r.state} dueSoon={isDueSoon(r, today)} /></td>
                        <td className="r num" data-label={t('loan.col.due')}>{r.loan.status === 'active' ? <b>{f.money(r.calc.totalOutstanding)}</b> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card data-fx="rise">
            <CardHead title={t('cust.d.payments')} />
            {payments.length === 0 ? (
              <p className="muted" style={{ padding: '0 24px 24px' }}>{t('cust.d.paymentsEmpty')}</p>
            ) : (
              <ol className="timeline" data-fx-group data-stagger="0.04">
                {payments.slice(0, 12).map((p) => (
                  <li key={p.id} className={`timeline__item timeline__item--${p.settlement ? 'gold' : 'ok'}`}>
                    <span className="timeline__dot" />
                    <div className="grow">
                      <div className="timeline__text">
                        <b className="num">{f.money(p.interest + p.principal)}</b>{' '}
                        <span className="muted">{[p.interest ? t('cust.d.paidInterest', { a: f.money(p.interest) }) : '', p.principal ? t('cust.d.paidPrincipal', { a: f.money(p.principal) }) : ''].filter(Boolean).join(' · ')}</span>
                      </div>
                      <div className="timeline__meta">
                        {f.date(p.date)} · {t(`method.${p.method}`)} · <Link className="link mono" to={`/loans/${p.loanId}`}>{loanNo(p.loanId)}</Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="stack" style={{ '--gap': '24px' } as React.CSSProperties}>
          <Card data-fx="rise" data-fx-delay="0.08">
            <CardHead title={t('cust.d.profile')} />
            <div className="card__body">
              <dl className="kv kv--tight">
                <dt>{t('common.mobile')}</dt>
                <dd className="mono">{f.digits(customer.mobile)}</dd>
                {customer.altMobile ? (
                  <>
                    <dt>{t('cust.d.alt')}</dt>
                    <dd className="mono">{f.digits(customer.altMobile)}</dd>
                  </>
                ) : null}
                <dt>{t('common.address')}</dt>
                <dd>{customer.address}</dd>
                <dt>{t('cust.d.nid')}</dt>
                <dd className="mono">{customer.nid ? f.digits(customer.nid) : '—'}</dd>
                <dt>{t('cust.d.notes')}</dt>
                <dd>{customer.notes || <span className="muted">{t('cust.d.noNotes')}</span>}</dd>
              </dl>
            </div>
          </Card>

          {canReceipts ? (
            <Card data-fx="rise" data-fx-delay="0.12">
              <CardHead title={t('cust.d.receipts')} />
              {receipts.length === 0 ? (
                <p className="muted" style={{ padding: '0 24px 24px' }}>—</p>
              ) : (
                <ul className="mini-list">
                  {receipts.slice(0, 8).map((r) => (
                    <li key={r.id}>
                      <Link to={`/receipts/${r.id}`} className="mini-row">
                        <span className={`rtag rtag--${r.type}`}>{r.number.slice(0, 2)}</span>
                        <span className="cell-main grow">
                          <b className="mono">{r.number}</b>
                          <span>{t(`rtype.${r.type}`)} · {f.date(r.date)}</span>
                        </span>
                        <b className="num">{r.amount ? f.money(r.amount) : '—'}</b>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {canAudit && history.length ? (
            <Card data-fx="rise" data-fx-delay="0.16">
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

      <CustomerForm open={editing} onClose={() => setEditing(false)} customerId={customer.id} />
    </div>
  );
}
