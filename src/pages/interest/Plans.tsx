import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Card, CardHead, EmptyState } from '../../components/blocks';
import { Button, Chip, NumberField, Switch, TextField } from '../../components/controls';
import { Modal } from '../../components/overlays';
import { useApp, makeId } from '../../lib/store';
import { errorText, useDb, useFmt, useLang, useT } from '../../lib/hooks';
import { monthlyInterest } from '../../lib/interest';
import type { RatePlan } from '../../lib/types';
import { confirmDialog, toast } from '../../lib/ui';
import { cx } from '../../lib/cx';

const MAX_RATE = 15;

/** The rate plans staff can choose from when they issue a loan. */
export function Plans({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const db = useDb();
  const save = useApp((s) => s.saveRatePlans);
  const plans = db.settings.ratePlans;
  const [editing, setEditing] = useState<RatePlan | 'new' | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of db.loans) if (l.ratePlanId) m.set(l.ratePlanId, (m.get(l.ratePlanId) ?? 0) + 1);
    return m;
  }, [db.loans]);

  const commit = (next: RatePlan[], message?: string): boolean => {
    try {
      save(next);
      if (message) toast.success(message);
      return true;
    } catch (e) {
      toast.error(errorText(t, e));
      return false;
    }
  };

  const remove = async (plan: RatePlan) => {
    setEditing(null);
    const ok = await confirmDialog({
      title: t('int.plans.deleteTitle', { name: plan.name[lang] || plan.name.en }),
      body: t('int.plans.deleteBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) {
      setEditing(plan);
      return;
    }
    commit(plans.filter((p) => p.id !== plan.id), t('int.plans.deleted'));
  };

  return (
    <Card className="iplans" data-fx="rise" aria-labelledby="iplans-title">
      <CardHead
        id="iplans-title"
        title={t('int.plans.title')}
        sub={t('int.plans.sub')}
        actions={canEdit ? <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('int.plans.add')}</Button> : undefined}
      />
      <div className="card__body">
        {plans.length === 0 ? (
          <EmptyState compact title={t('int.plans.empty')} body={t('int.plans.emptyBody')} />
        ) : (
          <ul className="iplans__grid" data-fx-group data-stagger="0.07">
            {plans.map((p) => {
              const n = usage.get(p.id) ?? 0;
              const note = p.note?.[lang] || p.note?.en;
              return (
                <li key={p.id} className={cx('rplan', !p.active && 'is-off')}>
                  <div className="rplan__top">
                    <h3 className="rplan__name">{p.name[lang] || p.name.en}</h3>
                    <Switch
                      checked={p.active}
                      disabled={!canEdit}
                      label={`${t('int.plans.offered')}: ${p.name[lang] || p.name.en}`}
                      onChange={(v) => commit(plans.map((x) => (x.id === p.id ? { ...x, active: v } : x)))}
                    />
                  </div>
                  <p className="rplan__note">{note ?? ' '}</p>
                  <div className="rplan__rate">
                    <b className="serif-num">{f.pct(p.rate)}</b>
                    <span>{t('common.perMonth')}</span>
                  </div>
                  <div className="rplan__meter" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, (p.rate / MAX_RATE) * 100)}%` }} />
                  </div>
                  <p className="rplan__example">{t('int.plans.perLakh', { amount: f.money(monthlyInterest(100000, p.rate)) })}</p>
                  <div className="rplan__foot">
                    <div className="row row--wrap" style={{ gap: 6 }}>
                      <Chip plain>{t('common.loanCount', { n })}</Chip>
                      {!p.active ? <Chip tone="warn" plain>{t('int.plans.notOffered')}</Chip> : null}
                    </div>
                    {canEdit ? (
                      <Button size="sm" variant="ghost" icon={<Pencil size={15} />} onClick={() => setEditing(p)} aria-label={`${t('common.edit')}: ${p.name[lang] || p.name.en}`}>
                        {t('common.edit')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PlanModal
        plan={editing}
        used={editing && editing !== 'new' ? usage.get(editing.id) ?? 0 : 0}
        onClose={() => setEditing(null)}
        onSave={(plan) => {
          const exists = plans.some((p) => p.id === plan.id);
          const ok = commit(exists ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan], t('int.plans.saved'));
          if (ok) setEditing(null);
        }}
        onDelete={(plan) => void remove(plan)}
      />
    </Card>
  );
}

interface FormState {
  nameEn: string;
  nameBn: string;
  rate: number | null;
  noteEn: string;
  noteBn: string;
  active: boolean;
}

const blank: FormState = { nameEn: '', nameBn: '', rate: null, noteEn: '', noteBn: '', active: true };

function PlanModal({ plan, used, onClose, onSave, onDelete }: { plan: RatePlan | 'new' | null; used: number; onClose: () => void; onSave: (p: RatePlan) => void; onDelete: (p: RatePlan) => void }) {
  const t = useT();
  const open = plan !== null;
  const existing = plan && plan !== 'new' ? plan : null;
  const [s, setS] = useState<FormState>(blank);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setS(
      existing
        ? { nameEn: existing.name.en, nameBn: existing.name.bn, rate: existing.rate, noteEn: existing.note?.en ?? '', noteBn: existing.note?.bn ?? '', active: existing.active }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing?.id]);

  const rateOk = s.rate != null && s.rate > 0 && s.rate <= MAX_RATE;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));

  const submit = () => {
    setTried(true);
    if (!s.nameEn.trim() || !s.nameBn.trim() || !rateOk) return;
    const note = s.noteEn.trim() || s.noteBn.trim() ? { en: s.noteEn.trim(), bn: s.noteBn.trim() } : undefined;
    onSave({ id: existing?.id ?? makeId('rp'), name: { en: s.nameEn.trim(), bn: s.nameBn.trim() }, rate: s.rate!, active: s.active, note });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? t('int.plans.edit') : t('int.plans.new')}
      width={560}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          {existing && used === 0 ? (
            <Button variant="outline-danger" className="modal__foot-left" onClick={() => onDelete(existing)}>{t('common.delete')}</Button>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit">{t('int.plans.save')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <TextField label={t('int.plans.nameEn')} value={s.nameEn} onChange={(v) => set('nameEn', v)} lang="en" autoFocus error={tried && !s.nameEn.trim() ? t('err.nameRequired') : undefined} />
        <TextField label={t('int.plans.nameBn')} value={s.nameBn} onChange={(v) => set('nameBn', v)} lang="bn" error={tried && !s.nameBn.trim() ? t('err.nameRequired') : undefined} />
        <NumberField
          className="span-2"
          label={t('int.plans.rate')}
          hint={t('int.plans.rateHint')}
          value={s.rate}
          onChange={(v) => set('rate', v)}
          decimals={2}
          suffix="%"
          error={tried && !rateOk ? t('err.rateInvalid') : undefined}
        />
        <TextField label={t('int.plans.noteEn')} optional={t('common.optional')} value={s.noteEn} onChange={(v) => set('noteEn', v)} lang="en" />
        <TextField label={t('int.plans.noteBn')} optional={t('common.optional')} value={s.noteBn} onChange={(v) => set('noteBn', v)} lang="bn" />
        <div className="span-2 plan-active">
          <span>{t('int.plans.active')}</span>
          <Switch checked={s.active} onChange={(v) => set('active', v)} label={t('int.plans.active')} />
        </div>
        {existing && used > 0 ? <p className="span-2 muted small">{t('int.plans.inUse', { n: used })}</p> : null}
      </div>
    </Modal>
  );
}
