import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Info, Lock, MapPin, Trash2 } from 'lucide-react';
import { Drawer } from '../../components/overlays';
import { Avatar } from '../../components/blocks';
import { Button, ButtonLink, Chip, Field, NumberField, TextField } from '../../components/controls';
import { ItemArt } from '../../components/ItemArt';
import { fileToPhoto } from '../../components/PhotoInput';
import { useApp } from '../../lib/store';
import { errorText, useBi, useCan, useDb, useFmt, useLang, useT } from '../../lib/hooks';
import { auditFieldLabel, auditLine, auditTone, auditValueText } from '../../lib/auditText';
import { cx } from '../../lib/cx';
import { localDateOf } from '../../lib/dates';
import { confirmDialog, toast } from '../../lib/ui';
import type { GoldItem } from '../../lib/types';
import { slotKey } from './model';

interface Form {
  description: string;
  valuation: number | null;
  tagNo: string;
  vault: string;
  shelf: string;
  box: string;
  photo: string | null;
}

const formOf = (it: GoldItem): Form => ({
  description: it.description,
  valuation: it.valuation,
  tagNo: it.tagNo,
  vault: it.location.vault,
  shelf: it.location.shelf,
  box: it.location.box,
  photo: it.photo ?? null,
});

interface Props {
  itemId: string | null;
  onClose: () => void;
  /** Jump to the item's box on the vault map. */
  onLocate?: (item: GoldItem) => void;
}

export function ItemDrawer({ itemId, onClose, onLocate }: Props) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const bi = useBi();
  const db = useDb();
  const canEdit = useCan('items.edit');
  const canLoan = useCan('loans.view');
  const canCust = useCan('customers.view');
  const editItem = useApp((s) => s.editItem);

  // keep showing the same item while the drawer slides away
  const last = useRef<string | null>(itemId);
  if (itemId) last.current = itemId;
  const item = db.items.find((i) => i.id === (itemId ?? last.current));
  const loan = item ? db.loans.find((l) => l.id === item.loanId) : undefined;
  const customer = loan ? db.customers.find((c) => c.id === loan.customerId) : undefined;

  const [form, setForm] = useState<Form | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!itemId) return;
    const it = db.items.find((i) => i.id === itemId);
    setForm(it ? formOf(it) : null);
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const editable = !!item && canEdit && item.status === 'in_custody';
  const base = item ? formOf(item) : null;
  const dirty = !!(form && base && JSON.stringify(form) !== JSON.stringify(base));

  const errors = form
    ? {
        description: !form.description.trim() ? t('err.descriptionRequired') : undefined,
        valuation: !(form.valuation && form.valuation > 0) ? t('wiz.i.errValue') : undefined,
        where: !form.vault.trim() || !form.shelf.trim() || !form.box.trim() ? t('vault.d.errWhere') : undefined,
      }
    : { description: undefined, valuation: undefined, where: undefined };

  const sameBox = useMemo(() => {
    if (!form || !item) return 0;
    const key = slotKey({ vault: form.vault, shelf: form.shelf, box: form.box });
    return db.items.filter((i) => i.status === 'in_custody' && i.id !== item.id && slotKey(i.location) === key).length;
  }, [db.items, form, item]);

  const history = useMemo(() => {
    if (!item) return [];
    return db.audit.filter((e) => e.entity === 'item' && e.entityId === item.id).sort((a, b) => b.at.localeCompare(a.at));
  }, [db.audit, item]);

  const roleName = (id: string) => {
    const r = db.roles.find((x) => x.id === id);
    return r ? bi(r.name) : undefined;
  };

  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((s) => (s ? { ...s, [k]: v } : s));

  const requestClose = async () => {
    if (dirty && editable) {
      const ok = await confirmDialog({ title: t('vault.d.discard'), body: t('vault.d.discardBody'), confirmLabel: t('vault.d.discardGo'), cancelLabel: t('vault.d.discardStay'), tone: 'danger' });
      if (!ok) return;
    }
    onClose();
  };

  const pickPhoto = async (picked?: File | null) => {
    if (!picked) return;
    if (!picked.type.startsWith('image/')) {
      toast.error(t('photo.notImage'));
      return;
    }
    setPhotoBusy(true);
    try {
      setF('photo', await fileToPhoto(picked));
    } catch {
      toast.error(t('photo.failed'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = () => {
    if (!item || !form) return;
    setTried(true);
    if (errors.description || errors.valuation || errors.where) return;
    setBusy(true);
    try {
      editItem(item.id, {
        description: form.description,
        valuation: form.valuation ?? item.valuation,
        tagNo: form.tagNo,
        photo: form.photo,
        location: { vault: form.vault.trim(), shelf: form.shelf.trim(), box: form.box.trim() },
      });
      toast.success(t('vault.d.saved'), item.ref);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const view = form ?? (item ? formOf(item) : null);

  return (
    <Drawer
      open={!!itemId}
      onClose={() => void requestClose()}
      width={560}
      title={t('vault.d.title')}
      subtitle={item ? <span className="mono">{item.ref}</span> : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (editable) save();
      }}
      footer={
        item ? (
          <>
            <Button type="button" onClick={() => void requestClose()}>{t('common.close')}</Button>
            {editable ? (
              <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>{t('common.saveChanges')}</Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {item && view ? (
        <div className="idr">
          <div className={cx('idr__media', !view.photo && 'is-empty')}>
            {view.photo ? (
              <img src={view.photo} alt={view.description} />
            ) : (
              <div className="idr__art">
                <ItemArt category={item.category} size={104} />
                <span>{t('vault.d.photoNone')}</span>
              </div>
            )}
            <div className="idr__badges">
              <Chip tone="gold" plain>{t('dash.rate.carat', { n: item.carat })}</Chip>
              <Chip plain>{t(`cat.${item.category}`)}</Chip>
              {item.status === 'released' ? <Chip tone="ok">{t('status.released')}</Chip> : <Chip tone="info">{t('status.inCustody')}</Chip>}
            </div>
            {editable ? (
              <div className="idr__photo-tools">
                <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                <Button type="button" size="sm" variant="secondary" icon={<Camera size={15} />} loading={photoBusy} onClick={() => file.current?.click()}>
                  {view.photo ? t('common.change') : t('photo.add')}
                </Button>
                {view.photo ? (
                  <Button type="button" size="sm" variant="secondary" icon={<Trash2 size={15} />} aria-label={t('common.remove')} onClick={() => setF('photo', null)} />
                ) : null}
              </div>
            ) : null}
          </div>

          {item.status === 'released' ? (
            <div className="callout callout--ok" role="status">
              <Lock size={18} />
              <span>{t('vault.d.locked', { date: f.date(item.releasedOn ?? localDateOf(item.createdAt)) })}</span>
            </div>
          ) : !canEdit ? (
            <div className="callout" role="status">
              <Info size={18} />
              <span>{t('vault.d.readonly')}</span>
            </div>
          ) : null}

          <section className="idr__sec">
            <h3 className="idr__h">{t('vault.d.weights')}</h3>
            <div className="idr__weights">
              <div><span>{t('wiz.i.gross')}</span><b className="num">{f.weight(item.grossWeight)}</b></div>
              <div><span>{t('wiz.i.stone')}</span><b className="num">{f.weight(item.stoneWeight)}</b></div>
              <div className="is-net"><span>{t('wiz.i.net')}</span><b className="num">{f.weight(item.netWeight)}</b><small>{f.vori(item.netWeight)}</small></div>
            </div>
          </section>

          <section className="idr__sec">
            <div className="stack" style={{ ['--gap' as string]: '16px' }}>
              {editable ? (
                <>
                  <TextField label={t('wiz.i.desc')} value={view.description} onChange={(v) => setF('description', v)} error={tried ? errors.description : undefined} autoComplete="off" />
                  <div className="form-grid">
                    <NumberField label={t('wiz.i.valuation')} prefix="৳" value={view.valuation} onChange={(v) => setF('valuation', v)} error={tried ? errors.valuation : undefined} />
                    <TextField label={t('wiz.i.tag')} optional={t('common.optional')} value={view.tagNo} onChange={(v) => setF('tagNo', v)} mono autoComplete="off" />
                  </div>
                  <Field label={t('vault.d.where')} as="div" error={tried ? errors.where : undefined}>
                    <div className="form-grid form-grid--3">
                      <TextField aria-label={t('wiz.i.vault')} placeholder={t('wiz.i.vault')} value={view.vault} onChange={(v) => setF('vault', v)} autoComplete="off" />
                      <TextField aria-label={t('wiz.i.shelf')} placeholder={t('wiz.i.shelf')} value={view.shelf} onChange={(v) => setF('shelf', v)} autoComplete="off" />
                      <TextField aria-label={t('wiz.i.box')} placeholder={t('wiz.i.box')} value={view.box} onChange={(v) => setF('box', v)} autoComplete="off" />
                    </div>
                    <span className="idr__same" aria-live="polite">
                      <MapPin size={14} aria-hidden />
                      {sameBox > 0 ? t('vault.d.sameBox', { n: sameBox }) : t('vault.d.emptyBox')}
                    </span>
                  </Field>
                </>
              ) : (
                <dl className="idr__facts">
                  <div><dt>{t('wiz.i.desc')}</dt><dd>{item.description}</dd></div>
                  <div><dt>{t('wiz.i.valuation')}</dt><dd className="num"><b>{f.money(item.valuation)}</b></dd></div>
                  <div><dt>{t('wiz.i.tag')}</dt><dd className="mono">{item.tagNo || '—'}</dd></div>
                  <div><dt>{t('vault.d.where')}</dt><dd>{item.location.vault} · {item.location.shelf} · {item.location.box}</dd></div>
                </dl>
              )}
            </div>
          </section>

          {loan && customer ? (
            <section className="idr__sec">
              <h3 className="idr__h">{t('vault.d.pledgedFor')}</h3>
              <div className="idr__loan">
                <Avatar name={customer.name} size="sm" />
                <span className="cell-main grow">
                  <b className="truncate">{canCust ? <Link className="link" to={`/customers/${customer.id}`}>{customer.name}</Link> : customer.name}</b>
                  <span>{t('vault.d.owner')} · <span className="mono">{customer.code}</span></span>
                </span>
                {canLoan ? (
                  <ButtonLink to={`/loans/${loan.id}`} size="sm" iconRight={<ArrowRight size={15} />}>
                    <span className="mono">{loan.number}</span>
                  </ButtonLink>
                ) : (
                  <span className="mono">{loan.number}</span>
                )}
              </div>
            </section>
          ) : null}

          {onLocate && item.status === 'in_custody' ? (
            <Button type="button" variant="soft" icon={<MapPin size={16} />} onClick={() => onLocate(item)}>{t('vault.card.locate')}</Button>
          ) : null}

          <section className="idr__sec">
            <h3 className="idr__h">{t('vault.d.history')}</h3>
            <ol className="timeline idr__timeline">
              {item.status === 'released' && item.releasedOn ? (
                <li className="timeline__item timeline__item--ok">
                  <span className="timeline__dot" />
                  <div>
                    <div className="timeline__text">{t('vault.d.releasedOn', { date: f.date(item.releasedOn) })}</div>
                  </div>
                </li>
              ) : null}
              {history.map((e) => (
                <li key={e.id} className={`timeline__item timeline__item--${auditTone(e)}`}>
                  <span className="timeline__dot" />
                  <div className="grow">
                    <div className="timeline__text">{auditLine(e, lang)}</div>
                    {e.changes?.length ? (
                      <ul className="idr__changes">
                        {e.changes.map((c) => (
                          <li key={c.field}>
                            <span>{auditFieldLabel(c.field, lang)}</span>
                            <s>{auditValueText(c.field, c.before, lang, { role: roleName })}</s>
                            <ArrowRight size={13} aria-hidden />
                            <b>{auditValueText(c.field, c.after, lang, { role: roleName })}</b>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="timeline__meta">{e.userName} · {f.dateTime(e.at)}</div>
                  </div>
                </li>
              ))}
              <li className="timeline__item timeline__item--gold">
                <span className="timeline__dot" />
                <div>
                  <div className="timeline__text">{t('vault.d.receivedOn', { date: f.date(localDateOf(item.createdAt)) })}</div>
                  {loan ? <div className="timeline__meta"><span className="mono">{loan.number}</span></div> : null}
                </div>
              </li>
            </ol>
            {history.length === 0 ? <p className="idr__none">{t('vault.d.noHistory')}</p> : null}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}

