import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { LogoMark } from './Logo';
import { makeT } from '../lib/i18n';
import { makeFmt } from '../lib/format';
import { RECEIPT_CODE } from '../lib/domain';
import type { Lang, Receipt, Settings } from '../lib/types';

/** A4 portrait at 96 dpi. The height is 1122, not 1123, so that printing never adds a second page. */
export const PAGE_W = 794;
export const PAGE_H = 1122;

/** QR code as one SVG path, so it prints crisply at any size. */
function QrMark({ text }: { text: string }) {
  const { d, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          let run = 1;
          while (c + run < n && qr.isDark(r, c + run)) run++;
          path += `M${c} ${r}h${run}v1h-${run}z`;
          c += run;
        } else c++;
      }
    }
    return { d: path, size: n };
  }, [text]);
  return (
    <svg className="sheet__qr" viewBox={`-2 -2 ${size + 4} ${size + 4}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#141b25" />
    </svg>
  );
}

interface Props {
  receipt: Receipt;
  business: Settings['business'];
  lang: Lang;
}

/**
 * The paper receipt: always exactly one A4 portrait page. It draws from the frozen snapshot saved with the
 * receipt and speaks its own language, so a Bangla receipt can be printed from an English screen.
 *
 * The page box is fixed at A4. A receipt with a lot on it (many gold items, long addresses) is scaled down
 * just enough to fit, so it can never spill onto a second page.
 */
export const ReceiptSheet = forwardRef<HTMLDivElement, Props>(function ReceiptSheet({ receipt, business, lang }, ref) {
  const t = useMemo(() => makeT(lang), [lang]);
  const f = useMemo(() => makeFmt(lang), [lang]);
  const s = receipt.snapshot;
  const pick = (b: { en: string; bn: string }) => b[lang] || b.en;
  const type = receipt.type;
  const totalNet = Math.round(s.items.reduce((a, i) => a + i.netWeight, 0) * 1000) / 1000;
  const verify = `IGH|${receipt.number}|${s.loanNumber}|${receipt.amount}|${receipt.date}`;
  const showTerms = type === 'new_loan';
  const itemsTitle = type === 'release' ? t('sheet.released') : t('sheet.items');
  const amountLabel = t(`sheet.amount.${type === 'new_loan' ? 'new_loan' : type}` as 'sheet.amount.new_loan');
  const nil = type === 'release' && receipt.amount === 0;
  const dense = s.items.length > 3;

  // scale the sheet down when its content is taller than the page
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => {
      const natural = el.offsetHeight; // layout height: the transform does not change it
      const k = natural > PAGE_H ? PAGE_H / natural : 1;
      setFit((prev) => (Math.abs(prev - k) < 0.002 ? prev : k));
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    void document.fonts?.ready.then(measure);
    return () => ro?.disconnect();
  }, [receipt.id, lang]);

  // what this payment covers / the terms / the settlement, next to the balance that is left
  const primary = showTerms ? (
    <section className="sheet__block">
      <h3>{t('sheet.terms')}</h3>
      <dl className="sheet__kv">
        <div><dt>{t('sheet.rate')}</dt><dd>{f.pct(s.rate)} {t('common.perMonth')}</dd></div>
        <div><dt>{t('sheet.term')}</dt><dd>{t('common.monthCount', { n: s.termMonths })}</dd></div>
        <div><dt>{t('sheet.maturity')}</dt><dd>{f.date(s.maturityDate)}</dd></div>
      </dl>
    </section>
  ) : type === 'interest' && s.coverage ? (
    <section className="sheet__block">
      <h3>{t('sheet.coverage')}</h3>
      <dl className="sheet__kv">
        <div><dt>{t('sheet.cov.period')}</dt><dd>{f.date(s.coverage.from)} – {f.date(s.coverage.to)}</dd></div>
        <div><dt>{t('sheet.cov.months')}</dt><dd>{t('common.monthCount', { n: s.coverage.months })}</dd></div>
        <div><dt>{t('sheet.cov.accrued')}</dt><dd>{f.money(s.coverage.accrued)}</dd></div>
        {s.coverage.adjustments !== 0 ? <div><dt>{t('sheet.cov.adjust')}</dt><dd>{f.signedMoney(s.coverage.adjustments)}</dd></div> : null}
        <div><dt>{t('sheet.cov.before')}</dt><dd>{f.money(s.coverage.previouslyPaid)}</dd></div>
        <div className="is-strong"><dt>{t('sheet.cov.now')}</dt><dd>{f.money(receipt.amount)}</dd></div>
      </dl>
    </section>
  ) : type === 'release' && s.lifetime ? (
    <section className="sheet__block">
      <h3>{t('sheet.life')}</h3>
      <dl className="sheet__kv">
        <div><dt>{t('sheet.life.principal')}</dt><dd>{f.money(s.lifetime.principalRepaid)}</dd></div>
        <div><dt>{t('sheet.life.interest')}</dt><dd>{f.money(s.lifetime.interestPaid)}</dd></div>
        <div><dt>{t('sheet.life.on')}</dt><dd>{f.date(s.lifetime.settledOn)}</dd></div>
      </dl>
    </section>
  ) : null;

  const balance =
    type !== 'new_loan' ? (
      <section className="sheet__block">
        <h3>{t('sheet.balance')}</h3>
        <dl className="sheet__kv">
          <div><dt>{t('sheet.bal.principal')}</dt><dd>{f.money(s.balanceAfter.principal)}</dd></div>
          <div><dt>{t('sheet.bal.interest')}</dt><dd>{f.money(s.balanceAfter.interest)}</dd></div>
        </dl>
      </section>
    ) : null;

  return (
    <div className="a4" lang={lang} ref={ref} data-receipt={receipt.number}>
      <div className="sheet__streak" aria-hidden />
      <div
        className={`sheet sheet--a4 sheet--${type}${dense ? ' sheet--dense' : ''}`}
        lang={lang}
        ref={inner}
        style={fit < 1 ? { transform: `scale(${fit})` } : undefined}
      >
        <header className="sheet__head">
          <div className="sheet__brand">
            <LogoMark size={46} />
            <div>
              <div className="sheet__name">{pick(business.name)}</div>
              <div className="sheet__tag">{pick(business.tagline)}</div>
            </div>
          </div>
          <div className="sheet__seal" aria-hidden>
            <svg viewBox="0 0 64 64" width="58" height="58" fill="none">
              <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="32" cy="32" r="24.5" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.2 2.6" />
            </svg>
            <b>{RECEIPT_CODE[type]}</b>
          </div>
        </header>
        <p className="sheet__contact">
          {pick(business.address)}
          {business.phone ? ` · ${business.phone}` : ''}
          {business.licenseNo ? ` · ${t('sheet.licence', { no: business.licenseNo })}` : ''}
        </p>

        <div className="sheet__title">
          <h2>{t(`rtype.${type}`)}</h2>
          <dl>
            <div>
              <dt>{t('sheet.no')}</dt>
              <dd className="sheet__mono">{receipt.number}</dd>
            </div>
            <div>
              <dt>{t('sheet.date')}</dt>
              <dd>{f.date(receipt.date)}</dd>
            </div>
          </dl>
        </div>

        <section className="sheet__parties">
          <div>
            <h3>{t('sheet.customer')}</h3>
            <b className="sheet__who">{s.customerName}</b>
            <p>
              <span>{t('sheet.customerId')}</span> <span className="sheet__mono">{s.customerCode}</span>
            </p>
            <p>
              <span>{t('sheet.mobile')}</span> <span className="sheet__mono">{s.customerMobile}</span>
            </p>
            <p className="sheet__addr">{s.customerAddress}</p>
          </div>
          <div>
            <h3>{t('common.loan')}</h3>
            <b className="sheet__who sheet__mono">{s.loanNumber}</b>
            <p>
              <span>{t('sheet.pledgedOn')}</span> {f.date(s.disbursedOn)}
            </p>
            <p>
              <span>{t('sheet.principal')}</span> {f.money(s.principal)}
            </p>
            <p>
              <span>{t('sheet.rate')}</span> {f.pct(s.rate)} {t('common.perMonth')}
            </p>
          </div>
        </section>

        <section className="sheet__block">
          <h3>{itemsTitle}</h3>
          <table className="sheet__table">
            <thead>
              <tr>
                <th>{t('sheet.col.item')}</th>
                <th className="c">{t('sheet.col.carat')}</th>
                <th className="r">{t('sheet.col.weight')}</th>
                <th className="r">{t('sheet.col.tag')}</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((i) => (
                <tr key={i.ref}>
                  <td>
                    <b>{i.description}</b>
                    <span>{t(`cat.${i.category}`)}</span>
                  </td>
                  <td className="c">{f.digits(i.carat)}</td>
                  <td className="r">{f.weight(i.netWeight)}</td>
                  <td className="r sheet__mono">{i.tagNo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t('sheet.totalWeight')}</td>
                <td className="r">{f.weight(totalNet)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </section>

        <section className={`sheet__amount${nil ? ' is-nil' : ''}`}>
          <div>
            <span>{nil ? t('sheet.amount.releaseNil') : amountLabel}</span>
            {nil ? null : <b>{f.money(receipt.amount)}</b>}
          </div>
          {nil ? null : (
            <p>
              <em>{t('sheet.words')}:</em> {f.words(receipt.amount)}
            </p>
          )}
          {s.method ? (
            <p className="sheet__pay">
              <span>{t('sheet.method')}</span> <b>{t(`method.${s.method}`)}</b>
              {s.reference ? (
                <>
                  {' · '}
                  <span>{t('sheet.reference')}</span> <b className="sheet__mono">{s.reference}</b>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        {primary || balance ? (
          <div className="sheet__cols">
            {primary}
            {balance}
          </div>
        ) : null}

        {type === 'release' ? <p className="sheet__ack">{t('sheet.releasedNote')}</p> : null}

        <footer className="sheet__foot">
          <div className="sheet__sigs">
            <div>
              <i />
              <span>{t('sheet.sig.customer')}</span>
            </div>
            <div>
              <i />
              <span>{t('sheet.sig.staff')}</span>
              <small>{t('sheet.by', { name: s.receivedBy })}</small>
            </div>
          </div>
          <div className="sheet__fine">
            <div className="sheet__fine-text">
              {type === 'new_loan' ? <p>{t('sheet.keep')}</p> : null}
              <p>{pick(business.receiptFooter)}</p>
            </div>
            <div className="sheet__verify">
              <QrMark text={verify} />
              <span>{t('sheet.verify')}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
});
