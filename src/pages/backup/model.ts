import type { BackupRecord } from '../../lib/types';
import { type ISODate, diffDays, localDateOf } from '../../lib/dates';
import type { Fmt } from '../../lib/format';
import type { TFn } from '../../lib/i18n';

export type HeroState = 'ok' | 'none' | 'old' | 'untested' | 'due' | 'failed';

export const TEST_EVERY_DAYS = 30;

export interface Posture {
  state: HeroState;
  last?: BackupRecord;
  /** The most recently tested backup. */
  tested?: BackupRecord;
}

const newest = (xs: BackupRecord[], key: (b: BackupRecord) => string) => [...xs].sort((a, b) => key(b).localeCompare(key(a)))[0];

/** How well protected the records are today, from the most pressing problem down. */
export function posture(backups: BackupRecord[], today: ISODate): Posture {
  const last = newest(backups, (b) => b.at);
  const tested = newest(backups.filter((b) => b.verifiedAt), (b) => b.verifiedAt ?? '');
  if (!last) return { state: 'none' };
  if (tested && tested.verifiedOk === false) return { state: 'failed', last, tested };
  if (diffDays(localDateOf(last.at), today) > 1) return { state: 'old', last, tested };
  if (!tested) return { state: 'untested', last };
  if (diffDays(localDateOf(tested.verifiedAt!), today) > TEST_EVERY_DAYS) return { state: 'due', last, tested };
  return { state: 'ok', last, tested };
}

export const recordCount = (c: BackupRecord['counts']) => c.customers + c.loans + c.items + c.payments + c.receipts;

/** 416.6 KB or 1.2 MB, in the viewer's digits. */
export function sizeText(bytes: number, f: Fmt, t: TFn): string {
  return bytes >= 1024 * 1024 ? t('bk.mb', { n: f.n(bytes / 1024 / 1024, 1) }) : t('bk.kb', { n: f.n(bytes / 1024, 1) });
}
