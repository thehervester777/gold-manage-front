import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Button, Chip, Segmented, TextAreaField, TextField } from '../../components/controls';
import { LogoMark } from '../../components/Logo';
import { useApp } from '../../lib/store';
import { useAction, useLang, useSettings, useT, useToday } from '../../lib/hooks';
import { makeT } from '../../lib/i18n';
import { RECEIPT_CODE } from '../../lib/domain';
import { toast } from '../../lib/ui';
import type { Lang } from '../../lib/types';
import { sameBusiness, trimBusiness, validateBusiness, type Business } from './model';

type Pair = 'name' | 'tagline' | 'address' | 'receiptFooter';

/** Name, address and receipt wording — written in both languages, with a live look at the receipt header. */
export function BusinessSection() {
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const saved = useSettings().business;
  const save = useApp((s) => s.saveBusiness);
  const act = useAction();

  const [draft, setDraft] = useState<Business>(saved);
  const [tried, setTried] = useState(false);
  const [blurred, setBlurred] = useState<Record<string, boolean>>({});
  const [pl, setPl] = useState<Lang>(lang);

  // Take the stored values again whenever they change underneath (after saving, or after a restore).
  useEffect(() => setDraft(saved), [saved]);
  useEffect(() => setPl(lang), [lang]);

  const errors = useMemo(() => validateBusiness(draft), [draft]);
  const dirty = !sameBusiness(draft, saved);
  const hasErrors = Object.keys(errors).length > 0;
  const show = (k: string) => tried || blurred[k];
  const seen = (k: string) => () => setBlurred((b) => ({ ...b, [k]: true }));

  const setPair = (key: Pair, l: Lang, v: string) => setDraft((d) => ({ ...d, [key]: { ...d[key], [l]: v } }));
  const setText = (key: 'phone' | 'email' | 'licenseNo', v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const submit = act(() => {
    setTried(true);
    if (hasErrors) return;
    save(trimBusiness(draft));
    toast.success(t('set.biz.saved'), t('set.biz.savedBody'));
    setTried(false);
    setBlurred({});
  });

  const discard = () => {
    setDraft(saved);
    setTried(false);
    setBlurred({});
  };

  // ---- the preview speaks the language it is set to, whatever the rest of the screen uses ----
  const said = useMemo(() => makeT(pl), [pl]);
  const pick = (b: { en: string; bn: string }) => b[pl].trim() || b.en.trim();
  const contact = [pick(draft.address), draft.phone.trim(), draft.licenseNo.trim() ? said('sheet.licence', { no: draft.licenseNo.trim() }) : ''].filter(Boolean).join(' · ');
  const footer = pick(draft.receiptFooter);

  const biPair = (key: Pair, label: 'name' | 'tagline' | 'address' | 'footer', opts?: { area?: boolean; errEn?: boolean; errBn?: boolean }) => {
    const Field = opts?.area ? TextAreaField : TextField;
    const eEn = opts?.errEn && show('name.en') && errors.nameEn ? t(errors.nameEn) : undefined;
    const eBn = opts?.errBn && show('name.bn') && errors.nameBn ? t(errors.nameBn) : undefined;
    return (
      <div className="set-pair">
        <Field
          label={t(`set.biz.${label}.en`)}
          value={draft[key].en}
          onChange={(v) => setPair(key, 'en', v)}
          onBlur={seen(`${key}.en`)}
          error={eEn}
          lang="en"
          {...(opts?.area ? { rows: 3 } : {})}
        />
        <Field
          label={t(`set.biz.${label}.bn`)}
          value={draft[key].bn}
          onChange={(v) => setPair(key, 'bn', v)}
          onBlur={seen(`${key}.bn`)}
          error={eBn}
          lang="bn"
          {...(opts?.area ? { rows: 3 } : {})}
        />
      </div>
    );
  };

  return (
    <Card id="set-business" className="set-card" data-fx="rise" aria-labelledby="set-business-h">
      <CardHead
        id="set-business-h"
        title={t('set.biz.title')}
        sub={t('set.biz.sub')}
        actions={dirty ? <Chip tone="warn" plain>{t('set.biz.unsaved')}</Chip> : undefined}
      />
      <div className="card__body set-biz">
        <form
          className="set-biz__form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <fieldset className="set-group">
            <legend>{t('set.biz.group.name')}</legend>
            <div className="set-fields">
              {biPair('name', 'name', { errEn: true, errBn: true })}
              {biPair('tagline', 'tagline')}
            </div>
          </fieldset>

          <fieldset className="set-group">
            <legend>{t('set.biz.group.contact')}</legend>
            <div className="set-fields">
              {biPair('address', 'address', { area: true })}
              <div className="set-duo">
                <TextField
                  label={t('set.biz.phone')}
                  value={draft.phone}
                  onChange={(v) => setText('phone', v)}
                  onBlur={seen('phone')}
                  error={show('phone') && errors.phone ? t(errors.phone) : undefined}
                  inputMode="tel"
                  autoComplete="off"
                />
                <TextField
                  label={t('set.biz.email')}
                  value={draft.email}
                  onChange={(v) => setText('email', v)}
                  onBlur={seen('email')}
                  error={show('email') && errors.email ? t(errors.email) : undefined}
                  inputMode="email"
                  autoComplete="off"
                />
              </div>
              <TextField label={t('set.biz.licence')} value={draft.licenseNo} onChange={(v) => setText('licenseNo', v)} mono autoComplete="off" />
            </div>
          </fieldset>

          <fieldset className="set-group">
            <legend>{t('set.biz.group.footer')}</legend>
            <p className="set-group__hint">{t('set.biz.footer.hint')}</p>
            <div className="set-fields">{biPair('receiptFooter', 'footer', { area: true })}</div>
          </fieldset>

          <div className="set-actions">
            <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={discard} disabled={!dirty}>
              {t('set.biz.discard')}
            </Button>
            <Button type="submit" variant="primary" disabled={!dirty}>
              {t('set.biz.save')}
            </Button>
          </div>
        </form>

        <aside className="set-biz__side" aria-label={t('set.biz.preview')}>
          <div className="set-biz__sidehead">
            <div>
              <b>{t('set.biz.preview')}</b>
              <p>{t('set.biz.previewSub')}</p>
            </div>
            <Segmented<Lang>
              label={t('set.biz.previewLang')}
              value={pl}
              onChange={setPl}
              items={[
                { id: 'en', label: 'EN' },
                { id: 'bn', label: 'বাং' },
              ]}
            />
          </div>

          <div className="sheet set-paper" lang={pl}>
            <div className="sheet__streak" aria-hidden="true" />
            <header className="sheet__head">
              <div className="sheet__brand">
                <LogoMark size={40} />
                <div>
                  <div className="sheet__name">{pick(draft.name)}</div>
                  <div className="sheet__tag">{pick(draft.tagline)}</div>
                </div>
              </div>
              <div className="sheet__seal" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
                  <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="32" cy="32" r="24.5" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.2 2.6" />
                </svg>
                <b>{RECEIPT_CODE.new_loan}</b>
              </div>
            </header>
            <p className="sheet__contact">{contact || ' '}</p>
            <div className="set-paper__title">
              <h4>{said('rtype.new_loan')}</h4>
              <span className="sheet__mono">{`${RECEIPT_CODE.new_loan}-${today.slice(0, 4)}-000046`}</span>
            </div>
            <div className="set-paper__lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <p className="set-paper__foot">{footer || ' '}</p>
          </div>
        </aside>
      </div>
    </Card>
  );
}
