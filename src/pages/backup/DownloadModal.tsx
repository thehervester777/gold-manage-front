import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { Button, Switch, TextField } from '../../components/controls';
import { errorText, useT } from '../../lib/hooks';
import { useApp } from '../../lib/store';
import { toast } from '../../lib/ui';
import { cryptoSupported } from '../../lib/backup';

export interface DownloadTarget {
  /** Absent means the current data. */
  id?: string;
  /** Worded for the dialog subtitle. */
  from: string;
}

/** Saves a backup file, optionally locked with a password so a lost copy cannot be read. */
export function DownloadModal({ open, onClose, target }: { open: boolean; onClose: () => void; target: DownloadTarget | null }) {
  const t = useT();
  const download = useApp((s) => s.downloadBackup);
  const supported = cryptoSupported();
  const [protect, setProtect] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setProtect(false);
      setPw('');
      setPw2('');
      setTried(false);
      setBusy(false);
    }
  }, [open]);

  const shortPw = protect && pw.length < 8;
  const mismatch = protect && pw !== pw2;

  const submit = async () => {
    setTried(true);
    if (!target || shortPw || mismatch || busy) return;
    setBusy(true);
    try {
      const res = await download(target.id, protect ? pw : undefined);
      if (res === 'saved') {
        toast.success(t('bk.dl.saved'));
        onClose();
      } else if (res === 'unsupported') toast.error(t('rep.fail'));
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
      title={t('bk.dl.title')}
      subtitle={target?.from}
      width={520}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t('bk.dl.go')}</Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <p className="muted" style={{ margin: 0 }}>{t('bk.dl.sub')}</p>

        <div className={`bk-protect${protect ? ' is-on' : ''}`}>
          <div className="bk-protect__row">
            <span className="bk-protect__icon" aria-hidden="true"><Lock size={18} /></span>
            <div>
              <b>{t('bk.dl.protect')}</b>
              <span>{supported ? t('bk.dl.protectHint') : t('bk.dl.unsupported')}</span>
            </div>
            <Switch checked={protect} disabled={!supported} label={t('bk.dl.protect')} onChange={setProtect} />
          </div>
          <div className="bk-protect__fields" aria-hidden={!protect}>
            <div className="bk-protect__fields-in">
              <TextField
                label={t('bk.dl.password')}
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={setPw}
                disabled={!protect}
                error={tried && shortPw ? t('bk.dl.short') : undefined}
              />
              <TextField
                label={t('bk.dl.confirm')}
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={setPw2}
                disabled={!protect}
                error={tried && !shortPw && mismatch ? t('bk.dl.mismatch') : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
