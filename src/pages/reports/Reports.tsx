import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { AlarmClock, CalendarRange, Download, FileSpreadsheet, FileUser, HandCoins, Hourglass, Percent, Printer, Scale, Vault, Wallet, X, type LucideIcon } from 'lucide-react';
import { Card, CardHead, EmptyState, PageHeader } from '../../components/blocks';
import { Button, Segmented } from '../../components/controls';
import { Combobox, DateField, type ComboOption } from '../../components/pickers';
import { StatTile } from '../../components/lists';
import { gsap, useGSAP } from '../../motion/gsap';
import { fullMotion, usePageFX } from '../../motion/fx';
import { useCan, useDb, useFmt, useLang, useRows, useT, useToday, useUser } from '../../lib/hooks';
import { addMonths, endOfMonth, startOfMonth, type ISODate } from '../../lib/dates';
import { makeFmt } from '../../lib/format';
import { makeT } from '../../lib/i18n';
import { canPrint, saveCsv, saveFile } from '../../lib/files';
import { cx } from '../../lib/cx';
import { toast } from '../../lib/ui';
import type { Lang, Permission } from '../../lib/types';
import { REPORT_IDS, buildReport, reportCsv, type Cell, type Kpi, type Params, type Report, type ReportId, type Section } from './build';
import { PAGE, paginate } from './paginate';
import { ReportPages } from './ReportPaper';

// ---------------------------------------------------------------------------
// What each report needs
// ---------------------------------------------------------------------------
type Preset = 'today' | 'month' | 'last' | 'year' | 'all';
interface Range {
  preset: Preset | 'custom';
  from: ISODate | '';
  to: ISODate | '';
}

const CFG: Record<ReportId, { icon: LucideIcon; period: boolean; customer?: boolean; preset: Preset }> = {
  collections: { icon: Wallet, period: true, preset: 'month' },
  interest: { icon: Percent, period: true, preset: 'month' },
  disbursement: { icon: HandCoins, period: true, preset: 'all' },
  outstanding: { icon: Hourglass, period: false, preset: 'all' },
  overdue: { icon: AlarmClock, period: false, preset: 'all' },
  custody: { icon: Vault, period: false, preset: 'all' },
  monthly: { icon: CalendarRange, period: false, preset: 'all' },
  statement: { icon: FileUser, period: true, customer: true, preset: 'all' },
  reconcile: { icon: Scale, period: false, preset: 'all' },
};

function presetRange(p: Preset, today: ISODate): Range {
  switch (p) {
    case 'today': return { preset: p, from: today, to: today };
    case 'month': return { preset: p, from: startOfMonth(today), to: today };
    case 'last': {
      const prev = addMonths(startOfMonth(today), -1);
      return { preset: p, from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case 'year': return { preset: p, from: `${today.slice(0, 4)}-01-01`, to: today };
    default: return { preset: p, from: '', to: '' };
  }
}

const LIMIT = 100;
const COPY_LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'bn', label: 'বাংলা' },
];

/** Links in a report only appear when the signed-in role may open the page they lead to. */
const LINK_PERM: [string, Permission][] = [
  ['/customers', 'customers.view'],
  ['/loans', 'loans.view'],
  ['/receipts', 'receipts.view'],
  ['/vault', 'items.view'],
];

// ---------------------------------------------------------------------------
// The picker: a sliding marker follows the chosen report
// ---------------------------------------------------------------------------
function Picker({ value, onChange }: { value: ReportId; onChange: (id: ReportId) => void }) {
  const t = useT();
  const lang = useLang();
  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  const place = useCallback((animate: boolean) => {
    const r = root.current;
    const th = thumb.current;
    const btn = r?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!r || !th || !btn) return;
    const vars = { x: btn.offsetLeft, y: btn.offsetTop, width: btn.offsetWidth, height: btn.offsetHeight };
    if (animate && fullMotion()) gsap.to(th, { ...vars, duration: 0.6, ease: 'igh', overwrite: true });
    else gsap.set(th, vars);
    // on a narrow screen the picker scrolls sideways: keep the chosen report in view
    if (r.scrollWidth > r.clientWidth + 2) r.scrollTo({ left: Math.max(0, btn.offsetLeft - (r.clientWidth - btn.offsetWidth) / 2), behavior: animate ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    place(!first.current);
    first.current = false;
  }, [value, lang, place]);
  useEffect(() => {
    const r = root.current;
    if (!r || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(r);
    void document.fonts?.ready.then(() => place(false));
    return () => ro.disconnect();
  }, [place]);

  return (
    <nav className="rpick" aria-label={t('rep.pick')} ref={root}>
      <span className="rpick__thumb" ref={thumb} aria-hidden />
      {REPORT_IDS.map((id) => {
        const Icon = CFG[id].icon;
        return (
          <button key={id} type="button" className="rpick__btn" aria-current={id === value} onClick={() => onChange(id)}>
            <span className="rpick__icon"><Icon size={17} aria-hidden /></span>
            <span className="rpick__name">{t(`rep.r.${id}.name`)}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Report tables on screen
// ---------------------------------------------------------------------------
function CellView({ cell, align, canOpen }: { cell: Cell; align?: 'l' | 'r' | 'c'; canOpen: (to: string) => boolean }) {
  const cls = cx(align === 'r' && 'r', align === 'c' && 'c', cell.tone && `rtone-${cell.tone}`, cell.strong && 'is-strong', cell.mono && 'mono', (align === 'r' || cell.mono) && 'num');
  return <td className={cls}>{cell.to && canOpen(cell.to) ? <Link className="link" to={cell.to}>{cell.text}</Link> : cell.text}</td>;
}

function SectionCard({ sec, canOpen, delay }: { sec: Section; canOpen: (to: string) => boolean; delay: number }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const rows = all ? sec.rows : sec.rows.slice(0, LIMIT);
  const more = sec.rows.length - LIMIT;
  return (
    <Card className="list-card rsec" data-fx="rise" data-fx-delay={delay}>
      {sec.title ? <CardHead title={sec.title} sub={sec.note} actions={sec.rows.length ? <span className="rsec__count">{t('rep.rows', { n: sec.rows.length })}</span> : null} /> : null}
      {sec.rows.length === 0 ? (
        <p className="rsec__empty">{sec.empty ?? '—'}</p>
      ) : (
        <>
          <div className="tbl-wrap">
            <table className="tbl tbl--dense" style={{ minWidth: Math.max(520, sec.cols.length * 112) }}>
              <thead>
                <tr>
                  {sec.cols.map((c, i) => (
                    <th key={i} className={cx(c.align === 'r' && 'r', c.align === 'c' && 'c')}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <CellView key={ci} cell={cell} align={sec.cols[ci]?.align} canOpen={canOpen} />
                    ))}
                  </tr>
                ))}
              </tbody>
              {sec.foot ? (
                <tfoot>
                  <tr>
                    {sec.foot.map((cell, ci) => (
                      <CellView key={ci} cell={cell} align={sec.cols[ci]?.align} canOpen={canOpen} />
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {more > 0 ? (
            <div className="tbl-foot-note rsec__more">
              <span>{all ? t('rep.rows', { n: sec.rows.length }) : t('rep.firstRows', { n: LIMIT, m: sec.rows.length })}</span>
              <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
                {all ? t('rep.showFewer') : t('rep.showAll', { n: sec.rows.length })}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  const tone = (k: Kpi) => (k.tone === 'muted' ? undefined : k.tone);
  return (
    <div className="stat-strip rkpis" style={{ ['--n' as string]: Math.min(4, kpis.length) }} data-fx-group data-stagger="0.06">
      {kpis.map((k, i) => (
        <StatTile key={i} label={k.label} value={k.value} sub={k.sub} tone={tone(k)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paper view: the same pages the PDF and the print-out hold, fitted to the screen
// ---------------------------------------------------------------------------
function PaperStage({ report, ctx }: { report: Report; ctx: PaperCtx }) {
  const dim = report.landscape ? PAGE.landscape : PAGE.portrait;
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const pages = useMemo(() => paginate(report), [report]);
  const measure = useCallback(() => {
    const st = stage.current;
    if (!st) return;
    const cs = getComputedStyle(st);
    const room = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    setScale(Math.max(0.28, Math.min(1, room / dim.w)));
  }, [dim.w]);
  useLayoutEffect(() => {
    measure();
    const st = stage.current;
    if (!st || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(st);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="rstage" ref={stage}>
      {pages.map((pg, i) => (
        <div key={i} className="rstage__fit" data-fx="rise" data-fx-delay={i === 0 ? 0 : 0.05} style={{ width: dim.w * scale, height: dim.h * scale }}>
          <div className="rstage__scale" style={{ width: dim.w, height: dim.h, transform: `scale(${scale})` }}>
            <ReportPages report={report} pages={[pg]} business={ctx.business} lang={ctx.lang} today={ctx.today} by={ctx.by} offset={i} total={pages.length} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface PaperCtx {
  business: ReturnType<typeof useDb>['settings']['business'];
  lang: Lang;
  today: ISODate;
  by: string;
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------
async function renderPdf(host: HTMLElement, landscape: boolean, title: string): Promise<Blob> {
  const { toJpeg, getFontEmbedCSS } = await import('html-to-image');
  const { jsPDF } = await import('jspdf');
  await document.fonts?.ready;
  const nodes = Array.from(host.querySelectorAll<HTMLElement>('.rpage'));
  if (!nodes.length) throw new Error('no pages');
  const orientation = landscape ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  const W = landscape ? 297 : 210;
  const H = landscape ? 210 : 297;
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const img = await toJpeg(node, {
      quality: 0.94,
      pixelRatio: 2,
      backgroundColor: '#fffefa',
      width: node.offsetWidth,
      height: node.offsetHeight,
      fontEmbedCSS,
      style: { margin: '0', transform: 'none' },
    });
    if (i > 0) pdf.addPage('a4', orientation);
    pdf.addImage(img, 'JPEG', 0, 0, W, H, undefined, 'FAST');
    // let the browser breathe between big pages
    await new Promise((r) => setTimeout(r, 0));
  }
  pdf.setProperties({ title, creator: 'Ithika Gold House' });
  return pdf.output('blob');
}

const nextFrames = () => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
type View = 'screen' | 'paper';
type Job = null | 'pdf' | 'print';

export function Reports() {
  const t = useT();
  const f = useFmt();
  const uiLang = useLang();
  const db = useDb();
  const rows = useRows();
  const today = useToday();
  const user = useUser();
  const canCustomers = useCan('customers.view');
  const canLoans = useCan('loans.view');
  const canReceipts = useCan('receipts.view');
  const canItems = useCan('items.view');
  const [sp, setSp] = useSearchParams();

  const rid = sp.get('r');
  const id: ReportId = (REPORT_IDS as readonly string[]).includes(rid ?? '') ? (rid as ReportId) : 'collections';
  const cfg = CFG[id];
  const customerId = cfg.customer ? sp.get('c') ?? '' : '';

  const [picked, setPicked] = useState<Range | null>(null);
  const range = picked ?? presetRange(cfg.preset, today);
  const [view, setView] = useState<View>('screen');
  const [copyLang, setCopyLang] = useState<Lang>(uiLang);
  const [job, setJob] = useState<Job>(null);
  const ghost = useRef<HTMLDivElement>(null);
  useEffect(() => setCopyLang(uiLang), [uiLang]);

  const key = `${id}|${uiLang}|${view}|${copyLang}|${customerId}|${cfg.period ? `${range.from}|${range.to}` : ''}`;
  const ref = usePageFX([key]);

  // the frame around the results arrives once; the results themselves reveal as they scroll into view
  useGSAP(
    () => {
      if (!fullMotion()) return;
      gsap.from('.rpt__side', { x: -34, opacity: 0, duration: 1, ease: 'igh', clearProps: 'transform,opacity' });
      gsap.from('.rpick__btn', { x: -14, opacity: 0, duration: 0.8, ease: 'igh', stagger: 0.045, delay: 0.1, clearProps: 'transform,opacity' });
      gsap.from('.rhead', { y: 30, opacity: 0, duration: 1, ease: 'igh', delay: 0.06, clearProps: 'transform,opacity' });
    },
    { scope: ref },
  );

  const params = useMemo<Params>(() => ({ from: cfg.period ? range.from : '', to: cfg.period ? range.to : '', customerId }), [cfg.period, range.from, range.to, customerId]);
  const screen = useMemo(() => buildReport(id, db, params, uiLang, today, rows), [id, db, params, uiLang, today, rows]);
  const copy = useMemo(() => (copyLang === uiLang ? screen : buildReport(id, db, params, copyLang, today, rows)), [copyLang, uiLang, screen, id, db, params, today, rows]);
  const copyPages = useMemo(() => (job || view === 'paper' ? paginate(copy) : []), [job, view, copy]);

  const canOpen = useCallback(
    (to: string) => {
      const hit = LINK_PERM.find(([prefix]) => to.startsWith(prefix));
      if (!hit) return true;
      const ok: Record<string, boolean> = { 'customers.view': canCustomers, 'loans.view': canLoans, 'receipts.view': canReceipts, 'items.view': canItems };
      return !!ok[hit[1]];
    },
    [canCustomers, canLoans, canReceipts, canItems],
  );

  const customerOptions = useMemo<ComboOption[]>(
    () => (cfg.customer ? db.customers.map((c) => ({ id: c.id, label: c.name, sub: c.code, search: `${c.name} ${c.mobile} ${c.code}`.toLowerCase() })) : []),
    [cfg.customer, db.customers],
  );

  const setId = (next: ReportId) => {
    const n = new URLSearchParams(sp);
    n.set('r', next);
    if (!CFG[next].customer) n.delete('c');
    setSp(n, { replace: true });
  };
  const setCustomer = (c: string | null) => {
    const n = new URLSearchParams(sp);
    if (c) n.set('c', c);
    else n.delete('c');
    setSp(n, { replace: true });
  };
  const choosePreset = (p: Preset) => setPicked(presetRange(p, today));
  const editDates = (from: ISODate | '', to: ISODate | '') => setPicked({ preset: 'custom', from, to });

  // ---- exports --------------------------------------------------------------------------------
  const copyT = useMemo(() => makeT(copyLang), [copyLang]);
  const copyF = useMemo(() => makeFmt(copyLang), [copyLang]);
  const fileName = (ext: string) => `${copy.fileBase}-${today}-${copyLang}.${ext}`;
  const generated = () => copyT('rep.paper.generated', { date: copyF.date(today), name: user.name });

  const exportCsv = async () => {
    const res = await saveCsv(fileName('csv'), reportCsv(copy, generated()));
    if (res === 'saved') toast.success(t('rep.saved'), fileName('csv'));
    else if (res === 'unsupported') toast.error(t('rep.fail'));
  };

  useEffect(() => {
    if (!job) return;
    let dead = false;
    void (async () => {
      try {
        await document.fonts?.ready;
        await nextFrames();
        if (dead) return;
        if (job === 'print') {
          window.print();
        } else if (ghost.current) {
          const blob = await renderPdf(ghost.current, copy.landscape, copy.title);
          if (dead) return;
          const res = await saveFile(fileName('pdf'), blob, 'application/pdf');
          if (res === 'saved') toast.success(t('rep.saved'), fileName('pdf'));
          else if (res === 'unsupported') toast.error(t('rep.fail'));
        }
      } catch {
        if (!dead) toast.error(t('rep.fail'));
      } finally {
        if (!dead) setJob(null);
      }
    })();
    return () => {
      dead = true;
    };
    // the export reads the latest report at the moment it starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const paperCtx: PaperCtx = { business: db.settings.business, lang: copyLang, today, by: user.name };
  const ready = !screen.needs;
  const printable = canPrint();
  const Icon = cfg.icon;

  return (
    <div ref={ref} className="page">
      <PageHeader title={t('nav.reports')} subtitle={t('rep.subtitle')} />

      <div className="rpt">
        <aside className="rpt__side">
          <Picker value={id} onChange={setId} />
        </aside>

        <div className="rpt__main">
          <Card className="rhead">
            <div className="rhead__top">
              <span className="rhead__icon"><Icon size={22} aria-hidden /></span>
              <div className="rhead__text">
                <h2 key={id}>{t(`rep.r.${id}.name`)}</h2>
                <p>{t(`rep.r.${id}.desc`)}</p>
              </div>
            </div>

            <div className="rhead__params">
              {cfg.customer ? (
                <Combobox
                  className="rhead__customer"
                  label={t('rep.m.customer')}
                  value={customerId || null}
                  onChange={setCustomer}
                  options={customerOptions}
                  placeholder={t('rep.p.chooseCustomer')}
                  searchPlaceholder={t('rep.p.searchCustomer')}
                  clearable
                />
              ) : null}
              {cfg.period ? (
                <div className="rhead__period">
                  <span className="field__label"><span>{t('rep.p.period')}</span></span>
                  <div className="rhead__period-row">
                    <Segmented<Preset>
                      label={t('rep.p.period')}
                      value={range.preset === 'custom' ? ('' as Preset) : range.preset}
                      onChange={choosePreset}
                      items={[
                        { id: 'today', label: t('rep.p.today') },
                        { id: 'month', label: t('rep.p.month') },
                        { id: 'last', label: t('rep.p.last') },
                        { id: 'year', label: t('rep.p.year') },
                        { id: 'all', label: t('rep.p.all') },
                      ]}
                    />
                    <div className="toolbar__dates">
                      <DateField value={range.from} onChange={(v) => editDates(v, range.to)} max={range.to || today} placeholder={t('common.from')} />
                      <DateField value={range.to} onChange={(v) => editDates(range.from, v)} min={range.from || undefined} max={today} placeholder={t('common.to')} />
                      {range.from || range.to ? (
                        <Button size="sm" variant="ghost" icon={<X size={15} />} aria-label={t('common.clear')} onClick={() => choosePreset('all')} />
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {!cfg.period && !cfg.customer ? <p className="rhead__live">{t('rep.live', { date: f.date(today) })}</p> : null}
            </div>

            <div className="rhead__bar">
              <Segmented<View>
                label={t('rep.view.label')}
                value={view}
                onChange={setView}
                items={[
                  { id: 'screen', label: t('rep.view.screen') },
                  { id: 'paper', label: t('rep.view.paper') },
                ]}
              />
              <span className="rhead__spacer" />
              <div className="rhead__lang">
                <span className="field__label"><span>{t('rep.paperLang')}</span></span>
                <Segmented<Lang> label={t('rep.paperLang')} value={copyLang} onChange={setCopyLang} items={COPY_LANGS} />
              </div>
              <div className="rhead__actions">
                <Button icon={<FileSpreadsheet size={17} />} disabled={!ready || job !== null} onClick={() => void exportCsv()}>
                  {t('common.exportCsv')}
                </Button>
                {printable ? (
                  <Button icon={<Printer size={17} />} disabled={!ready || job !== null} loading={job === 'print'} onClick={() => setJob('print')}>
                    {t('common.print')}
                  </Button>
                ) : null}
                <Button variant="primary" icon={<Download size={17} />} disabled={!ready || job !== null} loading={job === 'pdf'} onClick={() => setJob('pdf')} magnetic>
                  {t('common.downloadPdf')}
                </Button>
              </div>
            </div>
            <p className="rhead__note">
              {t('rep.copyNote')}
              {printable ? '' : ` ${t('rcv.noPrint')}`}
            </p>
          </Card>

          <div className="rpt__results" key={key}>
            {screen.needs ? (
              <Card data-fx="rise">
                <EmptyState title={t('rep.needs.title')} body={t('rep.needs.body')} />
              </Card>
            ) : view === 'screen' ? (
              <>
                <KpiStrip kpis={screen.kpis} />
                {screen.sections.map((sec, i) => (
                  <SectionCard key={sec.id} sec={sec} canOpen={canOpen} delay={i === 0 ? 0 : 0.04} />
                ))}
              </>
            ) : (
              <>
                <p className="rpt__papernote">
                  {t('rep.paperNote')} <b>{t('rep.pages', { n: copyPages.length })}</b>
                </p>
                <PaperStage report={copy} ctx={paperCtx} />
              </>
            )}
          </div>
        </div>
      </div>

      {job === 'pdf'
        ? createPortal(
            <div className="rghost" ref={ghost} aria-hidden>
              <ReportPages report={copy} pages={copyPages} business={db.settings.business} lang={copyLang} today={today} by={user.name} />
            </div>,
            document.body,
          )
        : null}
      {job === 'print'
        ? createPortal(
            <div className="print-root print-root--report">
              <style>{`@page { size: A4 ${copy.landscape ? 'landscape' : 'portrait'}; margin: 0 }`}</style>
              <ReportPages report={copy} pages={copyPages} business={db.settings.business} lang={copyLang} today={today} by={user.name} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
