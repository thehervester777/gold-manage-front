import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, Download, ExternalLink, ScrollText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Avatar, Card, EmptyState, PageHeader, SearchBox, rowDelay } from '../../components/blocks';
import { Button, Chip, SelectField } from '../../components/controls';
import { DateField } from '../../components/pickers';
import { StatTile } from '../../components/lists';
import { Num } from '../../motion/Num';
import { usePageFX } from '../../motion/fx';
import { useBi, useCanAll, useDb, useFmt, useLang, useT, useToday } from '../../lib/hooks';
import { auditFieldLabel, auditLine, auditTone, auditValueText } from '../../lib/auditText';
import { addDays, localDateOf, localStampText, type ISODate } from '../../lib/dates';
import { normalizeQuery } from '../../lib/format';
import { saveCsv } from '../../lib/files';
import { toast } from '../../lib/ui';
import type { TKey } from '../../lib/i18n';
import type { AuditEntry } from '../../lib/types';
import { cx } from '../../lib/cx';
import { AREAS, AREA_OF, isAdminEntry, isHandEntry, metaFacts, recordLink, type Area } from './model';

const PAGE = 60;
const PERMS = ['loans.view', 'customers.view', 'receipts.view'] as const;

export function Audit() {
  const t = useT();
  const f = useFmt();
  const bi = useBi();
  const lang = useLang();
  const db = useDb();
  const today = useToday();
  const can = useCanAll(PERMS);
  const ref = usePageFX();

  const [q, setQ] = useState('');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [person, setPerson] = useState('all');
  const [from, setFrom] = useState<ISODate>('');
  const [to, setTo] = useState<ISODate>('');
  const [limit, setLimit] = useState(PAGE);

  // newest first; equal timestamps keep the order they were written in, reversed
  const all = useMemo(() => db.audit.map((e, i) => ({ e, i })).sort((a, b) => b.e.at.localeCompare(a.e.at) || b.i - a.i).map((x) => x.e), [db.audit]);

  const sums = useMemo(
    () => ({
      total: all.length,
      today: all.filter((e) => localDateOf(e.at) === today).length,
      hand: all.filter(isHandEntry).length,
      admin: all.filter(isAdminEntry).length,
    }),
    [all, today],
  );

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) if (!m.has(e.userId)) m.set(e.userId, e.userName);
    return [...m.entries()].map(([id, name]) => ({ id, name: id === 'system' ? t('aud.system') : name }));
  }, [all, t]);

  const roleName = (id: string) => {
    const r = db.roles.find((x) => x.id === id);
    return r ? bi(r.name) : '';
  };

  const filtered = useMemo(() => {
    const needle = normalizeQuery(q);
    return all.filter((e) => {
      if (area !== 'all' && AREA_OF[e.entity] !== area) return false;
      if (person !== 'all' && e.userId !== person) return false;
      const day = localDateOf(e.at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      const hay = `${auditLine(e, lang)} ${e.label} ${e.userName} ${t(`audit.act.${e.action}` as TKey)} ${t(`audit.ent.${e.entity}` as TKey)}`.toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, area, person, from, to, lang]);

  const shown = filtered.slice(0, limit);
  const groups = useMemo(() => {
    const out: { day: string; items: AuditEntry[] }[] = [];
    for (const e of shown) {
      const day = localDateOf(e.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [shown]);

  const filtering = q !== '' || area !== 'all' || person !== 'all' || from !== '' || to !== '';
  const reset = () => {
    setQ('');
    setArea('all');
    setPerson('all');
    setFrom('');
    setTo('');
    setLimit(PAGE);
  };
  const filterKey = `${q}|${area}|${person}|${from}|${to}`;

  const dayLabel = (day: string) => (day === today ? t('aud.day.today') : day === addDays(today, -1) ? t('aud.day.yesterday') : f.date(day));

  const exportCsv = async () => {
    const roleOf = (id: string) => roleName(id);
    const head = [t('aud.h.when'), t('aud.h.person'), t('aud.h.role'), t('aud.h.action'), t('aud.h.area'), t('aud.h.ref'), t('aud.h.what'), t('aud.h.field'), t('aud.h.before'), t('aud.h.after'), t('aud.h.reason')];
    const rows: (string | number)[][] = [head];
    for (const e of filtered) {
      const base = [
        localStampText(e.at),
        e.userId === 'system' ? t('aud.system') : e.userName,
        roleOf(e.roleId),
        t(`audit.act.${e.action}` as TKey),
        t(`aud.area.${AREA_OF[e.entity]}` as TKey),
        e.label,
        auditLine(e, lang),
      ];
      if (e.changes?.length) {
        for (const c of e.changes) {
          rows.push([...base, auditFieldLabel(c.field, lang), auditValueText(c.field, c.before, lang, { role: roleOf }), auditValueText(c.field, c.after, lang, { role: roleOf }), e.reason ?? '']);
        }
      } else rows.push([...base, '', '', '', e.reason ?? '']);
    }
    const name = `audit-log-${today}.csv`;
    const res = await saveCsv(name, rows);
    if (res === 'saved') toast.success(t('rep.saved'), name);
    else if (res === 'unsupported') toast.error(t('rep.fail'));
  };

  return (
    <div ref={ref} className="page">
      <PageHeader
        title={t('aud.title')}
        subtitle={t('aud.subtitle')}
        actions={<Button icon={<Download size={17} />} onClick={exportCsv} disabled={!filtered.length}>{t('common.exportCsv')}</Button>}
      />

      <div className="stat-strip" data-fx-group data-stagger="0.07">
        <StatTile icon={<ScrollText size={17} />} label={t('aud.sum.total')} value={<Num value={sums.total} />} />
        <StatTile icon={<CalendarClock size={17} />} tone="gold" label={t('aud.sum.today')} value={<Num value={sums.today} />} />
        <StatTile icon={<SlidersHorizontal size={17} />} tone={sums.hand ? 'warn' : undefined} label={t('aud.sum.hand')} value={<Num value={sums.hand} />} />
        <StatTile icon={<ShieldCheck size={17} />} label={t('aud.sum.admin')} value={<Num value={sums.admin} />} />
      </div>

      <Card className="alog-filters" data-fx="rise">
        <div className="alog-filters__grid">
          <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(PAGE); }} placeholder={t('aud.search')} className="alog-filters__search" />
          <SelectField<Area | 'all'>
            aria-label={t('aud.f.area')}
            value={area}
            onChange={(v) => { setArea(v); setLimit(PAGE); }}
            options={[{ value: 'all', label: t('aud.area.all') }, ...AREAS.map((a) => ({ value: a, label: t(`aud.area.${a}` as TKey) }))]}
          />
          <SelectField
            aria-label={t('aud.f.person')}
            value={person}
            onChange={(v) => { setPerson(v); setLimit(PAGE); }}
            options={[{ value: 'all', label: t('aud.person.all') }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <DateField value={from} onChange={(v) => { setFrom(v); if (to && v > to) setTo(v); setLimit(PAGE); }} max={today} placeholder={t('aud.f.from')} />
          <DateField value={to} onChange={(v) => { setTo(v); if (from && v < from) setFrom(v); setLimit(PAGE); }} max={today} placeholder={t('aud.f.to')} />
          <Button variant="ghost" onClick={reset} disabled={!filtering}>{t('common.reset')}</Button>
        </div>
        <div className="alog-filters__count" aria-live="polite">
          {filtered.length ? t('common.showing', { a: Math.min(limit, filtered.length), b: filtered.length }) : ''}
        </div>
      </Card>

      {all.length === 0 ? (
        <Card><EmptyState title={t('aud.none.title')} body={t('aud.none.body')} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState title={t('aud.empty.title')} body={t('aud.empty.body')} action={<Button onClick={reset}>{t('common.reset')}</Button>} /></Card>
      ) : (
        <div className="alog" key={filterKey}>
          {groups.map((g, gi) => (
            <section key={g.day} className="alog__group" aria-label={dayLabel(g.day)}>
              <header className="alog__day">
                <b>{dayLabel(g.day)}</b>
                <span>{t('aud.dayCount', { n: g.items.length })}</span>
              </header>
              <ol className="alog__list card">
                {g.items.map((e, i) => (
                  <Entry
                    key={e.id}
                    e={e}
                    index={gi === 0 ? i : 0}
                    roleName={roleName(e.roleId)}
                    link={(() => {
                      const l = recordLink(db, e);
                      return l && can[l.perm] ? l.to : null;
                    })()}
                  />
                ))}
              </ol>
            </section>
          ))}
          {shown.length < filtered.length ? (
            <div className="alog__more">
              <Button onClick={() => setLimit((n) => n + PAGE)}>{t('aud.more')}</Button>
            </div>
          ) : null}
        </div>
      )}

      <p className="alog__note">{t('aud.retained')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------
function Entry({ e, index, roleName, link }: { e: AuditEntry; index: number; roleName: string; link: string | null }) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const db = useDb();
  const bi = useBi();
  const [open, setOpen] = useState(false);
  const id = useId();

  const facts = useMemo(() => metaFacts(e, t, f), [e, t, f]);
  const changes = e.changes ?? [];
  const expandable = changes.length > 0 || !!e.reason || facts.length > 0 || !!link;
  const area = AREA_OF[e.entity];
  const system = e.userId === 'system';
  const who = system ? t('aud.system') : e.userName;
  const resolveRole = (rid: string) => {
    const r = db.roles.find((x) => x.id === rid);
    return r ? bi(r.name) : undefined;
  };

  const head = (
    <>
      <span className="alog__text">{auditLine(e, lang)}</span>
      <span className="alog__by">
        <Avatar name={who} tone={system ? 'ink' : undefined} size="sm" />
        <span>
          {who}
          {roleName ? <em> · {roleName}</em> : null}
        </span>
        <time className="alog__time-sm">{f.time(e.at)}</time>
      </span>
    </>
  );

  return (
    <li className={cx('alog__row row-in', open && 'is-open', expandable && 'is-expandable')} style={rowDelay(index)}>
      <time className="alog__time" dateTime={e.at}>{f.time(e.at)}</time>
      <span className="alog__rail" aria-hidden="true"><i className={`alog__dot alog__dot--${auditTone(e)}`} /></span>
      <div className="alog__main">
        {expandable ? (
          <button type="button" className="alog__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            {head}
          </button>
        ) : (
          <div className="alog__head">{head}</div>
        )}
        {expandable ? (
          <div className="alog__panel" id={id} inert={!open}>
            <div className="alog__clip">
            <div className="alog__panel-in">
              {e.reason ? (
                <blockquote className="alog__reason">
                  <b>{t('aud.reason')}</b>
                  <p>{e.reason}</p>
                </blockquote>
              ) : null}
              {changes.length ? (
                <div className="alog__diff-wrap">
                  <table className="alog__diff">
                    <thead>
                      <tr>
                        <th>{t('aud.col.field')}</th>
                        <th>{t('common.before')}</th>
                        <th>{t('common.after')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c, i) => (
                        <tr key={`${c.field}-${i}`}>
                          <td data-label={t('aud.col.field')}>{auditFieldLabel(c.field, lang)}</td>
                          <td data-label={t('common.before')} className="alog__before">{auditValueText(c.field, c.before, lang, { role: resolveRole })}</td>
                          <td data-label={t('common.after')} className="alog__after">{auditValueText(c.field, c.after, lang, { role: resolveRole })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {facts.length ? (
                <dl className="alog__facts">
                  {facts.map((x) => (
                    <div key={x.key}>
                      <dt>{x.label}</dt>
                      <dd>{x.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {link ? (
                <Link className="link alog__open" to={link}>
                  {t('aud.open')}
                  <ExternalLink size={14} aria-hidden />
                </Link>
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="alog__side">
        <Chip plain>{t(`aud.area.${area}` as TKey)}</Chip>
        {changes.length ? <span className="alog__n">{t('aud.changes', { n: changes.length })}</span> : null}
        {expandable ? (
          <button type="button" className="alog__chev" aria-label={open ? t('aud.collapse') : t('aud.expand')} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
            <ChevronDown size={17} aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}
