import { useMemo, useState } from 'react';
import { ArrowUpRight, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ButtonLink, Chip } from '../../components/controls';
import { AreaChart } from '../../components/charts';
import { useCan, useFmt, useLang, useSettings, useT, useUser } from '../../lib/hooks';
import type { GoldRate } from '../../lib/types';
import { cx } from '../../lib/cx';
import { Num } from '../../motion/Num';

type Carat = 'k24' | 'k22' | 'k21' | 'k18';
const CARATS: { id: Carat; n: number }[] = [
  { id: 'k24', n: 24 },
  { id: 'k22', n: 22 },
  { id: 'k21', n: 21 },
  { id: 'k18', n: 18 },
];

export function RateCard() {
  const t = useT();
  const f = useFmt();
  const settings = useSettings();
  const canManage = useCan('settings.manage');
  const [carat, setCarat] = useState<Carat>('k22');
  const rates: GoldRate[] = settings.goldRates;
  const data = useMemo(() => rates.slice(-60).map((r) => ({ label: f.date(r.date), value: r[carat] })), [rates, carat, f]);
  const cur = rates.at(-1);
  const wk = rates.at(-8) ?? rates[0];
  if (!cur) return null;
  const delta = wk ? ((cur[carat] - wk[carat]) / wk[carat]) * 100 : 0;
  const up = delta >= 0;

  return (
    <div className="rate-card">
      <div className="rate-card__top">
        <span className="rate-card__title">{t('dash.rate.title')}</span>
        <div className="seg seg--ink" role="group" aria-label={t('common.carat')}>
          {CARATS.map((c) => (
            <button key={c.id} type="button" className="seg__btn" aria-pressed={carat === c.id} onClick={() => setCarat(c.id)}>
              {f.digits(c.n)}K
            </button>
          ))}
        </div>
      </div>
      <div className="rate-card__price">
        <Num value={cur[carat]} kind="money" duration={1.4} immediate className="serif-num" />
        <span>{t('common.perVori')}</span>
      </div>
      <div className="rate-card__meta">
        <Chip tone={up ? 'ok' : 'danger'} plain>
          {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {f.n(Math.abs(delta), 2)}% · {t('dash.rate.week')}
        </Chip>
        <span>{t('dash.rate.updated', { date: f.date(cur.date) })}</span>
      </div>
      <AreaChart data={data} height={132} format={(v) => f.money(v)} onInk color="#e6bf62" />
      {canManage ? (
        <Link to="/settings#rates" className="rate-card__link">
          {t('dash.rate.update')} <ArrowUpRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}

export function Hero({ overdueCount }: { overdueCount: number }) {
  const t = useT();
  const lang = useLang();
  const user = useUser();
  const canLoan = useCan('loans.create');
  const canPay = useCan('payments.collect');
  const hour = new Date().getHours();
  const key = hour < 12 ? 'dash.greet.morning' : hour < 17 ? 'dash.greet.afternoon' : 'dash.greet.evening';
  const first = user.name.split(' ')[0];

  return (
    <section className="d-hero" aria-label={t('nav.dashboard')}>
      <div className="d-hero__bg" aria-hidden="true">
        <span className="d-hero__glow" data-parallax="0.5" />
        <span className="d-hero__rings" data-parallax="-0.25" />
      </div>
      <div className="d-hero__main">
        <Chip pulse className="chip--onink d-hero__live">{t('dash.live')}</Chip>
        <h1 key={lang} className="display d-hero__title" data-fx="split">{t(key, { name: first })}</h1>
        <p className="d-hero__sub" data-fx="rise" data-fx-delay="0.35">
          {overdueCount > 0 ? t('dash.sub.overdue', { n: overdueCount }) : t('dash.sub.clear')}
        </p>
        <div className="d-hero__actions" data-fx="rise" data-fx-delay="0.5">
          {canLoan ? (
            <ButtonLink to="/loans/new" variant="primary" size="lg" icon={<Plus size={18} />} magnetic>
              {t('nav.newLoan')}
            </ButtonLink>
          ) : null}
          {canPay ? (
            <ButtonLink to="/payments?collect=1" variant="onink" size="lg" icon={<Wallet size={18} />}>
              {t('cmd.collect')}
            </ButtonLink>
          ) : null}
        </div>
      </div>
      <div className={cx('d-hero__side')} data-fx="scale" data-fx-delay="0.3">
        <RateCard />
      </div>
    </section>
  );
}
