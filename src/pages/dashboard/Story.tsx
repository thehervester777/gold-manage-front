/**
 * "The portfolio, step by step" — the dashboard's scroll story.
 * On wide screens the section pins to the viewport and ScrollTrigger scrubs one
 * timeline through three chapters: what the vault holds, what is lent against it,
 * what it has earned. On narrow screens, or with calm motion, the same three
 * chapters simply stack as ordinary cards.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Donut, Ring, type DonutSegment } from '../../components/charts';
import { Card } from '../../components/blocks';
import { gsap, ScrollTrigger, useGSAP } from '../../motion/gsap';
import { useApp } from '../../lib/store';
import { useFmt, usePortfolio, useT } from '../../lib/hooks';
import type { Fmt } from '../../lib/format';
import { GRAMS_PER_VORI } from '../../lib/format';
import type { Portfolio } from '../../lib/selectors';
import type { TFn } from '../../lib/i18n';

const CARAT_COLORS: Record<number, string> = { 24: 'var(--c1)', 22: 'var(--c2)', 21: 'var(--c3)', 18: 'var(--c4)' };

function useWide() {
  const [wide, setWide] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia('(min-width: 980px) and (min-height: 620px)').matches));
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 980px) and (min-height: 620px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

function useStory() {
  const pf = usePortfolio();
  return useMemo(() => {
    const segs: DonutSegment[] = pf.byCarat.map((b) => ({ id: String(b.carat), label: `${b.carat}K`, value: b.netWeight, color: CARAT_COLORS[b.carat] ?? 'var(--c5)' }));
    const lent = pf.principalOutstanding + pf.principalRepaid;
    const ltv = pf.custodyValuation > 0 ? pf.principalOutstanding / pf.custodyValuation : 0;
    const earnedMax = Math.max(pf.interestCollectedYear, pf.outstandingInterest, 1);
    return { pf, segs, lent, ltv, earnedMax };
  }, [pf]);
}

type Story = ReturnType<typeof useStory>;

// ---- chapter visuals -------------------------------------------------------------
function VaultVisual({ s, f, t }: { s: Story; f: Fmt; t: TFn }) {
  const { pf, segs } = s;
  return (
    <div className="sv sv--vault">
      <div className="sv-donut">
        <Donut segments={segs.length ? segs : [{ id: 'x', label: '', value: 1, color: 'var(--surface-3)' }]} size={252} thickness={26} animate={false}>
          <b className="serif-num sv-big" data-count="items">{f.n(pf.custodyItems)}</b>
          <span className="sv-cap">{t('dash.custody.items')}</span>
        </Donut>
      </div>
      <div className="sv-side">
        <ul className="sv-legend">
          {pf.byCarat.map((b) => (
            <li key={b.carat}>
              <i style={{ background: CARAT_COLORS[b.carat] ?? 'var(--c5)' }} />
              <b>{f.digits(b.carat)}K</b>
              <span className="muted">{t('common.itemCount', { n: b.count })}</span>
              <span className="num sv-legend__w">{f.weight(b.netWeight)}</span>
            </li>
          ))}
        </ul>
        <dl className="sv-stats">
          <div>
            <dt>{t('dash.custody.weight')}</dt>
            <dd><b className="serif-num" data-count="weight">{f.weight(pf.custodyWeight)}</b><span className="muted"> · {f.vori(pf.custodyWeight)}</span></dd>
          </div>
          <div>
            <dt>{t('dash.walk.valuation')}</dt>
            <dd><b className="serif-num" data-count="valuation">{f.money(pf.custodyValuation)}</b></dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function LentVisual({ s, f, t }: { s: Story; f: Fmt; t: TFn }) {
  const { pf, lent, ltv } = s;
  const out = lent > 0 ? pf.principalOutstanding / lent : 0;
  return (
    <div className="sv sv--lent">
      <div className="sv-donut">
        <Ring value={ltv} size={252} thickness={24} color="var(--c1)">
          <b className="serif-num sv-big" data-count="ltv">{f.pct(ltv * 100)}</b>
          <span className="sv-cap">{t('dash.walk.ltv')}</span>
        </Ring>
      </div>
      <div className="sv-side">
        <div className="sv-bars">
          <div className="sv-bar">
            <div className="sv-bar__head"><span>{t('dash.walk.outstandingPrincipal')}</span><b className="serif-num" data-count="outstanding">{f.money(pf.principalOutstanding)}</b></div>
            <div className="bar"><i className="sv-fill" data-to={out} style={{ ['--v' as string]: `${out * 100}%` }} /></div>
          </div>
          <div className="sv-bar">
            <div className="sv-bar__head"><span>{t('dash.walk.repaid')}</span><b className="serif-num" data-count="repaid">{f.money(pf.principalRepaid)}</b></div>
            <div className="bar bar--ok"><i className="sv-fill" data-to={1 - out} style={{ ['--v' as string]: `${(1 - out) * 100}%` }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EarnedVisual({ s, f, t }: { s: Story; f: Fmt; t: TFn }) {
  const { pf, earnedMax } = s;
  const cols = [
    { id: 'collected', label: t('dash.walk.collectedYear'), value: pf.interestCollectedYear, h: pf.interestCollectedYear / earnedMax, tone: 'gold' },
    { id: 'receivable', label: t('dash.walk.receivable'), value: pf.outstandingInterest, h: pf.outstandingInterest / earnedMax, tone: 'ghost' },
  ];
  return (
    <div className="sv sv--earned">
      <div className="sv-cols">
        {cols.map((c) => (
          <div key={c.id} className="sv-col">
            <b className="serif-num sv-colval" data-count={c.id}>{f.money(c.value)}</b>
            <div className="sv-col__track">
              <i className={`sv-col__bar sv-col__bar--${c.tone}`} data-to={c.h} style={{ height: `${Math.max(4, c.h * 100)}%` }} />
            </div>
            <span className="sv-col__label">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const steps = [
  { key: 's1', Visual: VaultVisual },
  { key: 's2', Visual: LentVisual },
  { key: 's3', Visual: EarnedVisual },
] as const;

// ---- static stack ------------------------------------------------------------------
function StaticStory() {
  const t = useT();
  const f = useFmt();
  const s = useStory();
  return (
    <section className="story story--static" aria-labelledby="story-title">
      <header className="story__head" data-fx="rise">
        <h2 className="h2" id="story-title">{t('dash.walk.title')}</h2>
        <p className="muted">{t('dash.walk.sub')}</p>
      </header>
      <div className="story__stack" data-fx-group data-stagger="0.1">
        {steps.map((st, i) => (
          <Card key={st.key} className="story__card" pad>
            <div className="story__text">
              <span className="story__num">{f.digits(i + 1)}</span>
              <h3 className="h2">{t(`dash.walk.${st.key}.title`)}</h3>
              <p className="muted">{t(`dash.walk.${st.key}.body`)}</p>
            </div>
            <st.Visual s={s} f={f} t={t} />
          </Card>
        ))}
      </div>
    </section>
  );
}

// ---- pinned scene ----------------------------------------------------------------------
function counter(el: Element | null, to: number, fmt: (v: number) => string, at: number, dur: number, tl: gsap.core.Timeline) {
  if (!el) return;
  const o = { v: 0 };
  tl.fromTo(o, { v: 0 }, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => void (el.textContent = fmt(o.v)) }, at);
}

function PinnedStory() {
  const t = useT();
  const f = useFmt();
  const s = useStory();
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const motion = useApp((st) => st.prefs.motion);

  const data = s;

  useGSAP(
    () => {
      const el = root.current;
      const pinEl = pin.current;
      if (!el || !pinEl) return;
      const q = gsap.utils.selector(el);
      const stepEls = q('.story__step');
      const visEls = q('.sv');
      const { pf } = data;

      // chapter 1 plays on entry (time based) so the section never looks empty at first sight
      const arcs = q('.sv--vault .dn-arc') as unknown as SVGCircleElement[];
      const lens = arcs.map((a) => parseFloat(a.dataset.len ?? '0'));
      const C = arcs.length ? parseFloat(arcs[0].dataset.c ?? '1') : 1;
      gsap.set(arcs, { strokeDasharray: `0 ${C}` });
      const intro = gsap.timeline({ paused: true });
      arcs.forEach((a, i) => intro.to(a, { strokeDasharray: `${lens[i]} ${C}`, duration: 1.3, ease: 'igh' }, i * 0.12));
      counter(q('[data-count="items"]')[0], pf.custodyItems, (v) => f.n(Math.round(v)), 0, 1.4, intro);
      counter(q('[data-count="weight"]')[0], pf.custodyWeight, (v) => f.weight(v), 0, 1.4, intro);
      counter(q('[data-count="valuation"]')[0], pf.custodyValuation, (v) => f.money(Math.round(v)), 0, 1.6, intro);
      ScrollTrigger.create({ trigger: el, start: 'top 75%', once: true, onEnter: () => void intro.play() });

      // chapters 2 and 3 hidden until the scrub reaches them
      gsap.set(stepEls.slice(1), { autoAlpha: 0, y: 36 });
      gsap.set(visEls.slice(1), { autoAlpha: 0, y: 36, scale: 0.96 });
      const ring = q('.sv--lent circle[data-ring-len]')[0] as unknown as SVGCircleElement | undefined;
      const ringC = ring ? parseFloat(ring.dataset.ringLen ?? '1') : 1;
      if (ring) gsap.set(ring, { strokeDasharray: `0 ${ringC}` });
      const fills = q('.sv--lent .sv-fill');
      gsap.set(fills, { width: '0%' });
      const bars = q('.sv--earned .sv-col__bar');
      gsap.set(bars, { height: '0%' });
      gsap.set(q('.sv--earned .sv-colval'), { opacity: 0.0 });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pinEl,
          start: 'top top+=84',
          end: '+=2600',
          pin: true,
          scrub: 0.7,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => setActive(Math.min(2, Math.floor(self.progress * 3 + 0.02))),
        },
      });
      // rails and slow turn on the donut keep the first chapter alive while it is held
      tl.to(q('.story__rail-fill'), { scaleY: 1, duration: 3.2 }, 0);
      tl.to(q('.sv--vault .sv-donut svg'), { rotation: '+=28', duration: 0.9, transformOrigin: '50% 50%' }, 0);

      // 1 -> 2
      tl.to([stepEls[0], visEls[0]], { autoAlpha: 0, y: -34, duration: 0.3, ease: 'power2.in' }, 0.85)
        .to([stepEls[1], visEls[1]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out' }, 1.1);
      if (ring) tl.to(ring, { strokeDasharray: `${Math.min(1, data.ltv) * ringC} ${ringC}`, duration: 0.85, ease: 'power2.out' }, 1.2);
      counter(q('[data-count="ltv"]')[0], data.ltv * 100, (v) => f.pct(v), 1.2, 0.85, tl);
      counter(q('[data-count="outstanding"]')[0], pf.principalOutstanding, (v) => f.money(Math.round(v)), 1.25, 0.85, tl);
      counter(q('[data-count="repaid"]')[0], pf.principalRepaid, (v) => f.money(Math.round(v)), 1.3, 0.85, tl);
      fills.forEach((fl, i) => {
        const to = parseFloat((fl as HTMLElement).dataset.to ?? '0') * 100;
        tl.to(fl, { width: `${to}%`, duration: 0.8, ease: 'power2.out' }, 1.3 + i * 0.1);
      });

      // 2 -> 3
      tl.to([stepEls[1], visEls[1]], { autoAlpha: 0, y: -34, duration: 0.3, ease: 'power2.in' }, 2.05)
        .to([stepEls[2], visEls[2]], { autoAlpha: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out' }, 2.3);
      bars.forEach((b, i) => {
        const to = parseFloat((b as HTMLElement).dataset.to ?? '0') * 100;
        tl.to(b, { height: `${Math.max(4, to)}%`, duration: 0.8, ease: 'power3.out' }, 2.4 + i * 0.12);
      });
      tl.to(q('.sv--earned .sv-colval'), { opacity: 1, duration: 0.3 }, 2.5);
      counter(q('[data-count="collected"]')[0], pf.interestCollectedYear, (v) => f.money(Math.round(v)), 2.4, 0.85, tl);
      counter(q('[data-count="receivable"]')[0], pf.outstandingInterest, (v) => f.money(Math.round(v)), 2.5, 0.85, tl);
      tl.to({}, { duration: 0.35 }, 3.2); // hold the last chapter for a beat
    },
    { scope: root, dependencies: [data, f.lang, motion], revertOnUpdate: true },
  );

  return (
    <section className="story" ref={root} aria-labelledby="story-title">
      <div className="story__pin" ref={pin}>
        <header className="story__head">
          <h2 className="h2" id="story-title">{t('dash.walk.title')}</h2>
          <p className="muted">{t('dash.walk.sub')}</p>
        </header>
        <div className="story__stage">
          <div className="story__rail" aria-hidden="true"><i className="story__rail-fill" /></div>
          <ol className="story__steps">
            {steps.map((st, i) => (
              <li key={st.key} className={`story__step${active === i ? ' is-active' : ''}`}>
                <span className="story__num">{f.digits(i + 1)}</span>
                <h3 className="display story__title">{t(`dash.walk.${st.key}.title`)}</h3>
                <p>{t(`dash.walk.${st.key}.body`)}</p>
              </li>
            ))}
          </ol>
          <div className="story__visuals">
            {steps.map((st) => (
              <st.Visual key={st.key} s={data} f={f} t={t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PortfolioStory() {
  const wide = useWide();
  const motion = useApp((s) => s.prefs.motion);
  return wide && motion === 'full' ? <PinnedStory /> : <StaticStory />;
}

void GRAMS_PER_VORI;
export type { Portfolio };
