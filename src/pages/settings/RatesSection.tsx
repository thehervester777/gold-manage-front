import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Card, CardHead, EmptyState } from '../../components/blocks';
import { Button, Chip, NumberField } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { AreaChart } from '../../components/charts';
import { useApp } from '../../lib/store';
import { useAction, useCan, useFmt, useSettings, useT, useToday } from '../../lib/hooks';
import { toast } from '../../lib/ui';
import type { ISODate } from '../../lib/dates';
import type { GoldRate } from '../../lib/types';
import { cx } from '../../lib/cx';
import { BIG_MOVE_PCT, OTHER_CARATS, fromK22, inCaratOrder, pctChange, previousRate, type Others } from './model';

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}`;

/** Record the day's gold price per vori and see how it has moved. */
export function RatesSection() {
  const t = useT();
  const f = useFmt();
  const today = useToday();
  const canManage = useCan('settings.manage');
  const rates = useSettings().goldRates;
  const add = useApp((s) => s.addGoldRate);
  const act = useAction();

  const latest = rates.at(-1);
  const [date, setDate] = useState<ISODate>(today);
  const [k22, setK22] = useState<number | null>(latest?.k22 ?? null);
  const [others, setOthers] = useState<Others>(() => (latest ? { k24: latest.k24, k21: latest.k21, k18: latest.k18 } : { k24: null, k21: null, k18: null }));
  const [touched, setTouched] = useState<ReadonlySet<keyof Others>>(new Set());
  const [tried, setTried] = useState(false);

  const existing = rates.find((r) => r.date === date);

  // Pick a date that already has a rate and the form shows it, ready to correct.
  useEffect(() => {
    const ex = rates.find((r) => r.date === date);
    if (!ex) return;
    setK22(ex.k22);
    setOthers({ k24: ex.k24, k21: ex.k21, k18: ex.k18 });
    setTouched(new Set());
    // only when the date changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const changeK22 = (v: number | null) => {
    setK22(v);
    if (v && v > 0) {
      const d = fromK22(v);
      setOthers((o) => ({
        k24: touched.has('k24') ? o.k24 : d.k24,
        k21: touched.has('k21') ? o.k21 : d.k21,
        k18: touched.has('k18') ? o.k18 : d.k18,
      }));
    }
  };
  const changeOther = (key: keyof Others, v: number | null) => {
    setOthers((o) => ({ ...o, [key]: v }));
    setTouched((s) => new Set(s).add(key));
  };
  const recalc = () => {
    if (!k22 || k22 <= 0) return;
    setOthers(fromK22(k22));
    setTouched(new Set());
  };

  const prev = useMemo(() => previousRate(rates, date), [rates, date]);
  const delta = k22 && prev ? pctChange(k22, prev.k22) : null;
  const big = delta !== null && Math.abs(delta) >= BIG_MOVE_PCT;

  const filled = k22 && others.k24 && others.k21 && others.k18 ? { k24: others.k24, k22, k21: others.k21, k18: others.k18 } : null;
  const errors = {
    date: date > today ? ('set.rate.err.date' as const) : undefined,
    k22: tried && !k22 ? ('set.rate.err.value' as const) : undefined,
    order: filled && !inCaratOrder(filled) ? ('set.rate.err.order' as const) : undefined,
  };
  const valid = !!filled && !errors.date && !errors.order;

  const submit = act(() => {
    setTried(true);
    if (!valid || !filled) return;
    add({ date, ...filled });
    toast.success(t('set.rate.saved'), t('set.rate.savedBody', { date: f.date(date), price: f.money(filled.k22) }));
    setTried(false);
  });

  // ---- recent history --------------------------------------------------------------------
  const series = useMemo(() => rates.slice(-30).map((r) => ({ label: f.date(r.date), value: r.k22 })), [rates, f]);
  const recent = useMemo(() => {
    const rows = rates.slice(-9);
    return rows
      .map((r, i) => {
        const before = i > 0 ? rows[i - 1] : rates.length > rows.length ? rates[rates.length - rows.length - 1] : undefined;
        return { rate: r, delta: before ? pctChange(r.k22, before.k22) : null };
      })
      .slice(-8)
      .reverse();
  }, [rates]);

  return (
    <Card id="set-rates" className="set-card" data-fx="rise" aria-labelledby="set-rates-h">
      <CardHead id="set-rates-h" title={t('set.rate.title')} sub={t('set.rate.sub')} />
      <div className={cx('card__body set-rates', !canManage && 'is-single')}>
        {canManage ? (
          <form
            className="set-rates__form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            noValidate
          >
            <h3 className="set-sub">{t('set.rate.form.title')}</h3>
            <DateField label={t('common.date')} value={date} onChange={setDate} max={today} error={errors.date ? t(errors.date) : undefined} />
            <NumberField
              label={t('set.rate.k22')}
              prefix="৳"
              value={k22}
              onChange={changeK22}
              big
              error={errors.k22 ? t(errors.k22) : undefined}
              hint={
                delta !== null && prev ? (
                  <span className={cx('set-delta', delta > 0 && 'is-up', delta < 0 && 'is-down')}>
                    {delta >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                    {t('set.rate.vs', { delta: `${signed(delta)}${f.n(Math.abs(delta), 2)}%`, date: f.date(prev.date), price: f.money(prev.k22) })}
                  </span>
                ) : undefined
              }
            />
            {big ? (
              <p className="set-warn" role="status">
                <TriangleAlert size={16} aria-hidden="true" />
                {t('set.rate.big')}
              </p>
            ) : null}

            <fieldset className="set-group set-group--tight">
              <legend>{t('set.rate.others')}</legend>
              <p className="set-group__hint">{t('set.rate.othersHint')}</p>
              <div className="set-carats">
                {OTHER_CARATS.map((c) => (
                  <NumberField
                    key={c.key}
                    label={t('dash.rate.carat', { n: c.carat })}
                    value={others[c.key]}
                    onChange={(v) => changeOther(c.key, v)}
                    error={tried && !others[c.key] ? t('set.rate.err.value') : undefined}
                  />
                ))}
              </div>
              {errors.order ? <p className="set-warn is-bad" role="alert"><TriangleAlert size={16} aria-hidden="true" />{t(errors.order)}</p> : null}
              {touched.size > 0 ? (
                <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={recalc}>
                  {t('set.rate.recalc')}
                </Button>
              ) : null}
            </fieldset>

            <div className="set-actions">
              <Button type="submit" variant="primary">
                {existing ? t('set.rate.update') : t('set.rate.save')}
              </Button>
            </div>
          </form>
        ) : null}

        <div className="set-rates__history">
          <div className="set-rates__chart">
            <div className="set-rates__charthead">
              <b>{t('set.rate.recent')}</b>
              {latest ? <Chip tone="gold" plain>{t('dash.rate.carat', { n: 22 })} · {f.money(latest.k22)}</Chip> : null}
            </div>
            {rates.length > 1 ? (
              <AreaChart data={series} height={140} format={(v) => f.money(v)} />
            ) : null}
          </div>

          {recent.length ? (
            <ul className="set-rate-list">
              {recent.map(({ rate, delta: d }) => (
                <RateRow key={rate.date} rate={rate} delta={d} />
              ))}
            </ul>
          ) : (
            <EmptyState compact title={t('set.rate.empty')} body={t('set.rate.emptyBody')} />
          )}
        </div>
      </div>
    </Card>
  );
}

function RateRow({ rate, delta }: { rate: GoldRate; delta: number | null }) {
  const t = useT();
  const f = useFmt();
  return (
    <li className="set-rate-row">
      <div className="set-rate-row__main">
        <b>{f.date(rate.date)}</b>
        <span>
          {t('dash.rate.carat', { n: 21 })} {f.money(rate.k21)} · {t('dash.rate.carat', { n: 18 })} {f.money(rate.k18)}
        </span>
      </div>
      <div className="set-rate-row__price">
        <b className="serif-num">{f.money(rate.k22)}</b>
        {delta !== null ? (
          <span className={cx('set-delta', delta > 0 && 'is-up', delta < 0 && 'is-down')}>
            {delta > 0 ? <TrendingUp size={12} aria-hidden="true" /> : delta < 0 ? <TrendingDown size={12} aria-hidden="true" /> : null}
            {signed(delta)}
            {f.n(Math.abs(delta), 2)}%
          </span>
        ) : null}
      </div>
    </li>
  );
}
