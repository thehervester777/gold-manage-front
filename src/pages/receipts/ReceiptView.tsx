import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { Download, FileImage, FileText, Printer } from 'lucide-react';
import { Card, CardHead, EmptyState, PageHeader } from '../../components/blocks';
import { Button, ButtonLink, Chip, Segmented } from '../../components/controls';
import { KV } from '../../components/lists';
import { PAGE_W, ReceiptSheet } from '../../components/ReceiptSheet';
import { gsap } from '../../motion/gsap';
import { fullMotion, usePageFX } from '../../motion/fx';
import { useCan, useDb, useFmt, useLang, useT } from '../../lib/hooks';
import { canPrint, saveFile } from '../../lib/files';
import { RECEIPT_CODE } from '../../lib/domain';
import { toast } from '../../lib/ui';
import type { Lang } from '../../lib/types';

function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Draws the A4 page as a JPEG. Twice the screen resolution is about 190 dpi on paper: sharp for print and small
 * as a file (a page of text is roughly a third of the size as a PNG, which would be over half a megabyte).
 */
async function paperToJpeg(node: HTMLElement, quality: number): Promise<string> {
  const { toJpeg } = await import('html-to-image');
  await document.fonts?.ready;
  const opts = {
    pixelRatio: 2,
    quality,
    backgroundColor: '#fffefa',
    width: node.offsetWidth,
    height: node.offsetHeight,
    style: { margin: '0', transform: 'none', boxShadow: 'none', borderRadius: '0' },
  };
  await toJpeg(node, opts); // the first pass warms fonts and images
  return toJpeg(node, opts);
}

export function ReceiptView() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const f = useFmt();
  const uiLang = useLang();
  const db = useDb();
  const ref = usePageFX([id]);
  const canLoan = useCan('loans.view');
  const canCust = useCan('customers.view');
  const receipt = db.receipts.find((r) => r.id === id);

  const [lang, setLang] = useState<Lang>(uiLang);
  const [busy, setBusy] = useState<null | 'pdf' | 'image'>(null);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, height: 1122 });

  // fit the sheet to the space available
  const measure = useCallback(() => {
    const st = stage.current;
    const sh = sheet.current;
    if (!st || !sh) return;
    const cs = getComputedStyle(st);
    const room = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const scale = Math.max(0.3, Math.min(1, room / PAGE_W));
    setFit({ scale, height: sh.offsetHeight });
  }, []);
  useLayoutEffect(() => {
    measure();
    const st = stage.current;
    const sh = sheet.current;
    if (!st || !sh || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(st);
    ro.observe(sh);
    return () => ro.disconnect();
  }, [measure, receipt?.id, lang]);

  // the paper is drawn onto the desk
  useEffect(() => {
    if (!fullMotion() || !paper.current || !sheet.current) return;
    const el = sheet.current;
    const ctx = gsap.context(() => {
      const parts = el.querySelectorAll('.sheet__head, .sheet__title, .sheet__parties, .sheet__block, .sheet__amount, .sheet__pay, .sheet__ack, .sheet__foot');
      gsap.set(parts, { opacity: 0, y: 12 });
      gsap
        .timeline({ defaults: { ease: 'igh' } })
        .fromTo(paper.current, { y: 46, opacity: 0, rotateX: 8, transformOrigin: '50% 0%' }, { y: 0, opacity: 1, rotateX: 0, duration: 1.1, clearProps: 'transform,opacity' })
        .to(parts, { opacity: 1, y: 0, duration: 0.75, stagger: 0.06, clearProps: 'transform,opacity' }, 0.25)
        .fromTo(el.querySelector('.sheet__seal'), { scale: 1.5, rotate: -18, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.8, ease: 'back.out(1.6)', clearProps: 'transform,opacity' }, 0.7);
    }, paper);
    return () => ctx.revert();
  }, [receipt?.id, lang]);

  if (!receipt) {
    return (
      <Card style={{ marginTop: 24 }}>
        <EmptyState title={t('rcv.notFound')} body={t('rcv.notFoundBody')} action={<ButtonLink to="/receipts" variant="primary">{t('rcp.title')}</ButtonLink>} />
      </Card>
    );
  }

  const issuer = db.users.find((u) => u.id === receipt.createdBy)?.name ?? receipt.snapshot.receivedBy;
  const siblings = db.receipts.filter((r) => r.loanId === receipt.loanId && r.id !== receipt.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const together = siblings.filter((r) => receipt.paymentId && r.paymentId === receipt.paymentId);
  const others = siblings.filter((r) => !together.includes(r)).slice(0, 5);
  const fileBase = `${receipt.number}-${lang}`;

  const exportAs = async (kind: 'pdf' | 'image') => {
    const node = sheet.current;
    if (!node) return;
    setBusy(kind);
    try {
      let res;
      if (kind === 'image') {
        const jpg = await paperToJpeg(node, 0.92);
        res = await saveFile(`${fileBase}.jpg`, dataUrlToBlob(jpg), 'image/jpeg');
      } else {
        // one A4 portrait page (210 x 297 mm), the receipt filling it edge to edge
        const jpg = await paperToJpeg(node, 0.82);
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        pdf.addImage(jpg, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        pdf.setProperties({ title: receipt.number, subject: receipt.snapshot.loanNumber, creator: 'Ithika Gold House' });
        res = await saveFile(`${fileBase}.pdf`, pdf.output('blob'), 'application/pdf');
      }
      if (res === 'saved') toast.success(t('rcv.saved'), receipt.number);
      else if (res === 'unsupported') toast.error(t('rcv.pdf.fail'));
    } catch {
      toast.error(t('rcv.pdf.fail'));
    } finally {
      setBusy(null);
    }
  };

  const printable = canPrint();

  return (
    <div ref={ref} className="page">
      <PageHeader
        crumbs={[{ label: t('rcp.title'), to: '/receipts' }, { label: receipt.number }]}
        title={<span className="mono loan-title">{receipt.number}</span>}
        badge={<Chip tone="gold" large>{t(`rtype.${receipt.type}`)}</Chip>}
        actions={
          <>
            {printable ? <Button icon={<Printer size={17} />} onClick={() => window.print()}>{t('common.print')}</Button> : null}
            <Button variant="primary" icon={<Download size={17} />} loading={busy === 'pdf'} disabled={busy !== null} onClick={() => void exportAs('pdf')} magnetic>
              {t('common.downloadPdf')}
            </Button>
          </>
        }
      />

      <div className="rcv">
        <div className="rcv__stage" ref={stage} data-fx="fade">
          <div className="rcv__fit" style={{ width: PAGE_W * fit.scale, height: fit.height * fit.scale }}>
            <div style={{ width: PAGE_W, transform: `scale(${fit.scale})`, transformOrigin: '0 0' }}>
              <div className="rcv__paper" ref={paper} style={{ perspective: 1200 }}>
                <ReceiptSheet ref={sheet} receipt={receipt} business={db.settings.business} lang={lang} />
              </div>
            </div>
          </div>
        </div>

        <div className="rcv__side">
          <Card className="rcv__tools" data-fx="rise" data-fx-delay="0.1">
            <div className="rcv__lang">
              <span className="field__label"><span>{t('rcv.language')}</span></span>
              <Segmented<Lang>
                label={t('rcv.language')}
                value={lang}
                onChange={setLang}
                items={[
                  { id: 'en', label: 'English' },
                  { id: 'bn', label: 'বাংলা' },
                ]}
              />
            </div>
            <Button variant="secondary" icon={<FileText size={17} />} loading={busy === 'pdf'} disabled={busy !== null} onClick={() => void exportAs('pdf')}>
              {t('common.downloadPdf')}
            </Button>
            <Button variant="secondary" icon={<FileImage size={17} />} loading={busy === 'image'} disabled={busy !== null} onClick={() => void exportAs('image')}>
              {t('rcv.png')}
            </Button>
            {printable ? null : <p className="rcv__note">{t('rcv.noPrint')}</p>}
          </Card>

          <Card data-fx="rise" data-fx-delay="0.18">
            <CardHead title={t('rcv.details')} />
            <div className="rcv__rows">
              <KV
                tight
                items={[
                  { label: t('rcp.col.type'), value: <span><span className={`rtag rtag--${receipt.type}`} style={{ display: 'inline-grid', width: 26, height: 26, borderRadius: 8, fontSize: 11, marginRight: 8, verticalAlign: 'middle' }}>{RECEIPT_CODE[receipt.type]}</span>{t(`rtype.${receipt.type}`)}</span> },
                  { label: t('rcv.issued'), value: f.dateTime(receipt.createdAt) },
                  { label: t('rcv.issuedBy'), value: issuer },
                  { label: t('common.customer'), value: canCust ? <Link className="link" to={`/customers/${receipt.customerId}`}>{receipt.snapshot.customerName}</Link> : receipt.snapshot.customerName },
                  { label: t('common.loan'), value: canLoan ? <Link className="link mono" to={`/loans/${receipt.loanId}`}>{receipt.snapshot.loanNumber}</Link> : <span className="mono">{receipt.snapshot.loanNumber}</span> },
                ]}
              />
            </div>
          </Card>

          {together.length ? (
            <Card data-fx="rise" data-fx-delay="0.24">
              <CardHead title={t('rcv.together')} />
              <ul className="mini-list">
                {together.map((r) => (
                  <li key={r.id}>
                    <Link to={`/receipts/${r.id}`} className="mini-row">
                      <span className={`rtag rtag--${r.type}`}>{RECEIPT_CODE[r.type]}</span>
                      <span className="cell-main grow"><b className="mono">{r.number}</b><span>{t(`rtype.${r.type}`)}</span></span>
                      <b className="num">{r.amount ? f.money(r.amount) : '—'}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {others.length ? (
            <Card data-fx="rise" data-fx-delay="0.28">
              <CardHead title={t('rcv.otherReceipts')} />
              <ul className="mini-list">
                {others.map((r) => (
                  <li key={r.id}>
                    <Link to={`/receipts/${r.id}`} className="mini-row">
                      <span className={`rtag rtag--${r.type}`}>{RECEIPT_CODE[r.type]}</span>
                      <span className="cell-main grow"><b className="mono">{r.number}</b><span>{f.date(r.date)}</span></span>
                      <b className="num">{r.amount ? f.money(r.amount) : '—'}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="rcv__note" style={{ padding: '0 6px' }}>{t('rcv.frozen')}</p>
        </div>
      </div>

      {printable ? createPortal(<div className="print-root print-root--receipt"><ReceiptSheet receipt={receipt} business={db.settings.business} lang={lang} /></div>, document.body) : null}
    </div>
  );
}
