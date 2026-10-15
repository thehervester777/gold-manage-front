import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, Lock, Pencil, Plus, Undo2 } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Button, Chip, SelectField, TextAreaField, TextField } from '../../components/controls';
import { Modal } from '../../components/overlays';
import { useApp, makeId } from '../../lib/store';
import { PERMISSION_GROUPS } from '../../lib/permissions';
import { errorText, useBi, useDb, useFmt, useLang, useT } from '../../lib/hooks';
import type { TKey } from '../../lib/i18n';
import type { Permission, Role } from '../../lib/types';
import { confirmDialog, toast } from '../../lib/ui';
import { cx } from '../../lib/cx';
import { SENSITIVE, roleTone, samePerms } from './model';

type Draft = Record<string, Permission[]>;

/** Every role next to every permission. Ticks are edited in place and saved together. */
export function Roles() {
  const t = useT();
  const bi = useBi();
  const f = useFmt();
  const lang = useLang();
  const db = useDb();
  const saveRole = useApp((s) => s.saveRole);
  const [draft, setDraft] = useState<Draft>({});
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const roles = db.roles;

  const people = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of db.users) m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1);
    return m;
  }, [db.users]);

  // a role can disappear (deleted) while it has a draft
  useEffect(() => {
    setDraft((d) => {
      const next: Draft = {};
      for (const [id, perms] of Object.entries(d)) {
        const r = roles.find((x) => x.id === id);
        if (r && !r.locked && !samePerms(r.permissions, perms)) next[id] = perms;
      }
      return Object.keys(next).length === Object.keys(d).length ? d : next;
    });
  }, [roles]);

  const effective = (r: Role): Permission[] => draft[r.id] ?? r.permissions;

  const toggle = (r: Role, p: Permission, on: boolean) => {
    const cur = effective(r);
    const next = on ? [...cur, p] : cur.filter((x) => x !== p);
    setDraft((d) => {
      const copy = { ...d };
      if (samePerms(r.permissions, next)) delete copy[r.id];
      else copy[r.id] = next;
      return copy;
    });
  };

  const changes = useMemo(() => {
    let n = 0;
    const granted: Permission[] = [];
    for (const r of roles) {
      const d = draft[r.id];
      if (!d) continue;
      for (const p of d) if (!r.permissions.includes(p)) {
        n++;
        if (SENSITIVE.has(p)) granted.push(p);
      }
      for (const p of r.permissions) if (!d.includes(p)) n++;
    }
    return { n, granted: [...new Set(granted)] };
  }, [draft, roles]);

  const commit = async () => {
    if (changes.granted.length) {
      const sep = lang === 'bn' ? '، ' : ', ';
      const ok = await confirmDialog({
        title: t('usr.roles.grantTitle'),
        body: t('usr.roles.grantBody', { list: changes.granted.map((p) => t(`perm.${p}` as TKey)).join(sep) }),
        confirmLabel: t('usr.roles.grantConfirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
    }
    try {
      for (const r of roles) {
        const d = draft[r.id];
        if (d) saveRole({ ...r, permissions: PERMISSION_ORDER.filter((p) => d.includes(p)) });
      }
      setDraft({});
      toast.success(t('usr.roles.saved'), t('usr.roles.savedBody'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  const remove = async (role: Role) => {
    setEditing(null);
    const ok = await confirmDialog({
      title: t('usr.role.deleteTitle', { name: bi(role.name) }),
      body: t('usr.role.deleteBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) {
      setEditing(role);
      return;
    }
    try {
      useApp.getState().deleteRole(role.id);
      toast.success(t('usr.role.deleted'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  return (
    <Card className="mx-card" data-fx="rise" aria-labelledby="mx-title">
      <CardHead
        id="mx-title"
        title={t('usr.roles.title')}
        sub={t('usr.roles.sub')}
        actions={<Button size="sm" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('usr.roles.add')}</Button>}
      />
      <p className="mx__swipe">
        <ArrowLeftRight size={14} aria-hidden />
        {t('usr.roles.swipe')}
      </p>
      <div className={cx('mx-scroll', roles.length > 5 && 'is-wide')}>
        <table className="mx" style={{ ['--roles' as string]: roles.length }} aria-label={t('usr.roles.matrix')}>
          <thead>
            <tr>
              <th className="mx__corner" scope="col">{t('usr.roles.col')}</th>
              {roles.map((r) => {
                const n = people.get(r.id) ?? 0;
                const total = effective(r).length;
                return (
                  <th key={r.id} scope="col" className={cx('mx__role', draft[r.id] && 'is-dirty')}>
                    <div className="mx__rname">
                      <Chip tone={roleTone(r.id)} plain>{bi(r.name)}</Chip>
                      {r.locked ? (
                        <span className="mx__lock" title={t('usr.roles.full')}>
                          <Lock size={13} aria-hidden />
                          <span className="sr-only">{t('usr.roles.full')}</span>
                        </span>
                      ) : (
                        <button type="button" className="mx__edit" onClick={() => setEditing(r)} aria-label={t('usr.roles.detailsFor', { name: bi(r.name) })} title={t('usr.roles.details')}>
                          <Pencil size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                    <span className="mx__rmeta">{t('usr.roles.people', { n })}</span>
                    <span className="mx__rcount">{f.digits(`${total}/${PERMISSION_ORDER.length}`)}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <Fragment key={g.id}>
                <tr className="mx__group">
                  <th colSpan={roles.length + 1} scope="colgroup">{t(`permgroup.${g.id}` as TKey)}</th>
                </tr>
                {g.permissions.map((p) => (
                  <tr key={p} className="mx__row">
                    <th scope="row" className="mx__perm">
                      <b>
                        {t(`perm.${p}` as TKey)}
                        {SENSITIVE.has(p) ? <Chip tone="warn" plain className="mx__flag">{t('usr.roles.sensitive')}</Chip> : null}
                      </b>
                      <span>{t(`perm.${p}.hint` as TKey)}</span>
                    </th>
                    {roles.map((r) => {
                      const on = effective(r).includes(p);
                      const changed = on !== r.permissions.includes(p);
                      const label = t('usr.roles.toggle', { perm: t(`perm.${p}` as TKey), role: bi(r.name) });
                      return (
                        <td key={r.id}>
                          <label className={cx('mx__cell', r.locked && 'is-locked', changed && 'is-changed')}>
                            <input type="checkbox" checked={on} disabled={!!r.locked} onChange={(e) => toggle(r, p, e.target.checked)} aria-label={label} />
                            <span className="mx__box" aria-hidden="true">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mx__note">
        <Lock size={14} aria-hidden />
        <span>{t('usr.roles.readOnly')}</span>
      </div>

      {changes.n > 0 ? (
        <div className="mx__bar" role="status">
          <div className="mx__bartext">
            <b>{t('usr.roles.dirty', { n: changes.n })}</b>
            <span>{t('usr.roles.dirtyHint')}</span>
          </div>
          <div className="row">
            <Button size="sm" variant="onink" icon={<Undo2 size={15} />} onClick={() => setDraft({})}>{t('usr.roles.undo')}</Button>
            <Button size="sm" variant="primary" onClick={commit}>{t('usr.roles.save')}</Button>
          </div>
        </div>
      ) : null}

      <RoleModal
        role={editing}
        used={editing && editing !== 'new' ? people.get(editing.id) ?? 0 : 0}
        onClose={() => setEditing(null)}
        onRemove={remove}
      />
    </Card>
  );
}

const PERMISSION_ORDER: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions);

// ---------------------------------------------------------------------------
// Add or rename a role
// ---------------------------------------------------------------------------
function RoleModal({ role, used, onClose, onRemove }: { role: Role | 'new' | null; used: number; onClose: () => void; onRemove: (r: Role) => void }) {
  const t = useT();
  const bi = useBi();
  const db = useDb();
  const saveRole = useApp((s) => s.saveRole);
  const open = role !== null;
  const last = useMemoLast(role);
  const current = role ?? last;
  const editing = current && current !== 'new' ? current : undefined;

  const blank = { nameEn: '', nameBn: '', descEn: '', descBn: '', copy: '' };
  const [v, setV] = useState(blank);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setV(editing ? { nameEn: editing.name.en, nameBn: editing.name.bn, descEn: editing.description.en, descBn: editing.description.bn, copy: '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const set = (k: keyof typeof blank) => (val: string) => setV((s) => ({ ...s, [k]: val }));
  const errors = {
    nameEn: !v.nameEn.trim() ? t('err.nameRequired') : undefined,
    nameBn: !v.nameBn.trim() ? t('err.nameRequired') : undefined,
  };

  const submit = () => {
    setTried(true);
    if (errors.nameEn || errors.nameBn) return;
    try {
      const name = { en: v.nameEn.trim(), bn: v.nameBn.trim() };
      const description = { en: v.descEn.trim(), bn: v.descBn.trim() };
      if (editing) {
        saveRole({ ...editing, name, description });
        toast.success(t('usr.role.updated'));
      } else {
        const from = db.roles.find((r) => r.id === v.copy);
        saveRole({ id: makeId('role'), name, description, permissions: from ? [...from.permissions] : ['dashboard.view'], system: false });
        toast.success(t('usr.role.added'), t('usr.role.addedBody'));
      }
      onClose();
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  const canDelete = !!editing && !editing.system && used === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('usr.role.editTitle') : t('usr.role.addTitle')}
      subtitle={editing ? bi(editing.name) : t('usr.role.addSub')}
      width={560}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          {editing ? (
            <div className="modal__foot-left">
              <Button variant="outline-danger" disabled={!canDelete} onClick={() => editing && onRemove(editing)}>{t('usr.role.delete')}</Button>
            </div>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary">{editing ? t('common.saveChanges') : t('usr.roles.add')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label={t('usr.role.nameEn')} value={v.nameEn} onChange={set('nameEn')} error={tried ? errors.nameEn : undefined} autoComplete="off" autoFocus />
        <TextField label={t('usr.role.nameBn')} value={v.nameBn} onChange={set('nameBn')} error={tried ? errors.nameBn : undefined} autoComplete="off" />
        <TextAreaField className="span-2" label={t('usr.role.descEn')} optional={t('common.optional')} value={v.descEn} onChange={set('descEn')} rows={2} />
        <TextAreaField className="span-2" label={t('usr.role.descBn')} optional={t('common.optional')} value={v.descBn} onChange={set('descBn')} rows={2} />
        {!editing ? (
          <SelectField
            className="span-2"
            label={t('usr.role.copy')}
            value={v.copy}
            onChange={set('copy')}
            options={[{ value: '', label: t('usr.role.copyNone') }, ...db.roles.map((r) => ({ value: r.id, label: bi(r.name) }))]}
          />
        ) : null}
      </div>
      {editing ? (
        <p className="muted small" style={{ marginTop: 14, lineHeight: 1.55 }}>
          {editing.system ? t('usr.role.builtInNote') : used > 0 ? t('usr.role.inUse') : null}
        </p>
      ) : null}
    </Modal>
  );
}

/** Remember the last non-empty value so a closing dialog keeps its content while it animates out. */
function useMemoLast<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) setLast(value);
  }, [value]);
  return last;
}
