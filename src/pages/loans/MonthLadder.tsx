import { useRef } from 'react';
import { gsap, useGSAP } from '../../motion/gsap';
import { fullMotion } from '../../motion/fx';
import { useFmt, useT } from '../../lib/hooks';
import type { Calculation } from '../../lib/interest';
import { cx } from '../../lib/cx';

/**
 * The 30-day rule drawn from a real loan: one block per charged month, then the
 * extra days after the last full month — the first few are free, the next one
 * starts a new month.
 */
export function MonthLadder({ calc }: { calc: Calculation }) {
  const t = useT();
  const f = useFmt();
  const ref = useRef<HTMLDivElement>(null);
  const m = calc.months;
  const grace = calc.policy.graceDays;
  const blocks = Math.min(m.chargeable, 36);
  const showDays = m.rule === 'grace' || m.rule === 'threshold';
  const dayCells = showDays ? Math.min(m.extraDays, 29) : 0;

  useGSAP(
    () => {
      if (!fullMotion()) return;
      const q = gsap.utils.selector(ref);
      const months = q('.ladder__m');
      const days = q('.ladder__d');
      if (months.length) gsap.from(months, { opacity: 0, y: 14, scale: 0.9, stagger: 0.04, duration: 0.6, ease: 'back.out(1.6)' });
      if (days.length) gsap.from(days, { opacity: 0, scale: 0.6, stagger: 0.05, duration: 0.45, delay: 0.25, ease: 'back.out(2)' });
    },
    { scope: ref, dependencies: [blocks, dayCells, m.rule] },
  );

  return (
    <div className="ladder" ref={ref} role="img" aria-label={t('loan.d.chargeable', { n: m.chargeable })}>
      <div className="ladder__months">
        {Array.from({ length: blocks }, (_, i) => {
          const isLast = i === blocks - 1;
          const added = isLast && m.rule === 'threshold';
          const started = isLast && m.rule === 'minimum';
          return (
            <span key={i} className={cx('ladder__m', added && 'is-added', started && 'is-started')} style={started ? ({ '--fill': `${Math.max(4, (m.extraDays / 30) * 100)}%` } as React.CSSProperties) : undefined}>
              <b>{f.n(i + 1)}</b>
            </span>
          );
        })}
        {dayCells > 0 ? (
          <span className="ladder__days" aria-hidden="true">
            {Array.from({ length: dayCells }, (_, i) => (
              <i key={i} className={cx('ladder__d', i + 1 <= grace ? 'is-free' : 'is-paid')} />
            ))}
          </span>
        ) : null}
      </div>
      <div className="ladder__legend">
        <span><i className="ladder__sw ladder__sw--m" />{t('loan.d.chargeable', { n: m.chargeable })}</span>
        {showDays ? <span><i className="ladder__sw ladder__sw--free" />{t('loan.d.ladderFree', { g: grace })}</span> : null}
      </div>
    </div>
  );
}
