import { useMemo, useState } from 'react';
import { Card, CardHead } from '../../components/blocks';
import { Chip, NumberField } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { Num } from '../../motion/Num';
import { MonthLadder } from '../loans/MonthLadder';
import { useBi, useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { addDays, addMonths, cmpISO, type ISODate } from '../../lib/dates';
import { calculate, monthlyInterest, type InterestPolicy } from '../../lib/interest';
import { cx } from '../../lib/cx';
import { heldText, ruleSentence } from './model';

const MAX_RATE = 15;

/** A what-if calculator: any principal, rate and pair of dates, worked out under the rules on this page. Nothing is saved. */
export function TryLoan({ policy, previewing }: { policy: InterestPolicy; previewing: boolean }) {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const db = useDb();
  const today = useToday();
  const plans = db.settings.ratePlans.filter((p) => p.active);

  const [principal, setPrincipal] = useState<number | null>(60000);
  const [rate, setRate] = useState<number | null>(plans[0]?.rate ?? 5);
  // two months and four days: just past the free days, so the rule has something to show
  const [start, setStart] = useState<ISODate>(() => addDays(addMonths(today, -2), -4));
  const [end, setEnd] = useState<ISODate>(today);

  const problem =
    principal == null || principal <= 0 ? 'int.try.needPrincipal' : rate == null || !(rate > 0 && rate <= MAX_RATE) ? 'int.try.needRate' : cmpISO(end, start) < 0 ? 'int.try.badDates' : null;

  const calc = useMemo(
    () =>
      problem
        ? null
        : calculate({ start, asOf: end, principal: principal!, rate: rate!, principalPayments: [], interestPaid: 0, adjustments: 0, policy }),
    [problem, start, end, principal, rate, policy],
  );

  return (
    <Card className="itry" data-fx="rise" aria-labelledby="itry-title">
      <CardHead
        id="itry-title"
        title={t('int.try.title')}
        sub={t('int.try.sub')}
        actions={previewing ? <Chip tone="gold">{t('int.preview')}</Chip> : undefined}
      />
      <div className="itry__body">
        <div className="itry__form">
          <NumberField big label={t('common.principal')} prefix="৳" value={principal} onChange={setPrincipal} />
          <div className="itry__rate">
            <NumberField label={t('int.try.rate')} suffix="%" decimals={2} value={rate} onChange={setRate} />
            {plans.length ? (
              <div className="itry__plans" role="group" aria-label={t('int.plans.title')}>
                {plans.map((p) => (
                  <button key={p.id} type="button" className="plan-chip" aria-pressed={rate === p.rate} onClick={() => setRate(p.rate)}>
                    <span>{bi(p.name)}</span>
                    <b>{f.pct(p.rate)}</b>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="itry__dates">
            <DateField label={t('int.try.start')} value={start} onChange={setStart} />
            <DateField label={t('int.try.end')} value={end} onChange={setEnd} min={start} error={problem === 'int.try.badDates' ? t('int.try.badDates') : undefined} />
          </div>
        </div>

        <div className={cx('itry__result', !calc && 'is-empty')} aria-live="polite">
          {calc ? (
            <>
              <div className="itry__total">
                <span>{t('int.try.total')}</span>
                <b className="serif-num"><Num kind="money" value={calc.interestAccrued} immediate duration={1.1} /></b>
              </div>
              <p className="itry__sentence">{ruleSentence(t, calc.months.fullMonths, calc.months.extraDays, calc.months.rule, policy.graceDays)}</p>
              <dl className="itry__stats">
                <div>
                  <dt>{t('int.try.months')}</dt>
                  <dd>{f.n(calc.months.chargeable)}</dd>
                </div>
                <div>
                  <dt>{t('int.try.held')}</dt>
                  <dd>{heldText(t, calc.months.fullMonths, calc.months.extraDays)}</dd>
                </div>
                <div>
                  <dt>{t('int.try.each')}</dt>
                  <dd>{f.money(monthlyInterest(calc.principal, calc.rate))}</dd>
                </div>
                <div>
                  <dt>{t('int.try.next')}</dt>
                  <dd>{f.date(calc.nextMonthOn)}</dd>
                </div>
                <div className="is-wide">
                  <dt>{t('int.try.together')}</dt>
                  <dd>{f.money(calc.principal + calc.interestAccrued)}</dd>
                </div>
              </dl>
              <MonthLadder calc={calc} />
            </>
          ) : (
            <p className="itry__problem">{problem ? t(problem) : null}</p>
          )}
        </div>
      </div>
    </Card>
  );
}
