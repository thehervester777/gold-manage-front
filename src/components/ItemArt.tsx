import { useId } from 'react';
import type { Category } from '../lib/types';

/** Line drawings used when an item has no photograph. */
export function ItemArt({ category, size = 64, className }: { category: Category; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const g = `url(#g${id})`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6dc9a" />
          <stop offset="0.55" stopColor="#d4a540" />
          <stop offset="1" stopColor="#9a6a12" />
        </linearGradient>
      </defs>
      {category === 'ring' ? (
        <>
          <ellipse cx="32" cy="40" rx="16" ry="14" stroke={g} strokeWidth="5" />
          <path d="M26 21 32 12l6 9-6 7-6-7Z" fill={g} opacity="0.95" />
          <path d="M26 21h12M32 12v16" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
        </>
      ) : category === 'bangle' ? (
        <>
          <ellipse cx="32" cy="34" rx="22" ry="20" stroke={g} strokeWidth="6" />
          <ellipse cx="32" cy="34" rx="15" ry="13" stroke={g} strokeWidth="1.5" opacity="0.5" />
        </>
      ) : category === 'chain' ? (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;
            const x = 8 + t * 48;
            const y = 22 + Math.sin(t * Math.PI) * 22;
            return <ellipse key={i} cx={x} cy={y} rx="6.5" ry="4.2" stroke={g} strokeWidth="2.6" transform={`rotate(${(t - 0.5) * 70 + (i % 2 ? 90 : 0)} ${x} ${y})`} />;
          })}
        </>
      ) : category === 'necklace' ? (
        <>
          <path d="M10 14c4 22 12 30 22 30s18-8 22-30" stroke={g} strokeWidth="3" strokeLinecap="round" />
          <path d="M32 44 26 52l6 8 6-8-6-8Z" fill={g} />
        </>
      ) : category === 'earring' ? (
        <>
          <path d="M32 8c-6 0-9 4-9 8s4 6 9 6" stroke={g} strokeWidth="3" strokeLinecap="round" />
          <path d="M32 22v8" stroke={g} strokeWidth="3" strokeLinecap="round" />
          <path d="M32 30c-7 6-8 14-3 20 2 3 8 3 10 0 5-6 4-14-3-20Z" fill={g} />
        </>
      ) : (
        <>
          <path d="M16 24 24 12h16l8 12-16 28L16 24Z" stroke={g} strokeWidth="3" strokeLinejoin="round" />
          <path d="M16 24h32M24 12l8 40 8-40" stroke={g} strokeWidth="1.5" opacity="0.6" />
        </>
      )}
    </svg>
  );
}
