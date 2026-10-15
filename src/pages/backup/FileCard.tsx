import { useRef, useState, type DragEvent } from 'react';
import { FileCheck2, FileWarning, FileUp, Lock } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Button, Chip, TextField } from '../../components/controls';
import { useFmt, useT } from '../../lib/hooks';
import { decryptBackup, parseBackup, type ParsedBackup } from '../../lib/backup';
import type { TKey } from '../../lib/i18n';
import { cx } from '../../lib/cx';

type Ok = Extract<ParsedBackup, { ok: true }>;

export type Stage =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'locked'; name: string; text: string }
  | { kind: 'ready'; name: string; text: string; parsed: Ok }
  | { kind: 'error'; name: string; key: TKey };

const MAX_BYTES = 80 * 1024 * 1024;

/** Pick or drop a backup file, unlock it if it has a password, and see what it holds before using it. */
export function FileCard({ onTest, onRestore }: { onTest: (name: string, text: string, parsed: Ok) => void; onRestore: (name: string, parsed: Ok) => void }) {
  const t = useT();
  const f = useFmt();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [over, setOver] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState<TKey | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const inspect = (name: string, text: string) => {
    const parsed = parseBackup(text);
    if (parsed.ok) return setStage({ kind: 'ready', name, text, parsed });
    if (parsed.reason === 'encrypted') {
      setPw('');
      setPwError(null);
      return setStage({ kind: 'locked', name, text });
    }
    const key: TKey = parsed.reason === 'version' ? 'err.backupVersion' : parsed.reason === 'structure' ? 'err.backupStructure' : 'err.backupFormat';
    setStage({ kind: 'error', name, key });
  };

  const take = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setStage({ kind: 'error', name: file.name, key: 'err.backupFormat' });
    setStage({ kind: 'reading', name: file.name });
    try {
      inspect(file.name, await file.text());
    } catch {
      setStage({ kind: 'error', name: file.name, key: 'err.backupRead' });
    }
  };

  const unlock = async () => {
    if (stage.kind !== 'locked' || unlocking) return;
    setUnlocking(true);
    setPwError(null);
    try {
      const plain = await decryptBackup(stage.text, pw);
      inspect(stage.name, plain);
    } catch (e) {
      const code = (e as Error).message;
      setPwError(code === 'password' ? 'err.backupPassword' : code === 'unsupported' ? 'err.backupNoCrypto' : 'err.backupFormat');
    } finally {
      setUnlocking(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void take(e.dataTransfer.files?.[0]);
  };

  const pick = () => input.current?.click();
  const reset = () => {
    setStage({ kind: 'idle' });
    if (input.current) input.current.value = '';
  };

  const when = (p: Ok) => (p.createdAt ? f.dateTime(p.createdAt) : t('bk.file.noDate'));

  return (
    <Card className="bk-file" data-fx="rise">
      <CardHead title={t('bk.file.title')} sub={t('bk.file.sub')} />
      <div className="card__body bk-file__body">
        <input ref={input} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} onChange={(e) => void take(e.target.files?.[0])} />

        {stage.kind === 'idle' || stage.kind === 'reading' ? (
          <div
            className={cx('bk-drop', over && 'is-over')}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span className="bk-drop__icon" aria-hidden="true"><FileUp size={22} /></span>
            <b>{stage.kind === 'reading' ? t('bk.file.reading') : t('bk.file.drop')}</b>
            <span className="muted">{t('bk.file.or')}</span>
            <Button variant="secondary" size="sm" onClick={pick} loading={stage.kind === 'reading'}>{t('bk.file.choose')}</Button>
          </div>
        ) : null}

        {stage.kind === 'locked' ? (
          <form
            className="bk-pick"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <div className="bk-pick__head">
              <span className="bk-pick__icon" aria-hidden="true"><Lock size={18} /></span>
              <div>
                <b>{t('bk.file.locked')}</b>
                <span className="mono truncate">{stage.name}</span>
              </div>
            </div>
            <TextField
              label={t('bk.file.password')}
              type="password"
              autoComplete="off"
              value={pw}
              onChange={(v) => {
                setPw(v);
                setPwError(null);
              }}
              error={pwError ? t(pwError) : undefined}
              autoFocus
            />
            <div className="bk-pick__actions">
              <Button variant="ghost" onClick={reset}>{t('bk.file.another')}</Button>
              <Button type="submit" variant="primary" loading={unlocking} disabled={!pw}>{t('bk.file.unlock')}</Button>
            </div>
          </form>
        ) : null}

        {stage.kind === 'error' ? (
          <div className="bk-pick is-bad" role="alert">
            <div className="bk-pick__head">
              <span className="bk-pick__icon" aria-hidden="true"><FileWarning size={18} /></span>
              <div>
                <b>{t(stage.key)}</b>
                <span className="mono truncate">{stage.name}</span>
              </div>
            </div>
            <div className="bk-pick__actions">
              <Button variant="secondary" onClick={() => { reset(); pick(); }}>{t('bk.file.another')}</Button>
            </div>
          </div>
        ) : null}

        {stage.kind === 'ready' ? (
          <div className={cx('bk-pick', stage.parsed.integrity === 'bad' && 'is-bad')}>
            <div className="bk-pick__head">
              <span className="bk-pick__icon" aria-hidden="true">{stage.parsed.integrity === 'bad' ? <FileWarning size={18} /> : <FileCheck2 size={18} />}</span>
              <div>
                <b className="truncate">{stage.name}</b>
                <span>{t('bk.file.made', { when: when(stage.parsed) })}</span>
              </div>
              {stage.parsed.integrity === 'bad' ? <Chip tone="danger" plain>{t('bk.test.failed')}</Chip> : stage.parsed.integrity === 'ok' ? <Chip tone="ok" plain>{t('bk.file.intact')}</Chip> : null}
            </div>
            <p className="bk-pick__contents">
              {t('bk.contents', { c: stage.parsed.counts.customers, l: stage.parsed.counts.loans, r: stage.parsed.counts.receipts })}
            </p>
            {stage.parsed.integrity === 'bad' ? <p className="bk-pick__warn">{t('bk.file.damaged')}</p> : null}
            <div className="bk-pick__actions">
              <Button variant="ghost" onClick={reset}>{t('bk.file.another')}</Button>
              <Button variant="secondary" onClick={() => onTest(stage.name, stage.text, stage.parsed)}>{t('bk.file.test')}</Button>
              <Button variant="outline-danger" disabled={stage.parsed.integrity === 'bad'} onClick={() => onRestore(stage.name, stage.parsed)}>{t('bk.file.restore')}</Button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
