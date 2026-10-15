import { CheckCircle2, Loader2, MinusCircle, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { Modal } from '../../components/overlays';
import { Button } from '../../components/controls';
import { useFmt, useT } from '../../lib/hooks';
import type { BackupCheck, BackupTest, CheckId } from '../../lib/backup';
import type { TKey } from '../../lib/i18n';

export interface TestView {
  /** What is being tested, for example "Backup from 12 Oct, 4:20 pm". */
  heading: string;
  running: boolean;
  result: BackupTest | null;
}

const ORDER: CheckId[] = ['stored', 'unchanged', 'readable', 'counts', 'balances'];

/** Shows the checks of a restore test one after another, then the verdict. */
export function TestModal({ open, onClose, view, onRestore }: { open: boolean; onClose: () => void; view: TestView | null; onRestore?: () => void }) {
  const t = useT();
  const f = useFmt();
  const result = view?.result ?? null;

  const byId = new Map<CheckId, BackupCheck>((result?.checks ?? []).map((c) => [c.id, c]));

  const detail = (id: CheckId, c: BackupCheck | undefined): string | null => {
    if (!result || !c) return null;
    const key = (k: string) => `bk.chk.${id}.${k}` as TKey;
    switch (id) {
      case 'stored':
        return c.ok ? null : t(key('bad'));
      case 'unchanged':
        if (!c.ok) return t(key('bad'));
        return result.checksum && !c.skipped ? t(key('ok'), { sum: result.checksum.slice(0, 12) }) : null;
      case 'readable': {
        if (!c.ok) return t(key('bad'));
        const n = result.counts;
        return n ? t(key('ok'), { c: n.customers, l: n.loans, i: n.items, p: n.payments, r: n.receipts }) : null;
      }
      case 'counts':
        return t(key(c.skipped ? 'skip' : c.ok ? 'ok' : 'bad'));
      case 'balances': {
        if (!c.ok) return t(key('bad'));
        const tt = result.totals;
        if (!tt) return null;
        return t(key(c.skipped ? 'skip' : 'ok'), { p: f.money(tt.principal), i: f.money(tt.interest), date: f.date(tt.asOf) });
      }
    }
  };

  const pass = !!result?.ok;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bk.t.title')}
      subtitle={view?.heading ?? t('bk.t.sub')}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          {pass && onRestore ? <Button variant="outline-danger" onClick={onRestore}>{t('bk.t.restoreThis')}</Button> : null}
        </>
      }
    >
      <p className="muted bk-t__sub">{t('bk.t.sub')}</p>
      <ol className="bk-checks" aria-live="polite" aria-busy={view?.running ?? false}>
        {ORDER.map((id, i) => {
          const c = byId.get(id);
          const state = !result ? 'pending' : !c || c.skipped ? (c && !c.ok ? 'bad' : 'skip') : c.ok ? 'ok' : 'bad';
          const text = detail(id, c);
          return (
            <li key={id} className="bk-check" data-state={state} style={{ ['--i' as string]: i }}>
              <span className="bk-check__icon" aria-hidden="true">
                <Loader2 size={20} className="bk-check__spin spin" />
                <CheckCircle2 size={22} className="bk-check__ok" />
                <MinusCircle size={22} className="bk-check__skip" />
                <XCircle size={22} className="bk-check__bad" />
              </span>
              <div className="bk-check__text">
                <b>{t(`bk.chk.${id}` as TKey)}</b>
                {text ? <span>{text}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {result ? (
        <div className={`bk-verdict ${pass ? 'is-pass' : 'is-fail'}`} style={{ ['--i' as string]: ORDER.length }} role="status">
          {pass ? <ShieldCheck size={26} aria-hidden="true" /> : <ShieldAlert size={26} aria-hidden="true" />}
          <div>
            <b>{t(pass ? 'bk.t.pass' : 'bk.t.fail')}</b>
            <span>{t(pass ? 'bk.t.passBody' : 'bk.t.failBody')}</span>
          </div>
        </div>
      ) : (
        <p className="bk-t__running muted">{t('bk.t.running')}</p>
      )}
    </Modal>
  );
}
