import { Link } from 'react-router-dom';
import { CalendarClock, Scale, TriangleAlert } from 'lucide-react';
import { Card } from '../../../components/blocks';
import { DateField } from '../../../components/pickers';
import { Field, NumberField, Segmented, TextAreaField } from '../../../components/controls';
import { Num } from '../../../motion/Num';
import { useBi, useFmt, useSettings, useT, useToday } from '../../../lib/hooks';
import { addMonths } from '../../../lib/dates';
import { monthlyInterest } from '../../../lib/interest';
import { cx } from '../../../lib/cx';
import type { DraftTerms } from './draft';

export const TERM_PRESETS = [3, 6, 9, 12];

export function resolveRate(terms: DraftTerms, plans: { id: string; rate: number }[]): number | null {
  if (terms.planId === 'custom') return terms.customRate;
  return plans.find((p) => p.id === terms.planId)?.rate ?? null;
}

interface Props {
  terms: DraftTerms;
  value: number;
  showErrors: boolean;
  onChange: (patch: Partial<DraftTerms>) => void;
}

export function TermsStep({ terms, value, showErrors, onChange }: Props) {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const today = useToday();
  const settings = useSettings();
  const { maxLtv, policy, approvedAt } = settings.interest;
  const plans = settings.ratePlans.filter((p) => p.active);
  const rate = resolveRate(terms, plans);
  const term = terms.term;
  const principal = terms.principal ?? 0;
  const ratio = value > 0 ? (principal / value) * 100 : 0;
  const high = ratio > maxLtv + 1e-9;
  const termOk = term != null && Number.isInteger(term) && term >= 1 && term <= 36;
  const maturity = termOk ? addMonths(terms.date, term) : null;
  const month = rate != null && principal > 0 ? monthlyInterest(principal, rate) : 0;
  const full = termOk ? month * term : 0;
  const preset = term != null && TERM_PRESETS.includes(term) ? String(term) : 'other';
  const quicks = [50, 60, 70].filter((p) => p < maxLtv);
  const lend = (p: number) => onChange({ principal: Math.floor((value * p) / 100 / 100) * 100 });

  return (
    <div className="stack" style={{ gap: 22 }}>
      {!approvedAt ? (
        <div className="callout callout--warn" role="status">
          <TriangleAlert size={18} />
          <span>
            {t('wiz.t.provisional')} <Link className="link" to="/interest">{t('wiz.t.provisionalLink')}</Link>
          </span>
        </div>
      ) : null}

      <div className="wiz-grid">
        <DateField label={t('wiz.t.date')} hint={t('wiz.t.dateHint')} value={terms.date} onChange={(v) => onChange({ date: v })} max={today} />
        <NumberField
          label={t('wiz.t.principal')}
          prefix="৳"
          big
          value={terms.principal}
          onChange={(v) => onChange({ principal: v })}
          error={showErrors && !(principal > 0) ? t('wiz.t.errPrincipal') : undefined}
        />
      </div>

      <div className="quick-lend">
        <span className="quick-lend__label">{t('wiz.t.quick')}</span>
        {value > 0 ? (
          <>
            {quicks.map((p) => (
              <button key={p} type="button" className="chip-btn" onClick={() => lend(p)}>{t('wiz.t.quickOf', { p })}</button>
            ))}
            <button type="button" className="chip-btn chip-btn--gold" onClick={() => lend(maxLtv)}>
              {t('wiz.t.quickMax')} · {f.n(maxLtv)}%
            </button>
          </>
        ) : (
          <span className="muted small">{t('wiz.t.errValue')}</span>
        )}
      </div>

      {value > 0 && principal > 0 ? (
        <div className={cx('ltv', high && 'is-high')} role="status">
          <div className="ltv__bar" aria-hidden>
            <span className="ltv__fill" style={{ width: `${Math.min(100, ratio)}%` }} />
            <span className="ltv__limit" style={{ left: `${Math.min(100, maxLtv)}%` }} />
          </div>
          <p>
            <Scale size={16} aria-hidden />
            {high ? t('wiz.t.ltvHigh', { p: Math.round(ratio * 10) / 10, m: maxLtv }) : t('wiz.t.ltvOk', { p: Math.round(ratio * 10) / 10, m: maxLtv })}
          </p>
        </div>
      ) : null}

      <Field label={t('wiz.t.plan')} as="div">
        <div className="plan-grid" role="radiogroup" aria-label={t('wiz.t.plan')}>
          {plans.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={terms.planId === p.id} className={cx('plan', terms.planId === p.id && 'is-on')} onClick={() => onChange({ planId: p.id })}>
              <b className="serif-num plan__rate">{f.pct(p.rate)}</b>
              <span className="plan__name">{bi(p.name)}</span>
              {p.note ? <span className="plan__note">{bi(p.note)}</span> : null}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={terms.planId === 'custom'} className={cx('plan plan--custom', terms.planId === 'custom' && 'is-on')} onClick={() => onChange({ planId: 'custom', customRate: terms.customRate ?? rate ?? 5 })}>
            <b className="serif-num plan__rate">{terms.planId === 'custom' && terms.customRate != null ? f.pct(terms.customRate) : '—'}</b>
            <span className="plan__name">{t('wiz.t.custom')}</span>
            <span className="plan__note">{t('wiz.t.customHint')}</span>
          </button>
        </div>
      </Field>

      {terms.planId === 'custom' ? (
        <NumberField
          label={t('wiz.t.customLabel')}
          suffix="%"
          decimals={2}
          value={terms.customRate}
          onChange={(v) => onChange({ customRate: v })}
          error={showErrors && !(terms.customRate != null && terms.customRate > 0 && terms.customRate <= 15) ? t('err.rateInvalid') : undefined}
          className="narrow"
        />
      ) : null}

      <div className="wiz-grid">
        <Field label={t('wiz.t.term')} as="div">
          <Segmented<string>
            label={t('wiz.t.term')}
            value={preset}
            onChange={(v) => onChange({ term: v === 'other' ? (term && !TERM_PRESETS.includes(term) ? term : 18) : Number(v) })}
            items={[...TERM_PRESETS.map((n) => ({ id: String(n), label: f.digits(n) })), { id: 'other', label: t('wiz.t.termOther') }]}
          />
        </Field>
        {preset === 'other' ? (
          <NumberField
            label={t('wiz.t.termLabel')}
            suffix={t('common.months')}
            value={terms.term}
            onChange={(v) => onChange({ term: v })}
            error={showErrors && !termOk ? t('err.termInvalid') : undefined}
          />
        ) : null}
      </div>

      <TextAreaField label={t('wiz.t.notes')} optional={t('common.optional')} value={terms.notes} onChange={(v) => onChange({ notes: v })} rows={2} />

      <Card className="cost" flat sunken>
        <div className="cost__head">
          <CalendarClock size={18} aria-hidden />
          <b>{t('wiz.t.preview')}</b>
          {maturity ? <span>{t('wiz.t.matures')} <b>{f.date(maturity)}</b></span> : null}
        </div>
        <div className="cost__grid">
          <div>
            <span>{t('wiz.t.month1')}</span>
            <b className="serif-num"><Num value={month} kind="money" immediate duration={0.5} /></b>
          </div>
          <div>
            <span>{t('wiz.t.fullTerm')}</span>
            <b className="serif-num"><Num value={full} kind="money" immediate duration={0.5} /></b>
          </div>
          <div className="cost__total">
            <span>{t('wiz.t.totalDue')}</span>
            <b className="serif-num"><Num value={principal + full} kind="money" immediate duration={0.5} /></b>
          </div>
        </div>
        <div className="rule-note">
          <b>{t('wiz.t.ruleTitle')}</b>
          <span>{t('wiz.t.ruleBody', { g: policy.graceDays, m: policy.graceDays + 1 })}</span>
        </div>
      </Card>
    </div>
  );
}
