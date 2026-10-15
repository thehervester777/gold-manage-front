/** Join class names, skipping anything falsy. */
export const cx = (...v: unknown[]): string => v.filter(Boolean).join(' ');
