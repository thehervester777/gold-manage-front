/**
 * "Watch the months being counted" — the interest rule made visible.
 *
 * A pledge moves forward day by day (0 to 100). A staircase shows how many months
 * would be charged on each day, free days are hatched, and a cursor carries a token
 * with the current month count. On wide screens the scene pins to the viewport and
 * ScrollTrigger scrubs the cursor; on narrow screens, or with calm motion, the same
 * scene is driven by a slider and a play button.
 *
 * Every number comes from `chargeableMonths` with the policy being edited, so the
 * picture can never disagree with the engine.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button, Chip } from '../../components/controls';
import { gsap, useGSAP } from '../../motion/gsap';
import { fullMotion } from '../../motion/fx';
import { useMedia } from '../../motion/media';
import { useApp } from '../../lib/store';
import { useFmt, useT } from '../../lib/hooks';
import { chargeableMonths, MONTH_DAYS, type InterestPolicy } from '../../lib/interest';
import { cx } from '../../lib/cx';
import { ruleSentence } from './model';

const DAY_MAX = 100;

interface Geo {
  w: number;
  h: number;
  l: number;
  r: number;
  t: number;
  b: number;
  ticks: number[];
}
/** Chart geometry for a plot area of the given size — drawn 1:1, so text stays crisp at every width. */
function geoFor(w: number, h: number): Geo {
  const tight = w < 520;
  const ticks = tight ? [0, 30, 60, 90, 100] : w < 640 ? [0, 20, 40, 60, 80, 100] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return { w, h, l: tight ? 34 : 46, r: tight ? 12 : 18, t: 44, b: 58, ticks };
}

/** Tracks an element's size so the chart can be drawn to fit it exactly. */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 640, h: 400 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

const n2 = (v: number) => Math.round(v * 100) / 100;

function buildScene(policy: InterestPolicy, geo: Geo) {
  const levels = Array.from({ length: DAY_MAX + 1 }, (_, d) => chargeableMonths(Math.floor(d / MONTH_DAYS), d % MONTH_DAYS, policy));
  // a little headroom above the highest step keeps the month labels clear of the line
  const mMax = Math.max(5, levels[DAY_MAX].chargeable + 1);
  const pw = geo.w - geo.l - geo.r;
  const ph = geo.h - geo.t - geo.b;
  const x = (d: number) => n2(geo.l + (d / DAY_MAX) * pw);
  const y = (m: number) => n2(geo.t + ph * (1 - m / mMax));

  let line = `M${x(0)} ${y(levels[0].chargeable)}`;
  const steps: { day: number; level: number }[] = [];
  for (let d = 1; d <= DAY_MAX; d++) {
    if (levels[d].chargeable !== levels[d - 1].chargeable) {
      line += `H${x(d)}V${y(levels[d].chargeable)}`;
      steps.push({ day: d, level: levels[d].chargeable });
    }
  }
  line += `H${x(DAY_MAX)}`;
  const area = `${line}V${y(0)}H${x(0)}Z`;

  const bands = [0, 1, 2, 3].map((k) => ({ from: k * MONTH_DAYS, to: Math.min(DAY_MAX, (k + 1) * MONTH_DAYS) })).filter((b) => b.from < DAY_MAX);
  const zones =
    policy.graceDays > 0
      ? [1, 2, 3].map((k) => ({ from: k * MONTH_DAYS, to: Math.min(DAY_MAX, k * MONTH_DAYS + policy.graceDays + 1) })).filter((z) => z.from < DAY_MAX)
      : [];
  return { geo, mMax, pw, ph, x, y, line, area, steps, bands, zones };
}

type SceneData = ReturnType<typeof buildScene>;

interface Props {
  policy: InterestPolicy;
  previewing: boolean;
}

export function DayScene(props: Props) {
  const wide = useMedia('(min-width: 980px) and (min-height: 720px)');
  const motion = useApp((s) => s.prefs.motion);
  const pinned = wide && motion === 'full';
  return <Scene key={pinned ? 'pinned' : 'static'} pinned={pinned} {...props} />;
}

function Scene({ policy, previewing, pinned }: Props & { pinned: boolean }) {
  const t = useT();
  const f = useFmt();
  const uid = useId().replace(/:/g, '');
  const [plot, box] = useBox<HTMLDivElement>();
  const geo = useMemo(() => geoFor(box.w, box.h), [box.w, box.h]);
  const scene = useMemo(() => buildScene(policy, geo), [policy, geo]);

  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const big = useRef<HTMLElement>(null);
  const sentence = useRef<HTMLParagraphElement>(null);
  const daysEl = useRef<HTMLElement>(null);
  const fullEl = useRef<HTMLElement>(null);
  const extraEl = useRef<HTMLElement>(null);
  const flag = useRef<HTMLDivElement>(null);
  const cursor = useRef<SVGGElement>(null);
  const dot = useRef<SVGGElement>(null);
  const dotNum = useRef<SVGTextElement>(null);
  const clip = useRef<SVGRectElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const [playing, setPlaying] = useState(false);

  const run = useRef({ day: 0, charged: -1, py: NaN });
  const live = useRef<{ scene: SceneData; t: typeof t; f: typeof f; policy: InterestPolicy }>({ scene, t, f, policy });
  live.current = { scene, t, f, policy };

  /** Paints one moment of the scene. Called from the scroll timeline, the slider, and after every re-render. */
  const render = useCallback((raw: number) => {
    const { scene: sc, t: tt, f: ff, policy: p } = live.current;
    const day = Math.min(DAY_MAX, Math.max(0, raw));
    const di = Math.min(DAY_MAX, Math.floor(day + 1e-6));
    const full = Math.floor(di / MONTH_DAYS);
    const extra = di % MONTH_DAYS;
    const { chargeable, rule } = chargeableMonths(full, extra, p);
    const px = sc.x(day);
    const py = sc.y(chargeable);
    const st = run.current;
    st.day = day;

    if (cursor.current) gsap.set(cursor.current, { x: px });
    clip.current?.setAttribute('width', String(Math.max(0, px)));
    if (dot.current && st.py !== py) {
      gsap.to(dot.current, { y: py, duration: st.charged === -1 || !fullMotion() ? 0 : 0.34, ease: 'back.out(1.8)', overwrite: 'auto' });
      st.py = py;
    }
    if (dotNum.current) dotNum.current.textContent = ff.n(chargeable);
    if (flag.current) {
      flag.current.style.left = `${Math.min(93, Math.max(7, (px / sc.geo.w) * 100))}%`;
      flag.current.textContent = tt('int.scene.day', { d: di });
    }
    if (big.current) {
      big.current.textContent = ff.n(chargeable);
      if (st.charged !== chargeable && st.charged !== -1 && fullMotion()) {
        gsap.fromTo(big.current, { scale: 1.24, yPercent: -5 }, { scale: 1, yPercent: 0, duration: 0.7, ease: 'back.out(2.4)', overwrite: 'auto' });
      }
    }
    st.charged = chargeable;
    if (sentence.current) sentence.current.textContent = ruleSentence(tt, full, extra, rule, p.graceDays);
    if (panel.current) panel.current.dataset.rule = rule;
    if (daysEl.current) daysEl.current.textContent = ff.n(di);
    if (fullEl.current) fullEl.current.textContent = ff.n(full);
    if (extraEl.current) extraEl.current.textContent = ff.n(extra);
    root.current?.querySelectorAll<SVGElement>('.ds-free').forEach((el) => {
      el.classList.toggle('is-live', di >= Number(el.dataset.from) && di < Number(el.dataset.to));
    });
    root.current?.querySelectorAll<SVGElement>('.ds-step').forEach((el) => {
      el.classList.toggle('is-passed', di >= Number(el.dataset.day));
    });
    if (slider.current) {
      slider.current.value = String(di);
      slider.current.setAttribute('aria-valuetext', `${tt('int.scene.day', { d: di })}: ${tt('common.monthCount', { n: chargeable })}`);
    }
  }, []);

  // keep the imperative parts in step with whatever React just drew (policy edits, language, screen size)
  useLayoutEffect(() => {
    run.current.py = NaN;
    render(run.current.day);
  }, [scene, f.lang, render]);

  useGSAP(
    () => {
      if (!pinned || !pin.current) return;
      const proxy = { d: run.current.day };
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: pin.current, start: 'top top+=84', end: '+=2100', pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true },
      });
      tl.fromTo(proxy, { d: 0 }, { d: DAY_MAX, duration: 1, onUpdate: () => render(proxy.d) });
      tl.to({}, { duration: 0.12 }); // hold the final frame for a beat
      render(0);
    },
    { scope: root, dependencies: [pinned, f.lang], revertOnUpdate: true },
  );

  useEffect(() => () => void tween.current?.kill(), []);

  const toggle = () => {
    if (playing) {
      tween.current?.kill();
      setPlaying(false);
      return;
    }
    const from = run.current.day >= DAY_MAX - 0.5 ? 0 : run.current.day;
    const o = { d: from };
    setPlaying(true);
    tween.current = gsap.to(o, {
      d: DAY_MAX,
      duration: Math.max(0.6, (DAY_MAX - from) * 0.085),
      ease: 'none',
      onUpdate: () => render(o.d),
      onComplete: () => setPlaying(false),
    });
  };

  const { x, y, mMax, ph } = scene;
  const baseY = y(0);
  const titleId = `${uid}-title`;

  return (
    <section ref={root} className={cx('dscene', pinned && 'is-pinned')} aria-labelledby={titleId}>
      <div ref={pin} className="dscene__pin">
        <div className="dscene__card">
          <span className="dscene__glow" aria-hidden="true" />
          <header className="dscene__head">
            <div>
              <h2 className="dscene__title" id={titleId}>{t('int.scene.title')}</h2>
              <p className="dscene__sub">{pinned ? t('int.scene.sub') : t('int.scene.subStatic')}</p>
            </div>
            {previewing ? <Chip tone="gold" className="chip--onink">{t('int.preview')}</Chip> : null}
          </header>

          <div className="dscene__stage">
            <div className="dscene__panel" ref={panel} data-rule="minimum">
              <span className="dscene__label">{t('int.scene.charged')}</span>
              <b className="dscene__big serif-num" ref={big}>1</b>
              <p className="dscene__sentence" ref={sentence} />
              <dl className="dscene__stats">
                <div>
                  <dt>{t('int.scene.heldFor')}</dt>
                  <dd><b className="serif-num" ref={daysEl}>0</b></dd>
                </div>
                <div>
                  <dt>{t('int.scene.fullMonths')}</dt>
                  <dd><b className="serif-num" ref={fullEl}>0</b></dd>
                </div>
                <div>
                  <dt>{t('int.scene.extraDays')}</dt>
                  <dd><b className="serif-num" ref={extraEl}>0</b></dd>
                </div>
              </dl>
            </div>

            <figure className="dscene__chart">
              <div className="dscene__plot" ref={plot}>
                <div className="dscene__flag" ref={flag} aria-hidden="true" />
                <svg className="ds-svg" viewBox={`0 0 ${geo.w} ${geo.h}`} role="img" aria-label={t('int.scene.chartAlt')}>
                  <defs>
                    <linearGradient id={`${uid}-area`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#e8c46f" stopOpacity="0.46" />
                      <stop offset="1" stopColor="#c99a32" stopOpacity="0.03" />
                    </linearGradient>
                    <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <rect width="6" height="6" fill="rgba(94,211,162,0.14)" />
                      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(94,211,162,0.8)" strokeWidth="2" />
                    </pattern>
                    <clipPath id={`${uid}-clip`}>
                      <rect ref={clip} x="0" y="0" width="0" height={geo.h} />
                    </clipPath>
                  </defs>

                  {scene.bands.map((b, i) => {
                    const widthPx = x(b.to) - x(b.from);
                    // keep the label clear of the free-day stripes that open each month after the first
                    const lead = i > 0 && policy.graceDays > 0 ? x(b.from + policy.graceDays + 1) - x(b.from) : 0;
                    const room = widthPx - lead - 12;
                    const label = room < 62 ? f.n(i + 1) : t('int.scene.month', { n: i + 1 });
                    return (
                      <g key={b.from}>
                        <rect className={cx('ds-band', i % 2 === 1 && 'is-alt')} x={x(b.from)} y={geo.t} width={widthPx} height={ph} />
                        <text className="ds-bandlabel" x={x(b.from) + lead + 8} y={geo.t + 20}>{label}</text>
                      </g>
                    );
                  })}

                  {Array.from({ length: mMax }, (_, i) => i + 1).map((m) => (
                    <g key={m}>
                      <line className="ds-grid" x1={geo.l} x2={geo.w - geo.r} y1={y(m)} y2={y(m)} />
                      <text className="ds-tick" x={geo.l - 10} y={y(m)} dy="0.35em" textAnchor="end">{f.n(m)}</text>
                    </g>
                  ))}
                  {[30, 60, 90].map((d) => (
                    <line key={d} className="ds-boundary" x1={x(d)} x2={x(d)} y1={geo.t} y2={baseY} />
                  ))}

                  {scene.zones.map((z) => (
                    <rect key={z.from} className="ds-free" data-from={z.from} data-to={z.to} x={x(z.from)} y={geo.t} width={x(z.to) - x(z.from)} height={ph} fill={`url(#${uid}-hatch)`} />
                  ))}

                  <path className="ds-ghost" d={scene.line} />
                  <g clipPath={`url(#${uid}-clip)`}>
                    <path className="ds-area" d={scene.area} fill={`url(#${uid}-area)`} />
                    <path className="ds-line" d={scene.line} />
                  </g>
                  {scene.steps.map((s) => (
                    <circle key={s.day} className="ds-step" data-day={s.day} cx={x(s.day)} cy={y(s.level)} r="5.5" />
                  ))}

                  <line className="ds-axis" x1={geo.l} x2={geo.w - geo.r} y1={baseY} y2={baseY} />
                  {geo.ticks.map((tk) => (
                    <g key={tk}>
                      <line className="ds-tickline" x1={x(tk)} x2={x(tk)} y1={baseY} y2={baseY + 6} />
                      <text className={cx('ds-tick', tk % MONTH_DAYS === 0 && tk > 0 && 'is-month')} x={x(tk)} y={baseY + 23} textAnchor="middle">{f.n(tk)}</text>
                    </g>
                  ))}
                  <text className="ds-axistitle" x={(geo.l + geo.w - geo.r) / 2} y={geo.h - 8} textAnchor="middle">{t('int.scene.axisDays')}</text>

                  <g ref={cursor} className="ds-cursor">
                    <line x1="0" x2="0" y1={geo.t - 8} y2={baseY} />
                    <g ref={dot} className="ds-dot">
                      <circle r="15" />
                      <text ref={dotNum} textAnchor="middle" dy="0.36em">1</text>
                    </g>
                  </g>
                </svg>
              </div>
              <figcaption className="dscene__legend">
                <span><i className="lg lg--line" />{t('int.scene.axisMonths')}</span>
                {policy.graceDays > 0 ? <span><i className="lg lg--free" />{t('int.scene.free')}</span> : null}
                <span><i className="lg lg--step" />{t('int.scene.legend.step')}</span>
              </figcaption>
            </figure>
          </div>

          {pinned ? (
            <p className="dscene__hint">{t('int.scene.hint')}</p>
          ) : (
            <div className="dscene__controls">
              <Button variant="onink" icon={playing ? <Pause size={16} /> : <Play size={16} />} onClick={toggle}>
                {playing ? t('int.scene.stop') : t('int.scene.play')}
              </Button>
              <label className="dscene__slider">
                <span>{t('int.scene.slider')}</span>
                <input
                  ref={slider}
                  type="range"
                  min={0}
                  max={DAY_MAX}
                  step={1}
                  defaultValue={0}
                  onChange={(e) => {
                    tween.current?.kill();
                    setPlaying(false);
                    render(Number(e.target.value));
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
