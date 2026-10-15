import { ChevronDown, Trash2, Wand2 } from 'lucide-react';
import { Button, Field, NumberField, Segmented, TextField } from '../../../components/controls';
import { ItemArt } from '../../../components/ItemArt';
import { PhotoInput } from '../../../components/PhotoInput';
import { useFmt, useT } from '../../../lib/hooks';
import { CARATS, CATEGORIES, type Carat, type Category, type GoldRate } from '../../../lib/types';
import { cx } from '../../../lib/cx';
import { itemErrors, marketValue, netOf, type DraftItem } from './draft';

interface Props {
  item: DraftItem;
  index: number;
  open: boolean;
  showErrors: boolean;
  canRemove: boolean;
  rates: GoldRate[];
  onToggle: () => void;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}

export function ItemEditor({ item, index, open, showErrors, canRemove, rates, onToggle, onChange, onRemove }: Props) {
  const t = useT();
  const f = useFmt();
  const errs = itemErrors(item);
  const bad = showErrors && Object.keys(errs).length > 0;
  const net = netOf(item);
  const market = marketValue(item, rates);
  const e = (k: keyof typeof errs) => (showErrors && errs[k] ? t(errs[k]!) : undefined);

  return (
    <div className={cx('wiz-item', open && 'is-open', bad && 'has-error')} data-item={item.key}>
      <button type="button" className="wiz-item__head" onClick={onToggle} aria-expanded={open}>
        <span className="wiz-item__pic">{item.photo ? <img src={item.photo} alt="" /> : <ItemArt category={item.category} size={36} />}</span>
        <span className="cell-main grow">
          <b className="truncate">{item.description.trim() || t('wiz.i.item', { n: index + 1 })}</b>
          <span>{net > 0 ? t('wiz.i.summary', { c: item.carat, w: f.weight(net) }) : t(`cat.${item.category}`)}</span>
        </span>
        {bad ? <span className="wiz-item__flag">{t('wiz.i.fix')}</span> : item.valuation ? <b className="num wiz-item__val">{f.money(item.valuation)}</b> : null}
        <ChevronDown size={19} className="wiz-item__chev" aria-hidden />
      </button>

      <div className="wiz-item__collapse" inert={!open}>
        <div className="wiz-item__clip">
          <div className="wiz-item__body">
            <div className="field">
              <span className="field__label"><span>{t('wiz.i.category')}</span></span>
              <div className="cat-pick" role="radiogroup" aria-label={t('wiz.i.category')}>
                {CATEGORIES.map((c: Category) => (
                  <button key={c} type="button" role="radio" aria-checked={item.category === c} className={cx('cat-pick__opt', item.category === c && 'is-on')} onClick={() => onChange({ category: c })} >
                    <ItemArt category={c} size={30} />
                    <span>{t(`cat.${c}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="wiz-item__layout">
              <div className="wiz-item__fields">
                <TextField
                  label={t('wiz.i.desc')}
                  placeholder={t('wiz.i.descPh')}
                  value={item.description}
                  onChange={(v) => onChange({ description: v })}
                  error={e('description')}
                  autoComplete="off"
                />
                <div className="wiz-grid">
                  <Field label={t('wiz.i.carat')} as="div">
                    <Segmented<string>
                      label={t('wiz.i.carat')}
                      value={String(item.carat)}
                      onChange={(v) => onChange({ carat: Number(v) as Carat })}
                      items={CARATS.map((c) => ({ id: String(c), label: f.digits(c) }))}
                    />
                  </Field>
                  <NumberField label={t('wiz.i.gross')} suffix={t('wiz.i.unit')} decimals={3} value={item.gross} onChange={(v) => onChange({ gross: v })} error={e('gross')} />
                  <NumberField label={t('wiz.i.stone')} optional={t('common.optional')} suffix={t('wiz.i.unit')} decimals={3} value={item.stone} onChange={(v) => onChange({ stone: v })} error={e('stone')} />
                  <Field label={t('wiz.i.net')} as="div">
                    <div className="net-box" aria-live="polite">
                      <b className="num">{net > 0 ? f.weight(net) : '—'}</b>
                      <span>{net > 0 ? f.vori(net) : t('common.vori')}</span>
                    </div>
                  </Field>
                </div>

                <div className="wiz-grid wiz-grid--value">
                  <div className="stack" style={{ gap: 8 }}>
                    <NumberField label={t('wiz.i.valuation')} prefix="৳" value={item.valuation} onChange={(v) => onChange({ valuation: v })} error={e('valuation')} />
                    <div className="suggest">
                      {market ? (
                        <>
                          <span>{t('wiz.i.rateHint', { c: item.carat, v: f.money(market) })}</span>
                          {item.valuation !== market ? (
                            <Button type="button" size="sm" variant="soft" icon={<Wand2 size={15} />} onClick={() => onChange({ valuation: market })}>{t('wiz.i.suggest')}</Button>
                          ) : null}
                        </>
                      ) : (
                        <span>{t('wiz.i.noRate')}</span>
                      )}
                    </div>
                  </div>
                  <TextField label={t('wiz.i.tag')} optional={t('common.optional')} hint={t('wiz.i.tagHint')} value={item.tagNo} onChange={(v) => onChange({ tagNo: v })} mono autoComplete="off" />
                </div>

                <div className="field">
                  <span className="field__label"><span>{t('wiz.i.where')}</span></span>
                  <div className="wiz-grid wiz-grid--3">
                    <TextField aria-label={t('wiz.i.vault')} placeholder={t('wiz.i.vault')} value={item.vault} onChange={(v) => onChange({ vault: v })} />
                    <TextField aria-label={t('wiz.i.shelf')} placeholder={t('wiz.i.shelf')} value={item.shelf} onChange={(v) => onChange({ shelf: v })} />
                    <TextField aria-label={t('wiz.i.box')} placeholder={t('wiz.i.box')} value={item.box} onChange={(v) => onChange({ box: v })} />
                  </div>
                </div>
              </div>

              <div className="wiz-item__photo">
                <span className="field__label"><span>{t('common.photo')}</span><small>{t('common.optional')}</small></span>
                <PhotoInput value={item.photo} onChange={(v) => onChange({ photo: v })} size={148} label={t('photo.add')} />
              </div>
            </div>

            {canRemove ? (
              <div className="wiz-item__foot">
                <Button type="button" size="sm" variant="outline-danger" icon={<Trash2 size={15} />} onClick={onRemove}>{t('wiz.i.remove')}</Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
