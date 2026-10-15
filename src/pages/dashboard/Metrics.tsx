import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BadgePercent, Banknote, HandCoins, TriangleAlert, Users, Wallet } from 'lucide-react';
import { Card } from '../../components/blocks';
import { Sparkline } from '../../components/charts';
import { Num, type NumKind } from '../../motion/Num';
import { useFmt, useKpiTrend, usePortfolio, useT, useToday } from '../../lib/hooks';
import { cx } from '../../lib/cx';

interface Metric {
  id: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: number;
  kind: NumKind;
  caption: string;
  trend: number[];
  to: string;
  tone?: 'danger' | 'gold';
}

/** The six live figures the requirements ask for. Everything is derived from the records. */
export function Metrics() {
  const t = useT();
  const f = useFmt();
  const pf = usePortfolio();
  const tr = useKpiTrend();
  const today = useToday();

  const items: Metric[] = [
    { id: 'customers', icon: Users, label: t('dash.m.customers'), value: pf.totalCustomers, kind: 'int', caption: pf.newCustomersThisMonth ? t('dash.m.newThisMonth', { n: pf.newCustomersThisMonth }) : t('dash.m.customers.cap'), trend: tr.customers, to: '/customers' },
    { id: 'active', icon: HandCoins, label: t('dash.m.active'), value: pf.activeLoans, kind: 'int', caption: pf.newLoansThisMonth ? t('dash.m.newThisMonth', { n: pf.newLoansThisMonth }) : t('dash.m.active.cap'), trend: tr.active, to: '/loans?state=active' },
    { id: 'disbursed', icon: Banknote, label: t('dash.m.disbursed'), value: pf.totalDisbursed, kind: 'money', caption: t('dash.m.disbursed.cap'), trend: tr.disbursed, to: '/reports?r=disbursement' },
    { id: 'collected', icon: Wallet, label: t('dash.m.collected'), value: pf.interestCollectedThisMonth, kind: 'money', caption: t('dash.m.collected.cap', { month: f.monthYear(today) }), trend: tr.collected, to: '/reports?r=interest' },
    { id: 'outstanding', icon: BadgePercent, label: t('dash.m.outstanding'), value: pf.outstandingInterest, kind: 'money', caption: t('dash.m.outstanding.cap'), trend: tr.outstanding, to: '/reports?r=outstanding' },
    { id: 'overdue', icon: TriangleAlert, label: t('dash.m.overdue'), value: pf.overdueCount, kind: 'int', caption: t('dash.m.overdue.cap'), trend: tr.overdue, to: '/loans?state=overdue', tone: pf.overdueCount > 0 ? 'danger' : undefined },
  ];

  return (
    <section className="metrics" aria-label={t('dash.live')} data-fx-group data-stagger="0.08">
      {items.map((m) => (
        <Card key={m.id} spot className={cx('metric', m.tone && `metric--${m.tone}`)} data-fx-item data-tilt="2.5">
          <div className="metric__top">
            <span className="metric__icon"><m.icon size={19} strokeWidth={1.9} /></span>
            <span className="metric__label">{m.label}</span>
            <Link to={m.to} className="metric__go" aria-label={`${m.label}: ${t('dash.m.reconcile')}`} title={t('dash.m.reconcile')}>
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <div className="metric__value">
            <Num value={m.value} kind={m.kind} className="serif-num" />
          </div>
          <div className="metric__bottom">
            <span className="metric__cap">{m.caption}</span>
            <Sparkline data={m.trend.length > 1 ? m.trend : [0, 0]} width={104} height={34} color={m.tone === 'danger' ? 'var(--c5)' : 'var(--c1)'} />
          </div>
        </Card>
      ))}
    </section>
  );
}
