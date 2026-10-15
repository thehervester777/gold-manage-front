import { useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP } from './gsap';
import { useFmt } from '../lib/hooks';
import { fullMotion } from './fx';
import type { Fmt } from '../lib/format';

export type NumKind = 'int' | 'money' | 'compact' | 'pct' | 'weight' | 'plain';

function render(f: Fmt, kind: NumKind, v: number, decimals: number): string {
  switch (kind) {
    case 'money': return f.money(Math.round(v));
    case 'compact': return f.compact(v);
    case 'pct': return f.pct(v);
    case 'weight': return f.weight(v);
    case 'plain': return f.n(v, decimals);
    default: return f.n(Math.round(v));
  }
}

interface Props {
  value: number;
  kind?: NumKind;
  decimals?: number;
  duration?: number;
  /** Counts up as soon as it mounts instead of waiting to scroll into view. */
  immediate?: boolean;
  className?: string;
}

/** A number that counts up from zero the first time it scrolls into view. */
export function Num({ value, kind = 'int', decimals = 0, duration = 1.7, immediate, className }: Props) {
  const f = useFmt();
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const set = (v: number) => {
        el.textContent = render(f, kind, v, decimals);
      };
      if (!fullMotion()) {
        set(value);
        shown.current = value;
        return;
      }
      const obj = { v: shown.current ?? 0 };
      const play = (d: number) =>
        gsap.to(obj, {
          v: value,
          duration: d,
          ease: 'power3.out',
          onUpdate: () => {
            shown.current = obj.v;
            set(obj.v);
          },
          onComplete: () => {
            shown.current = value;
            set(value);
          },
        });
      if (shown.current == null) {
        set(0);
        if (immediate) play(duration);
        else ScrollTrigger.create({ trigger: el, start: 'top 94%', once: true, onEnter: () => play(duration) });
      } else if (shown.current !== value) {
        play(0.7);
      } else {
        set(value);
      }
    },
    { scope: ref, dependencies: [value, kind, decimals, f.lang], revertOnUpdate: false },
  );

  return (
    <span ref={ref} className={className}>
      {render(f, kind, value, decimals)}
    </span>
  );
}
