import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Info, ShieldCheck } from 'lucide-react';
import { Card, CardHead, PageHeader } from '../../components/blocks';
import { Button, Chip, NumberField, Segmented } from '../../components/controls';
import { Seal } from '../../components/Seal';
import { usePageFX } from '../../motion/fx';
import { useApp } from '../../lib/store';
import { errorText, useCan, useDb, useFmt, useT } from '../../lib/hooks';
import { confirmDialog, toast } from '../../lib/ui';
import type { InterestPolicy, PartialBase } from '../../lib/interest';
import type { Settings } from '../../lib/types';
import { cx } from '../../lib/cx';
import { ruleLines } from './model';
import { Plans } from './Plans';
import { DayScene } from './DayScene';
import { TryLoan } from './TryLoan';
import { AgreedExamples } from './AgreedExamples';

type Saved = Settings['interest'];

interface Draft {
  grace: number | null;
  min: number | null;
  base: PartialBase;
  ltv: number | null;
  term: number | null;
}

const toDraft = (s: Saved): Draft => ({
  grace: s.policy.graceDays,
  min: Math.min(3, Math.max(1, s.policy.minMonths)),
  base: s.policy.partialBase,
  ltv: s.maxLtv,
  term: s.defaultTermMonths,
});

const isInt = (v: number | null, lo: number, hi: number): v is number => v != null && Number.isInteger(v) && v >= lo && v <= hi;

/** Splits "Counting months. Months run…" into a bold lead and the rest. */
function splitLead(text: string): [string, string] {
  const m = /[.।]\s/.exec(text);
  return m ? [text.slice(0, m.index + 1), text.slice(m.index + 2)] : ['', text];
}

export function Interest() {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const ref = usePageFX([f.lang]);
  const canEdit = useCan('interest.configure');
  const savePolicy = useApp((s) => s.savePolicy);
  const approve = useApp((s) => s.approveInterestRules);

  const saved = db.settings.interest;
  const savedKey = JSON.stringify([saved.policy, saved.maxLtv, saved.defaultTermMonths]);
  const [d, setD] = useState<Draft>(() => toDraft(saved));
  useEffect(() => {
    setD(toDraft(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const graceOk = isInt(d.grace, 0, 15);
  const minOk = isInt(d.min, 1, 3);
  const ltvOk = d.ltv != null && d.ltv > 0 && d.ltv <= 100;
  const termOk = isInt(d.term, 1, 36);
  const valid = graceOk && minOk && ltvOk && termOk;
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(saved));

  // everything below the rules form follows the draft, so a rule can be tried before it is saved
  const preview = useMemo<InterestPolicy>(
    () => ({
      graceDays: graceOk ? d.grace! : saved.policy.graceDays,
      minMonths: minOk ? d.min! : Math.max(1, saved.policy.minMonths),
      partialBase: d.base,
    }),
    [d.grace, d.min, d.base, graceOk, minOk, saved.policy.graceDays, saved.policy.minMonths],
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (!valid || !dirty || !canEdit) return;
    const wasApproved = !!saved.approvedAt;
    try {
      savePolicy({ graceDays: d.grace!, minMonths: d.min!, partialBase: d.base }, d.ltv!, d.term!);
      toast.success(t('int.rules.saved'), wasApproved ? t('int.rules.savedCleared') : t('int.rules.savedPending'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  const record = async () => {
    if (dirty) {
      toast.info(t('int.sign.saveFirst'));
      return;
    }
    const ok = await confirmDialog({
      title: t('int.sign.confirmTitle'),
      body: t('int.sign.confirmBody'),
      confirmLabel: t('int.sign.record'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      approve();
      toast.success(t('int.sign.recorded'), t('int.sign.recordedBody'));
    } catch (e) {
      toast.error(errorText(t, e));
    }
  };

  return (
    <div ref={ref} className="page irules">
      <PageHeader title={t('nav.interest')} subtitle={t('int.subtitle')} />

      <SignOff saved={saved} canEdit={canEdit} dirty={dirty} onRecord={() => void record()} />

      <Card className="irules__card" data-fx="rise" aria-labelledby="irules-title">
        <CardHead
          id="irules-title"
          title={t('int.rules.title')}
          sub={t('int.rules.sub')}
          actions={dirty ? <Chip tone="warn" pulse>{t('int.rules.unsaved')}</Chip> : undefined}
        />
        <div className="irules__body">
          <div className={cx('irules__rows', !canEdit && 'is-readonly')}>
            <SettingRow
              label={t('int.rules.grace')}
              hint={t('int.rules.graceHint')}
              soft={graceOk && (d.grace! < 1 || d.grace! > 3) ? t('int.rules.graceOutside') : undefined}
            >
              <div className="srow__num">
                <NumberField aria-label={t('int.rules.grace')} value={d.grace} onChange={(v) => set('grace', v)} disabled={!canEdit} error={!graceOk ? t('int.rules.graceError') : undefined} />
                <span className="srow__unit">{t('int.unit.days')}</span>
              </div>
            </SettingRow>

            <SettingRow label={t('int.rules.min')} hint={t('int.rules.minHint')}>
              <Segmented
                label={t('int.rules.min')}
                value={String(d.min ?? 1)}
                onChange={(v) => canEdit && set('min', Number(v))}
                items={[1, 2, 3].map((n) => ({ id: String(n), label: t('common.monthCount', { n }) }))}
              />
            </SettingRow>

            <SettingRow label={t('int.rules.base')} hint={d.base === 'remaining' ? t('int.rules.baseHint.remaining') : t('int.rules.baseHint.original')}>
              <Segmented<PartialBase>
                label={t('int.rules.base')}
                value={d.base}
                onChange={(v) => canEdit && set('base', v)}
                items={[
                  { id: 'remaining', label: t('int.rules.base.remaining') },
                  { id: 'original', label: t('int.rules.base.original') },
                ]}
              />
            </SettingRow>

            <SettingRow label={t('int.rules.ltv')} hint={t('int.rules.ltvHint')}>
              <div className="srow__num">
                <NumberField aria-label={t('int.rules.ltv')} suffix="%" value={d.ltv} onChange={(v) => set('ltv', v)} disabled={!canEdit} error={!ltvOk ? t('int.rules.ltvError') : undefined} />
              </div>
            </SettingRow>

            <SettingRow label={t('int.rules.term')} hint={t('int.rules.termHint')}>
              <div className="srow__num">
                <NumberField aria-label={t('int.rules.term')} value={d.term} onChange={(v) => set('term', v)} disabled={!canEdit} error={!termOk ? t('err.termInvalid') : undefined} />
                <span className="srow__unit">{t('int.unit.months')}</span>
              </div>
            </SettingRow>
          </div>

          <aside className="irules__fixed" aria-label={t('int.fixed.title')}>
            <h3>{t('int.fixed.title')}</h3>
            <ul>
              {(['1', '2', '3', '4', '5'] as const).map((n) => (
                <li key={n}>
                  <Check size={15} aria-hidden="true" />
                  <span>{t(`int.fixed.${n}`)}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="card__foot irules__foot">
          <p className="irules__footnote">
            {!canEdit ? (
              <>
                <Info size={15} aria-hidden="true" /> {t('int.rules.readOnly')}
              </>
            ) : dirty && saved.approvedAt ? (
              <>
                <Info size={15} aria-hidden="true" /> {t('int.rules.willClear')}
              </>
            ) : null}
          </p>
          {canEdit ? (
            <div className="row">
              <Button variant="ghost" disabled={!dirty} onClick={() => setD(toDraft(saved))}>{t('int.rules.undo')}</Button>
              <Button variant="primary" disabled={!dirty || !valid} onClick={save}>{t('common.saveChanges')}</Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Plans canEdit={canEdit} />
      <DayScene policy={preview} previewing={dirty} />
      <TryLoan policy={preview} previewing={dirty} />
      <AgreedExamples policy={preview} previewing={dirty} />
    </div>
  );
}

function SettingRow({ label, hint, soft, children }: { label: string; hint: string; soft?: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div className="srow__text">
        <b>{label}</b>
        <p>{hint}</p>
        {soft ? (
          <p className="srow__soft">
            <Info size={14} aria-hidden="true" /> {soft}
          </p>
        ) : null}
      </div>
      <div className="srow__ctl">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign-off
// ---------------------------------------------------------------------------
function SignOff({ saved, canEdit, dirty, onRecord }: { saved: Saved; canEdit: boolean; dirty: boolean; onRecord: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const approved = !!saved.approvedAt;
  const who = db.users.find((u) => u.id === saved.approvedBy)?.name ?? saved.approvedBy ?? '';
  const lines = ruleLines(t, saved.policy);
  const points = [t('int.sign.point1'), t(saved.policy.partialBase === 'remaining' ? 'int.sign.point2.remaining' : 'int.sign.point2.original')];

  return (
    <section className={cx('isign', approved ? 'is-approved' : 'is-pending')} data-fx="rise" aria-labelledby="isign-title">
      <span className="isign__glow" aria-hidden="true" />
      <div className="isign__main">
        <Chip tone={approved ? 'ok' : 'warn'} className="isign__status" pulse={!approved}>
          {approved ? t('int.sign.approved') : t('int.sign.pending')}
        </Chip>
        <h2 className="isign__title" id="isign-title">{approved ? t('int.sign.approvedTitle') : t('int.sign.pendingTitle')}</h2>
        <p className="isign__body">
          {approved ? t('int.sign.approvedBody', { name: who, date: saved.approvedAt ? f.dateTime(saved.approvedAt) : '' }) : t('int.sign.pendingBody')}
        </p>

        <ul className="isign__lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <div className="isign__chips">
          <span className="isign__chip">{saved.policy.graceDays > 0 ? t('int.chip.grace', { n: saved.policy.graceDays }) : t('int.chip.graceNone')}</span>
          <span className="isign__chip">{t('int.chip.min', { n: Math.max(1, saved.policy.minMonths) })}</span>
          <span className="isign__chip">{saved.policy.partialBase === 'remaining' ? t('int.chip.base.remaining') : t('int.chip.base.original')}</span>
          <span className="isign__chip">{t('int.chip.ltv', { n: saved.maxLtv })}</span>
          <span className="isign__chip">{t('int.chip.term', { n: saved.defaultTermMonths })}</span>
        </div>

        {!approved ? (
          <div className="isign__act">
            {canEdit ? (
              <>
                <Button variant="primary" size="lg" icon={<ShieldCheck size={18} />} disabled={dirty} onClick={onRecord} magnetic>{t('int.sign.record')}</Button>
                {dirty ? <span className="isign__hint">{t('int.sign.saveFirst')}</span> : null}
              </>
            ) : (
              <span className="isign__hint">{t('int.sign.noRight')}</span>
            )}
          </div>
        ) : null}
      </div>

      <aside className="isign__points" aria-labelledby="isign-points">
        <div className="isign__mark" aria-hidden="true">
          {approved ? (
            <Seal gold size={64} />
          ) : (
            <svg width="64" height="64" viewBox="0 0 96 96" fill="none">
              <circle className="isign__dash" cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="4" strokeDasharray="6 9" strokeLinecap="round" />
              <circle cx="48" cy="48" r="5" fill="currentColor" />
            </svg>
          )}
        </div>
        <h3 id="isign-points">{t('int.sign.pointsTitle')}</h3>
        <ol>
          {points.map((p, i) => {
            const [lead, rest] = splitLead(p);
            return (
              <li key={i}>
                <span className="isign__n">{f.digits(i + 1)}</span>
                <p>
                  {lead ? <b>{lead} </b> : null}
                  {rest}
                </p>
              </li>
            );
          })}
        </ol>
      </aside>
    </section>
  );
}
