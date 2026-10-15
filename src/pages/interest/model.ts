import type { TFn } from '../../lib/i18n';
import { MONTH_DAYS, type InterestPolicy, type MonthRule } from '../../lib/interest';

/** The counting rule in words, built from the policy so it can never drift from what the engine does. */
export function ruleLines(t: TFn, p: InterestPolicy): string[] {
  const min = Math.max(1, p.minMonths);
  return [
    t('int.line.base'),
    t('int.line.min', { n: min }),
    p.graceDays <= 0 ? t('int.line.graceNone') : t('int.line.grace', { n: p.graceDays, m: p.graceDays + 1 }),
  ];
}

export const dayText = (t: TFn, n: number) => t('common.dayCount', { n });
export const monthText = (t: TFn, n: number) => t('common.monthCount', { n });

/** One sentence that says why a particular day count gives a particular month count. */
export function ruleSentence(t: TFn, fullMonths: number, extraDays: number, rule: MonthRule, grace: number): string {
  switch (rule) {
    case 'minimum':
      return t('int.scene.rule.minimum', { d: dayText(t, fullMonths * MONTH_DAYS + extraDays) });
    case 'exact':
      return t('int.scene.rule.exact', { m: monthText(t, fullMonths) });
    case 'grace':
      return t('int.scene.rule.grace', { m: monthText(t, fullMonths), e: dayText(t, extraDays), g: dayText(t, grace) });
    case 'threshold':
      return t('int.scene.rule.threshold', { m: monthText(t, fullMonths), e: dayText(t, extraDays), g: dayText(t, grace) });
    default:
      return '';
  }
}

/** Months and days in one phrase: "2 months and 4 days". */
export function heldText(t: TFn, fullMonths: number, extraDays: number): string {
  if (fullMonths > 0 && extraDays > 0) return t('int.try.heldBoth', { m: monthText(t, fullMonths), e: dayText(t, extraDays) });
  if (fullMonths > 0) return monthText(t, fullMonths);
  return dayText(t, extraDays);
}
