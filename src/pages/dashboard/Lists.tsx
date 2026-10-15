import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CircleCheck, PartyPopper } from 'lucide-react';
import { Card, CardHead, Avatar, EmptyState } from '../../components/blocks';
import { Button, Chip } from '../../components/controls';
import { useCan, useFmt, useRows, useT, useToday } from '../../lib/hooks';
import { maturingSoon, overdueRows } from '../../lib/selectors';

export function OverdueCard() {
  const t = useT();
  const f = useFmt();
  const rows = useRows();
  const nav = useNavigate();
  const canPay = useCan('payments.collect');
  const list = overdueRows(rows);
  const top = list.slice(0, 6);

  return (
    <Card className="d-overdue" data-fx="rise">
      <CardHead
        title={t('dash.overdue.title')}
        sub={t('dash.overdue.sub')}
        actions={
          list.length > top.length ? (
            <Link className="link" to="/loans?state=overdue">{t('common.viewAll')} ({f.n(list.length)})</Link>
          ) : null
        }
      />
      {top.length === 0 ? (
        <EmptyState compact title={t('dash.overdue.title')} body={t('dash.overdue.empty')} />
      ) : (
        <ul className="od-list" data-fx-group data-stagger="0.06">
          {top.map((r) => (
            <li key={r.loan.id} className="od-row" onClick={() => nav(`/loans/${r.loan.id}`)}>
              <div className="cell-person">
                <Avatar name={r.customer.name} />
                <div className="cell-main">
                  <b className="truncate">{r.customer.name}</b>
                  <span className="mono">{f.code(r.loan.number)}</span>
                </div>
              </div>
              <div className="od-row__late hide-sm">
                <Chip tone="danger" plain>{r.daysOverdue === 1 ? t('dash.overdue.dayLate') : t('dash.overdue.daysLate', { n: r.daysOverdue })}</Chip>
                <span className="muted micro">{t('dash.overdue.matured')} {f.date(r.loan.maturityDate)}</span>
              </div>
              <div className="od-row__due">
                <b className="num">{f.money(r.calc.totalOutstanding)}</b>
                <span className="muted micro">{t('dash.overdue.due')}</span>
              </div>
              {canPay ? (
                <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); nav(`/loans/${r.loan.id}?collect=1`); }}>
                  {t('common.collect')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MaturingCard() {
  const t = useT();
  const f = useFmt();
  const rows = useRows();
  const today = useToday();
  const list = maturingSoon(rows, today, 30);

  return (
    <Card className="d-maturing" data-fx="rise" data-fx-delay="0.1">
      <CardHead title={t('dash.maturing.title')} actions={<Chip tone="warn" plain>{f.n(list.length)}</Chip>} />
      {list.length === 0 ? (
        <EmptyState compact title={t('dash.maturing.title')} body={t('dash.maturing.empty')} />
      ) : (
        <ul className="mat-list" data-fx-group data-stagger="0.05">
          {list.slice(0, 7).map((r) => (
            <li key={r.loan.id}>
              <Link to={`/loans/${r.loan.id}`} className="mat-row">
                <span className="mat-row__icon"><CalendarClock size={17} /></span>
                <span className="cell-main grow">
                  <b className="truncate">{r.customer.name}</b>
                  <span>{r.inDays === 0 ? t('dash.maturing.todayLabel') : r.inDays === 1 ? t('dash.maturing.tomorrow') : t('dash.maturing.in', { n: r.inDays })} · {f.date(r.loan.maturityDate)}</span>
                </span>
                <b className="num">{f.money(r.calc.totalOutstanding)}</b>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

void CircleCheck;
void PartyPopper;
