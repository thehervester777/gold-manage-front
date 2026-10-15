/**
 * Small, dependency-free SVG charts. Every mark is placed from one scale, labels
 * are formatted in the viewer's language, and entrances are driven by GSAP.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { useFmt, useT } from '../lib/hooks';
import type { MonthPoint } from '../lib/selectors';

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Round axis maximum and evenly spaced ticks for a data maximum. */
export function niceScale(max: number, ticks = 4): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return { max: top, ticks: out };
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------
export function Sparkline({ data, width = 120, height = 36, color = 'var(--c1)', fill = true, className }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const { line, area, last } = useMemo(() => {
    const pad = 3;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) => [pad + (i / Math.max(1, data.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2 - 2) + 1] as const);
    const l = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    return { line: l, area: `${l}L${pts[pts.length - 1][0]} ${height}L${pts[0][0]} ${height}Z`, last: pts[pts.length - 1] };
  }, [data, width, height]);

  useGSAP(
    () => {
      if (!fullMotion() || !ref.current) return;
      const path = ref.current.querySelector('.sp-line');
      const areaEl = ref.current.querySelector('.sp-area');
      const dot = ref.current.querySelector('.sp-dot');
      gsap.set(path, { drawSVG: '0%' });
      gsap.set([areaEl, dot], { opacity: 0 });
      ScrollTrigger.create({
        trigger: ref.current,
        start: 'top 95%',
        once: true,
        onEnter: () => {
          gsap.to(path, { drawSVG: '100%', duration: 1.3, ease: 'power2.inOut' });
          gsap.to(areaEl, { opacity: 1, duration: 1, delay: 0.5 });
          gsap.to(dot, { opacity: 1, duration: 0.4, delay: 1.1 });
        },
      });
    },
    { scope: ref, dependencies: [line] },
  );

  return (
    <svg ref={ref} className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path className="sp-area" d={area} fill={`url(#${id})`} /> : null}
      <path className="sp-line" d={line} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="sp-dot" cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Money out / interest in — two small charts sharing the month axis
// ---------------------------------------------------------------------------
export function FlowChart({ data }: { data: MonthPoint[] }) {
  const f = useFmt();
  const t = useT();
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const left = 54;
  const right = 6;
  const top0 = 24;
  const hTop = 124;
  const hBot = 96;
  const gap = 36;
  const axis = 26;
  const base1 = top0 + hTop;
  const base2 = base1 + gap + hBot;
  const H = base2 + axis;
  const inner = Math.max(120, w - left - right);
  const step = inner / data.length;
  const barW = Math.min(30, Math.max(8, step * 0.52));
  // Month names need about 40px each; on a narrow screen name every second month, always ending on the latest.
  const every = step < 40 ? 2 : 1;

  const sTop = niceScale(Math.max(...data.map((d) => d.disbursed), 1), 3);
  const sBot = niceScale(Math.max(...data.map((d) => d.interest), 1), 2);
  const yTop = (v: number) => top0 + (1 - v / sTop.max) * hTop;
  const yBot = (v: number) => base1 + gap + (1 - v / sBot.max) * hBot;

  useGSAP(
    () => {
      const svg = svgRef.current;
      if (!svg || !w || !fullMotion()) return;
      const bars = svg.querySelectorAll<SVGRectElement>('.fc-bar');
      gsap.set(bars, { scaleY: 0, transformBox: 'fill-box', transformOrigin: '50% 100%' });
      ScrollTrigger.create({
        trigger: svg,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(bars, { scaleY: 1, duration: 1.1, stagger: 0.035, ease: 'igh' }),
      });
    },
    { scope: svgRef, dependencies: [w > 0, data.length] },
  );

  const hovered = hover != null ? data[hover] : null;
  const tipLeft = hover != null ? Math.min(Math.max(left + step * (hover + 0.5), 110), Math.max(110, w - 110)) : 0;

  return (
    <div className="chart" ref={ref}>
      {w > 0 ? (
        <svg ref={svgRef} width={w} height={H} role="img" aria-label={t('dash.flow.title')} onMouseLeave={() => setHover(null)}>
          {/* top panel: disbursed */}
          {sTop.ticks.map((v) => (
            <g key={`t${v}`}>
              <line x1={left} x2={w - right} y1={yTop(v)} y2={yTop(v)} stroke="var(--chart-grid)" strokeDasharray={v === 0 ? undefined : '3 4'} />
              <text x={left - 10} y={yTop(v) + 4} textAnchor="end" className="chart__tick">{v === 0 ? '0' : f.compact(v)}</text>
            </g>
          ))}
          {sBot.ticks.map((v) => (
            <g key={`b${v}`}>
              <line x1={left} x2={w - right} y1={yBot(v)} y2={yBot(v)} stroke="var(--chart-grid)" strokeDasharray={v === 0 ? undefined : '3 4'} />
              <text x={left - 10} y={yBot(v) + 4} textAnchor="end" className="chart__tick">{v === 0 ? '0' : f.compact(v)}</text>
            </g>
          ))}
          <text x={left} y={top0 - 10} className="chart__cap" fill="var(--c2)">{t('dash.flow.disbursed')}</text>
          <text x={left} y={base1 + gap / 2 + 4} className="chart__cap" fill="var(--c1)">{t('dash.flow.collected')}</text>
          {hover != null ? <rect x={left + step * hover} y={0} width={step} height={H - axis} rx={8} fill="var(--ink)" opacity="0.045" /> : null}
          {data.map((d, i) => {
            const cx = left + step * (i + 0.5);
            return (
              <g key={d.key}>
                <rect className="fc-bar" x={cx - barW / 2} y={yTop(d.disbursed)} width={barW} height={Math.max(0, base1 - yTop(d.disbursed))} rx={Math.min(5, barW / 3)} fill="var(--c2)" opacity={hover == null || hover === i ? 1 : 0.4} style={{ transition: 'opacity .2s' }} />
                <rect className="fc-bar" x={cx - barW / 2} y={yBot(d.interest)} width={barW} height={Math.max(0, base2 - yBot(d.interest))} rx={Math.min(5, barW / 3)} fill="var(--c1)" opacity={hover == null || hover === i ? 1 : 0.4} style={{ transition: 'opacity .2s' }} />
                {(data.length - 1 - i) % every === 0 ? <text x={cx} y={H - 6} textAnchor="middle" className="chart__tick">{f.monthShort(d.key)}</text> : null}
                <rect x={left + step * i} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
        </svg>
      ) : null}
      {hovered ? (
        <div className="chart__tip" style={{ left: tipLeft, top: 6 }}>
          <b>{f.monthYear(hovered.key)}</b>
          <span><i style={{ background: 'var(--c2)' }} />{t('dash.flow.disbursed')}<em>{f.money(hovered.disbursed)}</em></span>
          <span><i style={{ background: 'var(--c1)' }} />{t('dash.flow.collected')}<em>{f.money(hovered.interest)}</em></span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Area chart with a hover read-out (gold rate)
// ---------------------------------------------------------------------------
export interface SeriesPoint {
  label: string;
  value: number;
}

export function AreaChart({ data, height = 150, format, color = 'var(--c1)', onInk }: { data: SeriesPoint[]; height?: number; format: (v: number) => string; color?: string; onInk?: boolean }) {
  const id = useId().replace(/:/g, '');
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pad = { l: 2, r: 2, t: 14, b: 10 };
  const geo = useMemo(() => {
    const vals = data.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const lo = min - span * 0.18;
    const hi = max + span * 0.12;
    const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
    const pts = data.map((d, i) => [x(i), y(d.value)] as const);
    // smooth curve (monotone-ish via Catmull-Rom to Bezier)
    let d = '';
    pts.forEach((p, i) => {
      if (i === 0) d = `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      else {
        const p0 = pts[i - 2] ?? pts[i - 1];
        const p1 = pts[i - 1];
        const p2 = p;
        const p3 = pts[i + 1] ?? p;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      }
    });
    return { pts, line: d, area: `${d}L${pts[pts.length - 1][0]} ${height}L${pts[0][0]} ${height}Z`, minI: vals.indexOf(min), maxI: vals.indexOf(max) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, w, height]);

  useGSAP(
    () => {
      const svg = svgRef.current;
      if (!svg || !w || !fullMotion()) return;
      const line = svg.querySelector('.ac-line');
      const area = svg.querySelector('.ac-area');
      gsap.set(line, { drawSVG: '0%' });
      gsap.set(area, { opacity: 0 });
      ScrollTrigger.create({
        trigger: svg,
        start: 'top 92%',
        once: true,
        onEnter: () => {
          gsap.to(line, { drawSVG: '100%', duration: 1.8, ease: 'power2.inOut' });
          gsap.to(area, { opacity: 1, duration: 1.2, delay: 0.7 });
        },
      });
    },
    { scope: svgRef, dependencies: [w > 0, data.length] },
  );

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left - pad.l) / Math.max(1, w - pad.l - pad.r);
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };
  const hp = hover != null ? geo.pts[hover] : null;

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 ? (
        <svg ref={svgRef} width={w} height={height} onPointerMove={move} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.32" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="ac-area" d={geo.area} fill={`url(#${id})`} />
          <path className="ac-line" d={geo.line} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {hp ? (
            <g>
              <line x1={hp[0]} x2={hp[0]} y1={pad.t - 6} y2={height} stroke={onInk ? 'rgba(255,255,255,.25)' : 'var(--line-strong)'} strokeDasharray="3 3" />
              <circle cx={hp[0]} cy={hp[1]} r="4.5" fill={color} stroke={onInk ? '#10161e' : 'var(--surface)'} strokeWidth="2" />
            </g>
          ) : (
            <circle cx={geo.pts[geo.pts.length - 1][0]} cy={geo.pts[geo.pts.length - 1][1]} r="4" fill={color} stroke={onInk ? '#10161e' : 'var(--surface)'} strokeWidth="2" />
          )}
        </svg>
      ) : null}
      {hover != null && hp ? (
        <div className={`chart__tip chart__tip--sm${onInk ? ' chart__tip--ink' : ''}`} style={{ left: Math.min(Math.max(hp[0], 70), Math.max(70, w - 70)), top: Math.max(0, hp[1] - 58) }}>
          <b>{format(data[hover].value)}</b>
          <em style={{ fontStyle: 'normal', color: 'var(--ink-3)' }}>{data[hover].label}</em>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut + ring
// ---------------------------------------------------------------------------
export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({ segments, size = 188, thickness = 20, children, gapDeg = 3, animate = true }: { segments: DonutSegment[]; size?: number; thickness?: number; children?: ReactNode; gapDeg?: number; animate?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const arcs = useMemo(() => {
    let acc = 0;
    return segments.map((s) => {
      const frac = s.value / total;
      const len = Math.max(0, frac * C - (gapDeg / 360) * C);
      const arc = { ...s, len, offset: -acc * C };
      acc += frac;
      return arc;
    });
  }, [segments, total, C, gapDeg]);

  useGSAP(
    () => {
      const svg = ref.current;
      if (!svg || !animate || !fullMotion()) return;
      const els = svg.querySelectorAll<SVGCircleElement>('.dn-arc');
      gsap.set(els, { strokeDasharray: (i: number) => `0 ${C}` });
      ScrollTrigger.create({
        trigger: svg,
        start: 'top 90%',
        once: true,
        onEnter: () => els.forEach((el, i) => gsap.to(el, { strokeDasharray: `${arcs[i].len} ${C}`, duration: 1.3, delay: i * 0.12, ease: 'igh' })),
      });
    },
    { scope: ref, dependencies: [arcs.length, total, animate] },
  );

  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {arcs.map((a) => (
          <circle key={a.id} className="dn-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={thickness} strokeLinecap="butt" strokeDasharray={`${a.len} ${C}`} strokeDashoffset={a.offset} data-len={a.len} data-c={C} />
        ))}
      </svg>
      <div className="donut__center">{children}</div>
    </div>
  );
}

export function Ring({ value, size = 160, thickness = 14, color = 'var(--c1)', track = 'var(--surface-3)', children, progressRef }: { value: number; size?: number; thickness?: number; color?: string; track?: string; children?: ReactNode; progressRef?: React.Ref<SVGCircleElement> }) {
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={thickness} />
        <circle ref={progressRef} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${v * C} ${C}`} data-ring-len={C} />
      </svg>
      <div className="donut__center">{children}</div>
    </div>
  );
}

// stable no-op to keep ScrollTrigger tree-shaking from dropping imports in some bundlers
void useEffect;

// ---------------------------------------------------------------------------
// Two-part bars over a day or month axis (collections: interest + principal)
// ---------------------------------------------------------------------------
export interface StackPoint {
  label: string;
  /** Short label for the axis. */
  tick: string;
  a: number;
  b: number;
}

export function StackBars({ data, height = 190, aLabel, bLabel }: { data: StackPoint[]; height?: number; aLabel: string; bLabel: string }) {
  const f = useFmt();
  const { ref, w } = useSize<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const left = 46;
  const right = 6;
  const top = 12;
  const axis = 24;
  const innerH = height - top - axis;
  const inner = Math.max(80, w - left - right);
  const step = inner / Math.max(1, data.length);
  const barW = Math.min(26, Math.max(4, step * 0.62));
  const scale = niceScale(Math.max(...data.map((d) => d.a + d.b), 1), 3);
  const y = (v: number) => top + (1 - v / scale.max) * innerH;
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(inner / 62))));

  useGSAP(
    () => {
      const svg = svgRef.current;
      if (!svg || !w || !fullMotion()) return;
      const bars = svg.querySelectorAll<SVGRectElement>('.sb-bar');
      gsap.set(bars, { scaleY: 0, transformBox: 'fill-box', transformOrigin: '50% 100%' });
      ScrollTrigger.create({
        trigger: svg,
        start: 'top 90%',
        once: true,
        onEnter: () => gsap.to(bars, { scaleY: 1, duration: 1, stagger: { each: 0.012, from: 'start' }, ease: 'igh' }),
      });
    },
    { scope: svgRef, dependencies: [w > 0, data.length] },
  );

  const hp = hover != null ? data[hover] : null;
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {w > 0 ? (
        <svg ref={svgRef} width={w} height={height} onPointerLeave={() => setHover(null)} style={{ touchAction: 'pan-y' }}>
          {scale.ticks.map((tk) => (
            <g key={tk}>
              <line x1={left} x2={w - right} y1={y(tk)} y2={y(tk)} stroke="var(--chart-grid)" />
              <text className="chart__tick" x={left - 8} y={y(tk) + 4} textAnchor="end">{f.compact(tk)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + step * i + step / 2;
            const hb = (d.b / scale.max) * innerH;
            const ha = (d.a / scale.max) * innerH;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerMove={() => setHover(i)}>
                <rect x={cx - step / 2} y={top} width={step} height={innerH + axis} fill="transparent" />
                <rect className="sb-bar" x={cx - barW / 2} y={top + innerH - hb} width={barW} height={Math.max(0, hb)} rx={Math.min(3, barW / 2)} fill="var(--c2)" opacity={hover == null || hover === i ? 1 : 0.4} />
                <rect className="sb-bar" x={cx - barW / 2} y={top + innerH - hb - ha - (hb && ha ? 1.5 : 0)} width={barW} height={Math.max(0, ha)} rx={Math.min(3, barW / 2)} fill="var(--c1)" opacity={hover == null || hover === i ? 1 : 0.4} />
                {i % every === 0 ? (
                  <text className="chart__tick" x={cx} y={height - 6} textAnchor="middle">{d.tick}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hp ? (
        <div className="chart__tip" style={{ left: Math.min(Math.max(left + step * (hover as number) + step / 2, 90), Math.max(90, w - 90)), top: 0 }}>
          <b>{hp.label}</b>
          <span><i style={{ background: 'var(--c1)' }} />{aLabel}<em>{f.money(hp.a)}</em></span>
          <span><i style={{ background: 'var(--c2)' }} />{bLabel}<em>{f.money(hp.b)}</em></span>
        </div>
      ) : null}
    </div>
  );
}
