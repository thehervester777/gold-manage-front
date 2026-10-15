import { useMemo, useRef, useState } from 'react';
import { Pencil, ShieldCheck, UserCheck, UserPlus, UserX, UsersRound } from 'lucide-react';
import { Avatar, Card, CardHead, EmptyState, PageHeader, Pager, SearchBox, rowDelay, usePaged } from '../../components/blocks';
import { Button, Chip, Segmented, Switch } from '../../components/controls';
import { SortTh, StatTile, Toolbar, compareValues, useSort } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useApp } from '../../lib/store';
import { errorText, useBi, useDb, useFmt, useT, useUser } from '../../lib/hooks';
import { normalizeQuery } from '../../lib/format';
import { confirmDialog, toast } from '../../lib/ui';
import type { User } from '../../lib/types';
import { UserDrawer } from './UserDrawer';
import { Roles } from './Roles';
import { roleTone } from './model';

type Filter = 'all' | 'active' | 'off';
type SortKey = 'name' | 'role' | 'last';

export function Users() {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const db = useDb();
  const me = useUser();
  const setStatus = useApp((s) => s.setUserStatus);
  const ref = usePageFX();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const lastEditing = useRef<string | 'new' | null>(null);
  if (editing !== null) lastEditing.current = editing;
  const [sort, onSort] = useSort<SortKey>('role', 'asc', ['name', 'role']);

  const roleName = (id: string) => {
    const r = db.roles.find((x) => x.id === id);
    return r ? bi(r.name) : t('common.unknown');
  };
  const roleIndex = (id: string) => db.roles.findIndex((r) => r.id === id);

  const sums = useMemo(() => {
    const active = db.users.filter((u) => u.status === 'active').length;
    return { total: db.users.length, active, off: db.users.length - active, roles: db.roles.length };
  }, [db.users, db.roles]);

  const list = useMemo(() => {
    const needle = normalizeQuery(q);
    const out = db.users.filter((u) => {
      if (filter === 'active' && u.status !== 'active') return false;
      if (filter === 'off' && u.status !== 'disabled') return false;
      if (!needle) return true;
      const hay = `${u.name} ${u.username} ${u.mobile ?? ''}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sort.key === 'role') return (compareValues(roleIndex(a.roleId), roleIndex(b.roleId)) || compareValues(a.name, b.name)) * dir;
      if (sort.key === 'last') return compareValues(a.lastLoginAt ?? '', b.lastLoginAt ?? '') * dir;
      return compareValues(a.name, b.name) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.users, db.roles, q, filter, sort]);

  const paged = usePaged(list, 12);

  const toggle = async (u: User, on: boolean) => {
    try {
      if (!on) {
        const ok = await confirmDialog({
          title: t('usr.off.title', { name: u.name }),
          body: t('usr.off.body', { name: u.name }),
          confirmLabel: t('usr.off.confirm'),
          cancelLabel: t('common.cancel'),
          tone: 'danger',
        });
        if (!ok) return;
      }
      setStatus(u.id, on ? 'active' : 'disabled');
      toast.success(t(on ? 'usr.on.done' : 'usr.off.done', { name: u.name }));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('usr.title')}
        subtitle={t('usr.subtitle')}
        actions={<Button variant="primary" icon={<UserPlus size={18} />} onClick={() => setEditing('new')} magnetic>{t('usr.add')}</Button>}
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<UsersRound size={17} />} label={t('usr.sum.people')} value={<Num value={sums.total} />} />
        <StatTile icon={<UserCheck size={17} />} tone="ok" label={t('usr.sum.active')} value={<Num value={sums.active} />} />
        <StatTile icon={<UserX size={17} />} tone={sums.off ? 'warn' : undefined} label={t('usr.sum.off')} value={<Num value={sums.off} />} />
        <StatTile icon={<ShieldCheck size={17} />} tone="gold" label={t('usr.sum.roles')} value={<Num value={sums.roles} />} />
      </div>

      <Card className="list-card upeople" data-fx="rise">
        <CardHead title={t('usr.people.title')} sub={t('usr.people.sub')} />
        <Toolbar>
          <SearchBox value={q} onChange={(v) => { setQ(v); paged.reset(); }} placeholder={t('usr.search')} className="toolbar__search" />
          <Segmented<Filter>
            label={t('common.filters')}
            value={filter}
            onChange={(v) => { setFilter(v); paged.reset(); }}
            items={[
              { id: 'all', label: t('usr.f.all') },
              { id: 'active', label: t('usr.f.active') },
              { id: 'off', label: t('usr.f.off') },
            ]}
          />
        </Toolbar>

        {list.length === 0 ? (
          <EmptyState compact title={t('usr.empty.title')} body={t('usr.empty.body')} action={<Button onClick={() => { setQ(''); setFilter('all'); }}>{t('common.reset')}</Button>} />
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl tbl--stack">
                <thead>
                  <tr>
                    <SortTh id="name" label={t('usr.col.person')} sort={sort} onSort={onSort} />
                    <SortTh id="role" label={t('usr.col.role')} sort={sort} onSort={onSort} />
                    <th className="hide-md">{t('usr.col.language')}</th>
                    <SortTh id="last" label={t('usr.col.last')} sort={sort} onSort={onSort} className="hide-md" />
                    <th>{t('usr.col.access')}</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody key={`${filter}|${q}|${sort.key}|${sort.dir}|${paged.page}`}>
                  {paged.slice.map((u, i) => {
                    const self = u.id === me.id;
                    const off = u.status === 'disabled';
                    return (
                      <tr key={u.id} className={`is-link row-in${off ? ' is-off' : ''}`} style={rowDelay(i)} onClick={() => setEditing(u.id)}>
                        <td>
                          <div className="cell-person">
                            <Avatar name={u.name} tone={off ? 'ink' : undefined} />
                            <div className="cell-main">
                              <b className="truncate">
                                {u.name}
                                {self ? <Chip plain className="u-you">{t('usr.you')}</Chip> : null}
                              </b>
                              <span className="mono">@{u.username}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label={t('usr.col.role')}><Chip tone={roleTone(u.roleId)} plain>{roleName(u.roleId)}</Chip></td>
                        <td className="hide-md" data-label={t('usr.col.language')}>{u.language === 'bn' ? t('lang.bn') : t('lang.en')}</td>
                        <td className="hide-md muted" data-label={t('usr.col.last')}>{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : t('usr.never')}</td>
                        <td data-label={t('usr.col.access')} onClick={stop}>
                          <div className="u-sign" title={self ? t('usr.access.self') : undefined}>
                            <Switch checked={!off} disabled={self} label={t('usr.access.label', { name: u.name })} onChange={(on) => void toggle(u, on)} />
                            <span className={off ? 'muted' : undefined}>{off ? t('status.userDisabled') : t('status.userActive')}</span>
                          </div>
                        </td>
                        <td className="c hide-sm" onClick={stop}>
                          <Button size="sm" variant="ghost" icon={<Pencil size={15} />} aria-label={t('usr.edit.row', { name: u.name })} onClick={() => setEditing(u.id)} />
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
      </Card>

      <Roles />

      <UserDrawer open={editing !== null} onClose={() => setEditing(null)} userId={lastEditing.current && lastEditing.current !== 'new' ? lastEditing.current : undefined} />
    </div>
  );
}
