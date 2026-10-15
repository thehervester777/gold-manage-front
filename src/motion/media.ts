import { useEffect, useState } from 'react';

/** Tracks a CSS media query, e.g. `useMedia('(min-width: 980px)')`. */
export function useMedia(query: string): boolean {
  const read = () => (typeof window === 'undefined' || !window.matchMedia ? false : window.matchMedia(query).matches);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
