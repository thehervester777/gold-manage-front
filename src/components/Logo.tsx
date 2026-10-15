import { useId } from 'react';

/** The Ithika mark: a gold bar resting on a touchstone, with the streak it leaves. */
export function LogoMark({ size = 40, draw = false, className }: { size?: number; draw?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a8" />
          <stop offset="1" stopColor="#e2b650" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6a63f" />
          <stop offset="1" stopColor="#a8761a" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b88424" />
          <stop offset="1" stopColor="#7d5410" />
        </linearGradient>
        <linearGradient id={`${id}-streak`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e2b650" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f3d68a" />
          <stop offset="1" stopColor="#e2b650" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect className="logo-stone" width="48" height="48" rx="13" fill="#141b25" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" stroke="rgba(255,255,255,0.1)" />
      <g className="logo-bar">
        <path d="M13 22.5 19 15h16l-6 7.5H13Z" fill={`url(#${id}-top)`} />
        <path d="M13 22.5h16V31H13v-8.5Z" fill={`url(#${id}-front)`} />
        <path d="M29 22.5 35 15v8.5L29 31v-8.5Z" fill={`url(#${id}-side)`} />
        <path d="M14 23.3h14" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" strokeLinecap="round" />
      </g>
      <path className="logo-streak" d="M9 36.5h30" stroke={`url(#${id}-streak)`} strokeWidth="2.2" strokeLinecap="round" data-draw={draw ? '' : undefined} />
    </svg>
  );
}

export function Wordmark({ name, sub, light }: { name: string; sub?: string; light?: boolean }) {
  return (
    <div className={`wordmark${light ? ' wordmark--light' : ''}`}>
      <b className="wordmark__name">{name}</b>
      {sub ? <span className="wordmark__sub">{sub}</span> : null}
    </div>
  );
}
