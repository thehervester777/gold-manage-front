import { useRef } from 'react';
import { gsap, useGSAP } from '../motion/gsap';
import { fullMotion } from '../motion/fx';
import { cx } from '../lib/cx';

/** A ring and tick that draw themselves — the "it worked" mark. */
export function Seal({ gold, size = 96, className }: { gold?: boolean; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      const svg = ref.current;
      if (!svg || !fullMotion()) return;
      const circle = svg.querySelector<SVGCircleElement>('.seal-ring');
      const tick = svg.querySelector<SVGPathElement>('.seal-tick');
      if (!circle || !tick) return;
      const lc = circle.getTotalLength();
      const lt = tick.getTotalLength();
      gsap.set(circle, { strokeDasharray: lc, strokeDashoffset: lc });
      gsap.set(tick, { strokeDasharray: lt, strokeDashoffset: lt });
      gsap
        .timeline()
        .to(circle, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' })
        .to(tick, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out' }, '-=0.15')
        .fromTo(svg, { scale: 0.9 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1,0.5)' }, '-=0.4');
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} className={cx('pay-done__seal', gold && 'is-gold', className)} width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle className="seal-ring" cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="4" />
      <path className="seal-tick" d="m30 49 12 12 25-27" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
