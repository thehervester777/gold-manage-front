import { useEffect, useState } from 'react';
import { ArrowRight, History, Info, UsersRound } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { Button, CheckBox } from '../../components/controls';
import { errorText, useFmt, useT } from '../../lib/hooks';
import { toast } from '../../lib/ui';
import type { BackupCounts } from '../../lib/backup';
import type { TKey } from '../../lib/i18n';

const KINDS: (keyof BackupCounts)[] = ['customers', 'loans', 'items', 'payments', 'receipts'];

export interface RestoreTarget {
  /** Worded for a sentence: "the backup from 12 Oct" or "the file backup.json". */
  source: string;
  now: BackupCounts;
  after: BackupCounts;
  run: () => Promise<void>;
}

/** The last stop before data is replaced: what changes, what is kept, and one deliberate click. */
export function RestoreModal({ open, onClose, target }: { open: boolean; onClose: () => void; target: RestoreTarget | null }) {
  const t = useT();
  const f = useFmt();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAck(false);
      setBusy(false);
    }
  }, [open]);

  const go = async () => {
    if (!target || !ack || busy) return;
    setBusy(true);
    try {
      await target.run();
      toast.success(t('bk.r.done'), t('bk.r.doneBody', { source: target.source }));
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      dismissable={!busy}
      title={t('bk.r.title')}
      subtitle={t('bk.r.sub')}
      width={580}
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="submit" variant="danger" disabled={!ack} loading={busy}>{t('bk.r.go')}</Button>
        </>
      }
    >
      {target ? (
        <div className="stack" style={{ gap: 18 }}>
          <table className="bk-diff">
            <thead>
              <tr>
                <th />
                <th>{t('bk.r.now')}</th>
                <th aria-hidden="true" />
                <th>{t('bk.r.after')}</th>
              </tr>
            </thead>
            <tbody>
              {KINDS.map((k) => {
                const a = target.now[k];
                const b = target.after[k];
                return (
                  <tr key={k} className={a === b ? undefined : 'is-changed'}>
                    <th scope="row">{t(`bk.n.${k}` as TKey)}</th>
                    <td>{f.n(a)}</td>
                    <td aria-hidden="true"><ArrowRight size={14} /></td>
                    <td><b>{f.n(b)}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="bk-notes">
            <li><History size={17} aria-hidden="true" /><span>{t('bk.r.safety')}</span></li>
            <li><Info size={17} aria-hidden="true" /><span>{t('bk.r.lose')}</span></li>
            <li><UsersRound size={17} aria-hidden="true" /><span>{t('bk.r.users')}</span></li>
          </ul>

          <CheckBox checked={ack} onChange={setAck}>{t('bk.r.ack')}</CheckBox>
        </div>
      ) : null}
    </Modal>
  );
}
