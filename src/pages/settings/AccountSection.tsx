import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Avatar, Card, CardHead } from '../../components/blocks';
import { Button, Chip, TextField } from '../../components/controls';
import { useApp } from '../../lib/store';
import { errorText, useBi, useFmt, useRole, useT, useUser } from '../../lib/hooks';
import { AppError } from '../../lib/domain';
import { toast } from '../../lib/ui';
import type { TKey } from '../../lib/i18n';
import { cx } from '../../lib/cx';
import { passwordStrength } from './model';

const LEVEL_KEY: Record<1 | 2 | 3, TKey> = { 1: 'set.pw.s1', 2: 'set.pw.s2', 3: 'set.pw.s3' };

/** Who is signed in, and a way to change their own password. */
export function AccountSection() {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const user = useUser();
  const role = useRole();
  const change = useApp((s) => s.changeOwnPassword);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ current?: TKey; next?: TKey; again?: TKey }>({});
  const [busy, setBusy] = useState(false);

  const level = passwordStrength(next);
  const ready = current !== '' && next !== '' && again !== '';

  const submit = () => {
    const e: typeof errors = {};
    if (next.length < 6) e.next = 'err.passwordShort';
    else if (next === current) e.next = 'set.pw.same';
    if (again !== next) e.again = 'set.pw.mismatch';
    setErrors(e);
    if (e.next || e.again) return;
    setBusy(true);
    try {
      change(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      toast.success(t('set.pw.done'), t('set.pw.doneBody'));
    } catch (err) {
      if (err instanceof AppError && err.key === 'err.passwordWrong') setErrors({ current: 'err.passwordWrong' });
      else toast.error(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="set-account" className="set-card" data-fx="rise" aria-labelledby="set-account-h">
      <CardHead id="set-account-h" title={t('set.acc.title')} sub={t('set.acc.sub')} />
      <div className="card__body set-body">
        <div className="set-me">
          <Avatar name={user.name} size="xl" />
          <div className="set-me__text">
            <b>{user.name}</b>
            <span className="row row--wrap" style={{ gap: 8 }}>
              {role ? <Chip tone="gold">{bi(role.name)}</Chip> : null}
              <span className="mono muted">@{user.username}</span>
            </span>
            {user.lastLoginAt ? <small>{t('set.acc.signedIn', { when: f.dateTime(user.lastLoginAt) })}</small> : null}
          </div>
        </div>

        <form
          className="set-pw"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <h3 className="set-sub">
            <KeyRound size={17} aria-hidden="true" />
            {t('set.pw.title')}
          </h3>
          {/* lets a password manager tie the new password to this username */}
          <input className="sr-only" type="text" name="username" value={user.username} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" />
          <div className="set-pw__grid">
            <TextField
              className="set-pw__cur"
              label={t('set.pw.current')}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setErrors((x) => ({ ...x, current: undefined }));
              }}
              error={errors.current ? t(errors.current) : undefined}
            />
            <div className="set-pw__new">
              <TextField
                label={t('set.pw.new')}
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(v) => {
                  setNext(v);
                  setErrors((x) => ({ ...x, next: undefined, again: undefined }));
                }}
                error={errors.next ? t(errors.next) : undefined}
                hint={t('set.pw.hint')}
              />
              <div className={cx('set-meter', `is-${level}`)} aria-live="polite">
                <span className="set-meter__bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="set-meter__label">{level ? t(LEVEL_KEY[level]) : ''}</span>
              </div>
            </div>
            <TextField
              label={t('set.pw.confirm')}
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(v) => {
                setAgain(v);
                setErrors((x) => ({ ...x, again: undefined }));
              }}
              error={errors.again ? t(errors.again) : undefined}
            />
          </div>
          <div className="set-actions">
            <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
              {t('set.pw.save')}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
