import { en, type TKey } from './en';
import { bn } from './bn';
import type { Lang } from '../types';
import { makeFmt, type Fmt } from '../format';

export type { TKey };
export type Params = Record<string, string | number>;
/** `foo_one` / `foo_other` pairs can be asked for as plain `foo`; the count picks the form. */
type PluralBase = TKey extends infer K ? (K extends `${infer B}_one` ? B : never) : never;
export type AnyKey = TKey | PluralBase;

const dicts: Record<Lang, Record<TKey, string>> = { en, bn };

/** Look a string up in a given language; picks `_one` / `_other` when `n` is supplied. */
export function translate(lang: Lang, key: AnyKey | string, params?: Params): string {
  const dict = dicts[lang] as Record<string, string>;
  let k = key as string;
  if (params && typeof params.n === 'number') {
    const plural = params.n === 1 ? `${key}_one` : `${key}_other`;
    if (plural in dict) k = plural;
  }
  let s = dict[k] ?? (dicts.en as Record<string, string>)[k] ?? k;
  if (params) {
    const f = makeFmt(lang);
    s = s.replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = params[name];
      if (v === undefined) return `{${name}}`;
      return typeof v === 'number' ? f.n(v, Number.isInteger(v) ? 0 : 2) : String(v);
    });
  }
  return s;
}

export type TFn = (key: AnyKey, params?: Params) => string;

export function makeT(lang: Lang): TFn {
  return (key, params) => translate(lang, key, params);
}

export { makeFmt };
export type { Fmt };
