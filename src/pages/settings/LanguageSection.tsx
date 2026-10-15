import { Check } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Segmented } from '../../components/controls';
import { useApp } from '../../lib/store';
import { useAction, useCan, useLang, useSettings, useT, useToday } from '../../lib/hooks';
import { makeT, type TKey } from '../../lib/i18n';
import { makeFmt } from '../../lib/format';
import { toast } from '../../lib/ui';
import type { Lang } from '../../lib/types';
import { cx } from '../../lib/cx';

const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'bn', name: 'বাংলা' },
];

/** Each person's own language, and (for people who manage settings) the default for new accounts. */
export function LanguageSection() {
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const canManage = useCan('settings.manage');
  const settings = useSettings();
  const setLang = useApp((s) => s.setUserLanguage);
  const setDefault = useApp((s) => s.setDefaultLanguage);
  const act = useAction();

  const choose = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    // Say so in the language that was just picked, so the confirmation is readable to the person who chose it.
    const said = makeT(l);
    toast.success(said('set.lang.changed'), said('set.lang.changedBody', { lang: said(`lang.${l}` as TKey) }));
  };

  const saveDefault = act((l: Lang) => {
    if (l === settings.defaultLanguage) return;
    setDefault(l);
    toast.success(t('set.lang.default.saved'), t('set.lang.default.savedBody', { lang: t(`lang.${l}` as TKey) }));
  });

  return (
    <Card id="set-language" className="set-card" data-fx="rise" aria-labelledby="set-language-h">
      <CardHead id="set-language-h" title={t('set.lang.title')} sub={t('set.lang.sub')} />
      <div className="card__body set-body">
        <div className="set-langs" role="radiogroup" aria-label={t('set.lang.yours')}>
          {LANGS.map((l) => {
            const said = makeT(l.id);
            const fl = makeFmt(l.id);
            const on = l.id === lang;
            return (
              <button key={l.id} type="button" role="radio" aria-checked={on} className={cx('set-lang', on && 'is-on')} onClick={() => choose(l.id)} lang={l.id}>
                <span className="set-lang__top">
                  <b className="set-lang__name">{l.name}</b>
                  <span className="set-lang__tick" aria-hidden="true">
                    <Check size={15} strokeWidth={2.6} />
                  </span>
                </span>
                <span className="set-lang__sample">{said('set.lang.sample', { amount: fl.money(125000), date: fl.date(today) })}</span>
                <span className="set-lang__digits" aria-hidden="true">{fl.digits('0123456789')}</span>
              </button>
            );
          })}
        </div>

        {canManage ? (
          <div className="set-line">
            <div className="set-line__text">
              <b>{t('set.lang.default.title')}</b>
              <p>{t('set.lang.default.body')}</p>
            </div>
            <Segmented<Lang>
              label={t('set.lang.default.title')}
              value={settings.defaultLanguage}
              onChange={saveDefault}
              items={LANGS.map((l) => ({ id: l.id, label: l.name }))}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
