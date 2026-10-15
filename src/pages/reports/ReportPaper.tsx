import { useMemo, type CSSProperties } from 'react';
import { LogoMark } from '../../components/Logo';
import { makeT } from '../../lib/i18n';
import { makeFmt } from '../../lib/format';
import type { ISODate } from '../../lib/dates';
import type { Lang, Settings } from '../../lib/types';
import type { Cell, Col, Kpi, Report } from './build';
import {
  BRAND_H, EMPTY_H, FOOT_H, FOOT_ROW_H, HEAD_GAP, KPI_H, META_ROW_H, PAD_BOTTOM, PAD_TOP, PAD_X, PAGE, ROW_H, RUN_H, SEC_GAP, SEC_TITLE_H, THEAD_H, TITLE_GAP, TITLE_H,
  headHeight, noteHeight, textWidth, type Frag, type PageSpec,
} from './paginate';

const ALIGN: Record<NonNullable<Col['align']>, CSSProperties['textAlign']> = { l: 'left', r: 'right', c: 'center' };

/** Money should never be cut short, so the figure shrinks to fit its tile instead. */
function kpiSize(k: Kpi, tileWidth: number): number {
  const room = tileWidth - 30;
  const fit = room / Math.max(1, textWidth(k.value, 1) * 1.04);
  return Math.max(12.5, Math.min(23, Math.floor(fit * 2) / 2));
}

function PaperCell({ cell, col, foot }: { cell: Cell; col: Col; foot?: boolean }) {
  const cls = ['rtbl__td', cell.tone && `is-${cell.tone}`, cell.strong && 'is-strong', cell.mono && 'is-mono'].filter(Boolean).join(' ');
  return (
    <td className={cls} style={{ textAlign: ALIGN[col.align ?? 'l'], height: foot ? FOOT_ROW_H : ROW_H }}>
      {cell.text}
    </td>
  );
}

function FragView({ fr, first, lang, width }: { fr: Frag; first: boolean; lang: Lang; width: number }) {
  const t = useMemo(() => makeT(lang), [lang]);
  const { sec } = fr;
  const totalWeight = sec.cols.reduce((a, c) => a + (c.weight ?? 1), 0) || 1;
  const noteH = noteHeight(sec, width);
  return (
    <section className="rfrag" style={{ marginTop: first ? 0 : SEC_GAP }}>
      {sec.title ? (
        <h3 className="rfrag__title" style={{ height: SEC_TITLE_H }}>
          {sec.title}
          {fr.cont ? <em>{t('rep.paper.cont')}</em> : null}
        </h3>
      ) : null}
      {!fr.cont && sec.note ? (
        <p className={`rfrag__note${noteH > 24 ? ' is-two' : ''}`} style={{ height: noteH }}>
          {sec.note}
        </p>
      ) : null}
      {fr.empty ? (
        <div className="rfrag__empty" style={{ height: EMPTY_H }}>
          {sec.empty ?? '—'}
        </div>
      ) : (
        <table className="rtbl">
          <colgroup>
            {sec.cols.map((c, i) => (
              <col key={i} style={{ width: `${((c.weight ?? 1) / totalWeight) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ height: THEAD_H }}>
              {sec.cols.map((c, i) => (
                <th key={i} style={{ textAlign: ALIGN[c.align ?? 'l'], height: THEAD_H }}>
                  <span>{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sec.rows.slice(fr.from, fr.to).map((row, ri) => (
              <tr key={ri} style={{ height: ROW_H }}>
                {row.map((cell, ci) => (
                  <PaperCell key={ci} cell={cell} col={sec.cols[ci] ?? {}} />
                ))}
              </tr>
            ))}
          </tbody>
          {fr.foot && sec.foot ? (
            <tfoot>
              <tr style={{ height: FOOT_ROW_H }}>
                {sec.foot.map((cell, ci) => (
                  <PaperCell key={ci} cell={cell} col={sec.cols[ci] ?? {}} foot />
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      )}
    </section>
  );
}

interface Props {
  report: Report;
  pages: PageSpec[];
  business: Settings['business'];
  lang: Lang;
  today: ISODate;
  by: string;
  /** When pages are drawn one at a time (to fit the screen), where this batch starts and how many there are in all. */
  offset?: number;
  total?: number;
}

/**
 * The printed report: fixed A4 pages laid out by `paginate`, in the language chosen for the copy.
 * It stays warm-white paper with dark ink in both themes, and every height is fixed so what is
 * on screen is exactly what the PDF and the print-out hold.
 */
export function ReportPages({ report, pages, business, lang, today, by, offset = 0, total }: Props) {
  const t = useMemo(() => makeT(lang), [lang]);
  const f = useMemo(() => makeFmt(lang), [lang]);
  const dim = report.landscape ? PAGE.landscape : PAGE.portrait;
  const pick = (b: { en: string; bn: string }) => b[lang] || b.en;
  const name = pick(business.name);
  const contact = [business.phone, business.email].filter(Boolean).join('   ');
  const all = total ?? pages.length;
  const contentW = dim.w - PAD_X * 2;
  const kpiW = (contentW - 10 * (report.kpis.length - 1)) / Math.max(1, report.kpis.length);

  return (
    <>
      {pages.map((pg, pi) => (
        <div
          key={pi}
          className={`rpage${report.landscape ? ' rpage--land' : ''}`}
          lang={lang}
          data-page={offset + pi + 1}
          style={{ width: dim.w, height: dim.h, padding: `${PAD_TOP}px ${PAD_X}px 0` }}
        >
          <div className="rpage__streak" aria-hidden />

          {pg.first ? (
            <header className="rpage__head" style={{ height: headHeight(report) }}>
              <div className="rpage__brand" style={{ height: BRAND_H }}>
                <div className="rpage__who">
                  <LogoMark size={44} />
                  <div>
                    <b>{name}</b>
                    <span>{pick(business.tagline)}</span>
                  </div>
                </div>
                <div className="rpage__contact">
                  <span>{pick(business.address)}</span>
                  <span className="is-mono">{contact}</span>
                </div>
              </div>
              <div className="rpage__title" style={{ height: TITLE_H, marginTop: TITLE_GAP }}>
                <h1>{report.title}</h1>
                <p>{report.subtitle}</p>
              </div>
              <dl className="rpage__meta" style={{ gridAutoRows: META_ROW_H }}>
                {report.meta.map((m, i) => (
                  <div key={i} className={m.wide ? 'is-wide' : undefined}>
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
              <span aria-hidden style={{ display: 'block', height: HEAD_GAP }} />
            </header>
          ) : (
            <header className="rpage__run" style={{ height: RUN_H }}>
              <div className="rpage__who">
                <LogoMark size={24} />
                <b>{name}</b>
              </div>
              <div className="rpage__runtitle">
                <b>{report.title}</b>
                <em>{t('rep.paper.cont')}</em>
              </div>
            </header>
          )}

          {pg.first && report.kpis.length ? (
            <div className="rpage__kpis" style={{ height: KPI_H }}>
              {report.kpis.map((k, i) => (
                <div key={i} className={`rkpi${k.tone ? ` is-${k.tone}` : ''}`}>
                  <span className="rkpi__label">{k.label}</span>
                  <b className="rkpi__value" style={{ fontSize: kpiSize(k, kpiW) }}>{k.value}</b>
                  {k.sub ? <span className="rkpi__sub">{k.sub}</span> : null}
                </div>
              ))}
            </div>
          ) : null}

          <div className="rpage__body">
            {pg.frags.map((fr, i) => (
              <FragView key={i} fr={fr} first={i === 0} lang={lang} width={dim.w} />
            ))}
          </div>

          <footer className="rpage__foot" style={{ left: PAD_X, right: PAD_X, bottom: PAD_BOTTOM, height: FOOT_H }}>
            <span>{t('rep.paper.generated', { date: f.date(today), name: by })}</span>
            <span className="is-page">{t('rep.paper.page', { a: offset + pi + 1, b: all })}</span>
          </footer>
        </div>
      ))}
    </>
  );
}
