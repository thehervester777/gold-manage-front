import { useState, type ReactNode } from 'react';
import { ArchiveRestore, DatabaseBackup, Eraser, FlaskConical, HardDrive, RotateCcw } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Button, ButtonLink, Chip } from '../../components/controls';
import { useApp } from '../../lib/store';
import { errorText, useAction, useCan, useDb, useFmt, useT } from '../../lib/hooks';
import { confirmDialog, toast } from '../../lib/ui';
import type { TKey } from '../../lib/i18n';
import { cx } from '../../lib/cx';

type Busy = 'clear' | 'load' | 'reset' | null;

function Tool({ icon, title, body, children, danger }: { icon: ReactNode; title: string; body: string; children: ReactNode; danger?: boolean }) {
  return (
    <li className={cx('set-tool', danger && 'is-danger')}>
      <span className="set-tool__icon" aria-hidden="true">{icon}</span>
      <div className="set-tool__text">
        <b>{title}</b>
        <p>{body}</p>
      </div>
      <div className="set-tool__act">{children}</div>
    </li>
  );
}

/** What the system holds and where, plus the demo's tools for sample records. */
export function DataSection() {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const storage = useApp((s) => s.storage);
  const clearSample = useApp((s) => s.clearSampleData);
  const loadSample = useApp((s) => s.loadSampleData);
  const factoryReset = useApp((s) => s.factoryReset);
  const canBackup = useCan('backup.manage');
  const act = useAction();
  const [busy, setBusy] = useState<Busy>(null);

  const demo = db.meta.demo;
  const counts: { key: TKey; n: number }[] = [
    { key: 'nav.customers', n: db.customers.length },
    { key: 'nav.loans', n: db.loans.length },
    { key: 'nav.vault', n: db.items.length },
    { key: 'nav.payments', n: db.payments.length },
    { key: 'nav.receipts', n: db.receipts.length },
    { key: 'nav.audit', n: db.audit.length },
    { key: 'set.data.users', n: db.users.length },
  ];

  const where: Record<typeof storage, { tone: 'ok' | 'warn' | 'danger'; key: TKey }> = {
    idb: { tone: 'ok', key: 'set.data.where.idb' },
    local: { tone: 'warn', key: 'set.data.where.local' },
    memory: { tone: 'danger', key: 'set.data.where.memory' },
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: t('set.data.clear.confirmTitle'),
      body: t('set.data.clear.confirmBody'),
      confirmLabel: t('set.data.clear.confirm'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('clear');
    act(() => {
      clearSample();
      toast.success(t('set.data.clear.done'), t('set.data.clear.doneBody'));
    })();
    setBusy(null);
  };

  const load = async () => {
    const ok = await confirmDialog({
      title: t('set.data.load.confirmTitle'),
      body: t('set.data.load.confirmBody'),
      confirmLabel: t('set.data.load.confirm'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('load');
    try {
      await loadSample();
      toast.success(t('set.data.load.done'), t('set.data.load.doneBody'));
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: t('set.data.reset.confirmTitle'),
      body: t('set.data.reset.confirmBody'),
      confirmLabel: t('set.data.reset.confirm'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
      requireText: 'RESET',
    });
    if (!ok) return;
    setBusy('reset');
    try {
      await factoryReset();
      toast.success(t('set.data.reset.done'), t('set.data.reset.doneBody'));
    } catch (e) {
      toast.error(errorText(t, e));
      setBusy(null);
    }
  };

  return (
    <Card id="set-data" className="set-card" data-fx="rise" aria-labelledby="set-data-h">
      <CardHead id="set-data-h" title={t('set.data.title')} sub={t('set.data.sub')} actions={<Chip tone={demo ? 'gold' : 'ok'} plain>{demo ? t('set.data.state.demo') : t('set.data.state.live')}</Chip>} />
      <div className="card__body set-body">
        <dl className="set-counts">
          {counts.map((c) => (
            <div key={c.key}>
              <dd className="serif-num">{f.n(c.n)}</dd>
              <dt>{t(c.key)}</dt>
            </div>
          ))}
        </dl>

        <p className={cx('set-where', `is-${where[storage].tone}`)}>
          <HardDrive size={17} aria-hidden="true" />
          <span>
            <b>{t('set.data.where')}</b> {t(where[storage].key)}
          </span>
        </p>

        <ul className="set-tools">
          <Tool icon={<Eraser size={19} />} title={t('set.data.clear.title')} body={t('set.data.clear.body')}>
            <Button variant="outline-danger" onClick={() => void remove()} loading={busy === 'clear'} disabled={!demo || busy !== null}>
              {t('set.data.clear.button')}
            </Button>
          </Tool>
          <Tool icon={<FlaskConical size={19} />} title={t('set.data.load.title')} body={t('set.data.load.body')}>
            <Button variant="secondary" onClick={() => void load()} loading={busy === 'load'} disabled={busy !== null}>
              {demo ? t('set.data.load.again') : t('set.data.load.button')}
            </Button>
          </Tool>
          <Tool danger icon={<RotateCcw size={19} />} title={t('set.data.reset.title')} body={t('set.data.reset.body')}>
            <Button variant="danger" onClick={() => void reset()} loading={busy === 'reset'} disabled={busy !== null}>
              {t('set.data.reset.button')}
            </Button>
          </Tool>
        </ul>

        {canBackup ? (
          <div className="set-backup">
            <ArchiveRestore size={19} aria-hidden="true" />
            <p>{t('set.data.backupHint')}</p>
            <ButtonLink to="/backup" variant="secondary" size="sm" icon={<DatabaseBackup size={15} />}>
              {t('set.data.backupLink')}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
