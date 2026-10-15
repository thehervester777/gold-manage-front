import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ClipboardCheck, DatabaseBackup, Download, History, RotateCcw, ScrollText, ShieldAlert, ShieldCheck, ShieldX, Trash2, XCircle, ArrowLeftRight,
} from 'lucide-react';
import { Card, CardHead, EmptyState, PageHeader, Pager, rowDelay, usePaged } from '../../components/blocks';
import { Button, Chip, NumberField, Switch, type Tone } from '../../components/controls';
import { usePageFX } from '../../motion/fx';
import { useApp } from '../../lib/store';
import { errorText, useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { confirmDialog, toast } from '../../lib/ui';
import { relativeTime } from '../../lib/relTime';
import { countsOf, runRestoreTest, type BackupTest, type ParsedBackup } from '../../lib/backup';
import { localDateOf } from '../../lib/dates';
import type { BackupRecord } from '../../lib/types';
import type { TKey } from '../../lib/i18n';
import { cx } from '../../lib/cx';
import { posture, sizeText, type HeroState } from './model';
import { TestModal, type TestView } from './TestModal';
import { RestoreModal, type RestoreTarget } from './RestoreModal';
import { DownloadModal, type DownloadTarget } from './DownloadModal';
import { FileCard } from './FileCard';

/** Re-renders every so often so "5 minutes ago" keeps up with the clock. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const HERO: Record<HeroState, { icon: typeof ShieldCheck; tone: 'ok' | 'warn' | 'bad'; title: TKey; body: TKey; cta?: 'backup' | 'test' }> = {
  ok: { icon: ShieldCheck, tone: 'ok', title: 'bk.hero.ok', body: 'bk.hero.okBody' },
  none: { icon: ShieldAlert, tone: 'warn', title: 'bk.hero.none', body: 'bk.hero.noneBody', cta: 'backup' },
  old: { icon: ShieldAlert, tone: 'warn', title: 'bk.hero.old', body: 'bk.hero.oldBody', cta: 'backup' },
  untested: { icon: ShieldAlert, tone: 'warn', title: 'bk.hero.untested', body: 'bk.hero.untestedBody', cta: 'test' },
  due: { icon: ShieldAlert, tone: 'warn', title: 'bk.hero.due', body: 'bk.hero.dueBody', cta: 'test' },
  failed: { icon: ShieldX, tone: 'bad', title: 'bk.hero.failed', body: 'bk.hero.failedBody', cta: 'backup' },
};

const KIND_TONE: Record<BackupRecord['kind'], Tone> = { manual: 'gold', auto: 'neutral', pre_restore: 'info' };

export function Backup() {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const now = useNow();
  const ref = usePageFX();
  const storage = useApp((s) => s.storage);
  const createBackup = useApp((s) => s.createBackup);
  const verifyBackup = useApp((s) => s.verifyBackup);
  const restoreBackup = useApp((s) => s.restoreBackup);
  const restoreData = useApp((s) => s.restoreData);
  const deleteBackup = useApp((s) => s.deleteBackup);
  const saveBackupSettings = useApp((s) => s.saveBackupSettings);

  const backup = db.settings.backup;
  const list = useMemo(() => [...db.backups].sort((a, b) => b.at.localeCompare(a.at)), [db.backups]);
  const post = useMemo(() => posture(db.backups, today), [db.backups, today]);
  const paged = usePaged(list, 8);

  const [making, setMaking] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testView, setTestView] = useState<TestView | null>(null);
  const [testRestore, setTestRestore] = useState<(() => void) | undefined>();
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlTarget, setDlTarget] = useState<DownloadTarget | null>(null);
  const [keep, setKeep] = useState<number | null>(backup.keep);

  useEffect(() => setKeep(backup.keep), [backup.keep]);

  const when = (b: BackupRecord) => f.dateTime(b.at);

  // ---- make a backup -----------------------------------------------------------
  const backUpNow = async () => {
    if (making) return;
    setMaking(true);
    try {
      const rec = await createBackup('manual');
      toast.success(t('bk.made.title'), t('bk.made.body', { c: rec.counts.customers, l: rec.counts.loans, r: rec.counts.receipts }));
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setMaking(false);
    }
  };

  // ---- restore ----------------------------------------------------------------------
  const askRestore = (target: RestoreTarget) => {
    setRestoreTarget(target);
    setRestoreOpen(true);
  };
  const restoreRecord = (b: BackupRecord) =>
    askRestore({ source: t('bk.src.backup', { when: when(b) }), now: countsOf(db), after: b.counts, run: () => restoreBackup(b.id) });
  const restoreFile = (name: string, parsed: Extract<ParsedBackup, { ok: true }>) =>
    askRestore({ source: t('bk.src.file', { name }), now: countsOf(db), after: parsed.counts, run: () => restoreData(parsed.data, name.slice(0, 40)) });

  // ---- restore tests -------------------------------------------------------------------
  const showTest = (heading: string, run: () => Promise<BackupTest> | BackupTest, onRestore?: () => void) => {
    setTestView({ heading, running: true, result: null });
    setTestRestore(onRestore ? () => onRestore : undefined);
    setTestOpen(true);
    // a short pause so the checks read as work being done rather than a flash
    Promise.all([Promise.resolve().then(run), new Promise((r) => setTimeout(r, 700))])
      .then(([result]) => setTestView({ heading, running: false, result }))
      .catch((e) => {
        setTestOpen(false);
        toast.error(errorText(t, e));
      });
  };
  const testRecord = (b: BackupRecord) =>
    showTest(t('bk.t.forBackup', { when: when(b) }), () => verifyBackup(b.id), () => {
      setTestOpen(false);
      restoreRecord(b);
    });
  const testFile = (name: string, text: string, parsed: Extract<ParsedBackup, { ok: true }>) =>
    showTest(
      t('bk.t.forFile', { name }),
      () => runRestoreTest({ text, expect: parsed.recorded, file: { integrity: parsed.integrity, checksum: parsed.checksum } }),
      () => {
        setTestOpen(false);
        restoreFile(name, parsed);
      },
    );

  // ---- delete ---------------------------------------------------------------------------
  const remove = async (b: BackupRecord) => {
    const ok = await confirmDialog({
      title: t('bk.del.title'),
      body: t('bk.del.body', { when: when(b) }),
      confirmLabel: t('bk.del.confirm'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteBackup(b.id);
      toast.success(t('bk.del.done'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  // ---- automatic backup options --------------------------------------------------------------
  const saveAuto = (patch: Partial<typeof backup>) => {
    try {
      saveBackupSettings(patch);
      toast.success(t('bk.auto.saved'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };
  const keepValid = keep !== null && keep >= 1 && keep <= 30;
  const keepDirty = keep !== backup.keep;

  // ---- status card ---------------------------------------------------------------------------------
  const hero = HERO[post.state];
  const Icon = hero.icon;
  const heroWhen = post.state === 'due' && post.tested?.verifiedAt ? relativeTime(post.tested.verifiedAt, now, t) : post.last ? relativeTime(post.last.at, now, t) : '';
  const lastTest = post.tested;

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('nav.backup')}
        subtitle={t('bk.subtitle')}
        actions={
          <>
            <Button variant="secondary" icon={<Download size={18} />} onClick={() => { setDlTarget({ from: t('bk.dl.from.live') }); setDlOpen(true); }}>
              {t('bk.downloadCopy')}
            </Button>
            <Button variant="primary" icon={<DatabaseBackup size={18} />} loading={making} onClick={() => void backUpNow()} magnetic>
              {t('bk.backupNow')}
            </Button>
          </>
        }
      />

      <section className={cx('bk-hero', `is-${hero.tone}`)} data-fx="scale" aria-live="polite">
        <span className="bk-hero__glow" aria-hidden="true" />
        <div className="bk-hero__main">
          <span className="bk-hero__seal" aria-hidden="true"><Icon size={30} /></span>
          <div className="bk-hero__text">
            <h2>{t(hero.title)}</h2>
            <p>{t(hero.body, { when: heroWhen })}</p>
            {hero.cta === 'test' && post.last ? (
              <Button variant="primary" size="sm" icon={<ClipboardCheck size={16} />} onClick={() => testRecord(post.last!)}>{t('bk.act.test')}</Button>
            ) : null}
            {hero.cta === 'backup' ? (
              <Button variant="primary" size="sm" icon={<DatabaseBackup size={16} />} loading={making} onClick={() => void backUpNow()}>{t('bk.backupNow')}</Button>
            ) : null}
          </div>
        </div>
        <dl className="bk-hero__facts">
          <div>
            <dt>{t('bk.fact.last')}</dt>
            <dd>{post.last ? relativeTime(post.last.at, now, t) : t('bk.never')}</dd>
            {post.last ? <small>{f.dateTime(post.last.at)}</small> : null}
          </div>
          <div>
            <dt>{t('bk.fact.test')}</dt>
            <dd className={lastTest ? (lastTest.verifiedOk ? 'is-ok' : 'is-bad') : undefined}>
              {lastTest?.verifiedAt ? t(lastTest.verifiedOk ? 'bk.fact.passed' : 'bk.fact.failed', { when: relativeTime(lastTest.verifiedAt, now, t) }) : t('bk.never')}
            </dd>
            {lastTest?.verifiedAt ? <small>{f.dateTime(lastTest.verifiedAt)}</small> : null}
          </div>
          <div>
            <dt>{t('bk.fact.auto')}</dt>
            <dd>{backup.autoDaily ? t('bk.fact.autoOn', { n: backup.keep }) : t('bk.fact.autoOff')}</dd>
          </div>
          <div>
            <dt>{t('bk.fact.where')}</dt>
            <dd>{t(`bk.where.${storage}` as TKey)}</dd>
          </div>
        </dl>
      </section>

      <div className="bk-grid">
        <Card className="list-card bk-list" data-fx="rise">
          <CardHead title={t('bk.list.title')} sub={t('bk.list.sub')} />
          {list.length === 0 ? (
            <EmptyState
              compact
              title={t('bk.empty.title')}
              body={t('bk.empty.body')}
              action={<Button variant="primary" icon={<DatabaseBackup size={18} />} loading={making} onClick={() => void backUpNow()}>{t('bk.backupNow')}</Button>}
            />
          ) : (
            <>
              <div className="tbl-wrap">
                <table className="tbl tbl--stack">
                  <thead>
                    <tr>
                      <th>{t('bk.col.made')}</th>
                      <th>{t('bk.col.type')}</th>
                      <th className="hide-md">{t('bk.col.contents')}</th>
                      <th>{t('bk.col.test')}</th>
                      <th aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody key={paged.page}>
                    {paged.slice.map((b, i) => {
                      const tested = !!b.verifiedAt;
                      const label = when(b);
                      return (
                        <tr key={b.id} className="row-in" style={rowDelay(i)}>
                          <td>
                            <div className="cell-main">
                              <b>{label}</b>
                              <span>{relativeTime(b.at, now, t)}</span>
                            </div>
                          </td>
                          <td data-label={t('bk.col.type')}><Chip tone={KIND_TONE[b.kind]} plain>{t(`bk.kind.${b.kind}` as TKey)}</Chip></td>
                          <td className="hide-md" data-label={t('bk.col.contents')}>
                            <div className="cell-main">
                              <span className="bk-contents">{t('bk.contents', { c: b.counts.customers, l: b.counts.loans, r: b.counts.receipts })}</span>
                              <span>{t('bk.by', { name: b.by, size: sizeText(b.sizeBytes, f, t) })}</span>
                            </div>
                          </td>
                          <td data-label={t('bk.col.test')}>
                            {tested ? (
                              <div className="bk-testcell">
                                <Chip tone={b.verifiedOk ? 'ok' : 'danger'} plain>
                                  {b.verifiedOk ? <CheckCircle2 size={13} aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}
                                  {t(b.verifiedOk ? 'bk.test.passed' : 'bk.test.failed')}
                                </Chip>
                                <small>{f.date(localDateOf(b.verifiedAt!))}</small>
                              </div>
                            ) : (
                              <Chip plain>{t('bk.test.none')}</Chip>
                            )}
                          </td>
                          <td className="bk-actions">
                            <div className="bk-actions__in">
                              <Button size="sm" variant="soft" icon={<ClipboardCheck size={15} />} aria-label={t('bk.act.testRow', { when: label })} onClick={() => testRecord(b)}>
                                {t('bk.act.test')}
                              </Button>
                              <Button size="sm" variant="outline-danger" icon={<RotateCcw size={15} />} aria-label={t('bk.act.restoreRow', { when: label })} onClick={() => restoreRecord(b)}>
                                {t('bk.act.restore')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Download size={16} />}
                                aria-label={t('bk.act.downloadRow', { when: label })}
                                title={t('bk.act.download')}
                                onClick={() => {
                                  setDlTarget({ id: b.id, from: t('bk.dl.from.rec', { when: label }) });
                                  setDlOpen(true);
                                }}
                              />
                              <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} aria-label={t('bk.act.deleteRow', { when: label })} title={t('bk.act.delete')} onClick={() => void remove(b)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager paged={paged} />
            </>
          )}
          <p className="tbl-foot-note">{t('bk.list.note')}</p>
        </Card>

        <div className="bk-side">
          <Card className="bk-auto" data-fx="rise">
            <CardHead title={t('bk.auto.title')} sub={t('bk.auto.sub')} />
            <div className="card__body bk-auto__body">
              <label className="bk-auto__row">
                <span>{t('bk.auto.switch')}</span>
                <Switch checked={backup.autoDaily} label={t('bk.auto.switch')} onChange={(on) => saveAuto({ autoDaily: on })} />
              </label>
              <NumberField
                label={t('bk.auto.keep')}
                hint={t('bk.auto.keepHint')}
                error={keep !== null && !keepValid ? t('bk.auto.keepInvalid') : undefined}
                value={keep}
                onChange={setKeep}
                disabled={!backup.autoDaily}
              />
              <div className="bk-auto__save">
                <Button variant="secondary" size="sm" disabled={!keepDirty || !keepValid} onClick={() => saveAuto({ keep: keep ?? backup.keep })}>
                  {t('common.save')}
                </Button>
              </div>
            </div>
          </Card>

          <FileCard onTest={testFile} onRestore={restoreFile} />
        </div>
      </div>

      <Card className="bk-how" data-fx="rise" data-scroll-section>
        <CardHead title={t('bk.how.title')} sub={t('bk.how.sub')} />
        <ol className="bk-how__steps">
          <span className="bk-how__rail" aria-hidden="true"><i data-scroll-fill /></span>
          {[
            { icon: History, key: '1' },
            { icon: ArrowLeftRight, key: '2' },
            { icon: ScrollText, key: '3' },
          ].map(({ icon: StepIcon, key }) => (
            <li key={key}>
              <span className="bk-how__dot" aria-hidden="true"><StepIcon size={18} /></span>
              <div>
                <b>{t(`bk.how.${key}.t` as TKey)}</b>
                <span>{t(`bk.how.${key}.b` as TKey)}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <TestModal open={testOpen} onClose={() => setTestOpen(false)} view={testView} onRestore={testRestore} />
      <RestoreModal open={restoreOpen} onClose={() => setRestoreOpen(false)} target={restoreTarget} />
      <DownloadModal open={dlOpen} onClose={() => setDlOpen(false)} target={dlTarget} />
    </div>
  );
}
