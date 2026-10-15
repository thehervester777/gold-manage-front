import type { TFn } from './i18n';

/** "3 hours ago" in the viewer's language. */
export function relativeTime(stamp: string, nowMs: number, t: TFn): string {
  const ms = Date.parse(stamp);
  if (Number.isNaN(ms)) return '';
  const mins = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutes', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('time.hours', { n: hours });
  return t('time.days', { n: Math.round(hours / 24) });
}
