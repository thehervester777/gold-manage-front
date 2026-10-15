import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { Drawer } from '../../components/overlays';
import { Button, Field, Segmented, SelectField, TextField } from '../../components/controls';
import { useApp } from '../../lib/store';
import { errorText, useBi, useDb, useFmt, useT, useUser } from '../../lib/hooks';
import { isValidMobile, normalizeMobile } from '../../lib/domain';
import { ROLE_IDS } from '../../lib/permissions';
import { PERMISSIONS, type Lang } from '../../lib/types';
import { toast } from '../../lib/ui';
import { USERNAME_RE, suggestPassword } from './model';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit this user; leave out to add a new one. */
  userId?: string;
}

export function UserDrawer({ open, onClose, userId }: Props) {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const db = useDb();
  const me = useUser();
  const save = useApp((s) => s.saveUser);

  // keep showing the same person while the drawer slides out
  const shown = useRef(userId);
  if (open) shown.current = userId;
  const id = open ? userId : shown.current;
  const existing = id ? db.users.find((u) => u.id === id) : undefined;

  const defaultRole = db.roles.find((r) => r.id === ROLE_IDS.cashier)?.id ?? db.roles[db.roles.length - 1]?.id ?? '';
  const blank = { name: '', username: '', mobile: '', roleId: defaultRole, language: db.settings.defaultLanguage as Lang, password: '' };
  const [v, setV] = useState(blank);
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setShow(false);
    setV(existing ? { name: existing.name, username: existing.username, mobile: existing.mobile ?? '', roleId: existing.roleId, language: existing.language, password: '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const set = <K extends keyof typeof blank>(k: K) => (val: (typeof blank)[K]) => setV((s) => ({ ...s, [k]: val }));

  const isSelf = !!existing && existing.id === me.id;
  const activeOwners = db.users.filter((u) => u.roleId === ROLE_IDS.owner && u.status === 'active').length;
  const onlyOwner = !!existing && existing.roleId === ROLE_IDS.owner && activeOwners <= 1;
  const roleLocked = isSelf || onlyOwner;

  const username = v.username.trim().toLowerCase();
  const errors = {
    name: !v.name.trim() ? t('err.nameRequired') : undefined,
    username: !USERNAME_RE.test(username)
      ? t('err.usernameInvalid')
      : db.users.some((u) => u.username.toLowerCase() === username && u.id !== existing?.id)
        ? t('err.usernameTaken')
        : undefined,
    mobile: v.mobile.trim() && !isValidMobile(v.mobile) ? t('err.mobileInvalid') : undefined,
    password: (!existing || v.password) && v.password.length < 6 ? t('err.passwordShort') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const role = db.roles.find((r) => r.id === v.roleId);
  const roleHint = roleLocked
    ? isSelf
      ? t('usr.form.selfRole')
      : t('usr.form.lastOwner')
    : role
      ? `${bi(role.description)} ${t('usr.form.roleCan', { a: role.permissions.length, b: PERMISSIONS.length })}`
      : undefined;

  const submit = () => {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    try {
      save({
        id: existing?.id,
        username,
        name: v.name.trim().replace(/\s+/g, ' '),
        mobile: v.mobile.trim() ? normalizeMobile(v.mobile) : undefined,
        roleId: v.roleId,
        language: v.language,
        password: v.password || undefined,
      });
      toast.success(existing ? t('usr.form.saved') : t('usr.form.added'));
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const creator = existing ? db.users.find((u) => u.id === existing.createdBy)?.name ?? t('common.unknown') : '';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? t('usr.form.editTitle') : t('usr.form.addTitle')}
      subtitle={existing ? `@${existing.username}` : t('usr.form.addSub')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{existing ? t('common.saveChanges') : t('usr.form.add')}</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <TextField label={t('usr.form.name')} placeholder={t('usr.form.namePh')} value={v.name} onChange={set('name')} error={tried ? errors.name : undefined} autoComplete="off" autoFocus />
        <TextField
          label={t('usr.form.username')}
          hint={t('usr.form.usernameHint')}
          value={v.username}
          onChange={(x) => set('username')(x.replace(/\s/g, ''))}
          error={tried || v.username ? errors.username : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          mono
        />
        <TextField label={t('usr.form.mobile')} optional={t('common.optional')} value={v.mobile} onChange={set('mobile')} error={tried ? errors.mobile : undefined} inputMode="tel" autoComplete="off" mono />
        <SelectField
          label={t('usr.form.role')}
          value={v.roleId}
          onChange={set('roleId')}
          disabled={roleLocked}
          hint={roleHint}
          options={db.roles.map((r) => ({ value: r.id, label: bi(r.name) }))}
        />
        <Field label={t('usr.form.language')} hint={t('usr.form.languageHint')} as="div">
          <Segmented<Lang>
            label={t('usr.form.language')}
            value={v.language}
            onChange={set('language')}
            items={[
              { id: 'en', label: t('lang.en') },
              { id: 'bn', label: t('lang.bn') },
            ]}
          />
        </Field>

        <div className="upw">
          <TextField
            label={existing ? t('usr.form.passwordNew') : t('usr.form.password')}
            hint={existing ? t('usr.form.passwordKeep') : t('usr.form.passwordHint')}
            value={v.password}
            onChange={set('password')}
            error={tried ? errors.password : undefined}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            mono
          />
          <div className="upw__tools">
            <Button size="sm" variant="ghost" icon={show ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setShow((s) => !s)}>
              {show ? t('login.hidePassword') : t('login.showPassword')}
            </Button>
            <Button
              size="sm"
              variant="soft"
              icon={<Sparkles size={15} />}
              onClick={() => {
                set('password')(suggestPassword());
                setShow(true);
              }}
            >
              {t('usr.form.suggest')}
            </Button>
          </div>
        </div>

        {existing ? (
          <ul className="uinfo">
            <li>{existing.lastLoginAt ? t('usr.form.lastLogin', { when: f.dateTime(existing.lastLoginAt) }) : t('usr.form.neverLogin')}</li>
            <li>{t('usr.form.created', { when: f.dateTime(existing.createdAt), by: creator })}</li>
          </ul>
        ) : null}
      </div>
    </Drawer>
  );
}
