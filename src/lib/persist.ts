/**
 * Browser persistence. The whole database lives in IndexedDB (no 5 MB cap, so
 * photographs fit); localStorage and finally memory are fallbacks for private
 * windows and locked-down frames. Every read/write is wrapped in try/catch and the
 * app renders correctly without any of it.
 */
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Database } from './types';

export type StorageMode = 'idb' | 'local' | 'memory';

const DB_KEY = 'igh:db:v1';
const mem = new Map<string, unknown>();
let mode: StorageMode = 'idb';

const hasIDB = () => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
};

export const storageMode = () => mode;

async function kvGet<T>(key: string): Promise<T | undefined> {
  if (hasIDB()) {
    try {
      const v = await idbGet<T>(key);
      mode = 'idb';
      return v;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = localStorage.getItem(key);
    mode = 'local';
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    /* fall through */
  }
  mode = 'memory';
  return mem.get(key) as T | undefined;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (hasIDB()) {
    try {
      await idbSet(key, value);
      mode = 'idb';
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    mode = 'local';
    return;
  } catch {
    /* fall through */
  }
  mode = 'memory';
  mem.set(key, value);
}

async function kvDel(key: string): Promise<void> {
  mem.delete(key);
  try {
    if (hasIDB()) await idbDel(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const loadDatabase = () => kvGet<Database>(DB_KEY);
export const saveDatabase = (db: Database) => kvSet(DB_KEY, db);
export const clearDatabase = () => kvDel(DB_KEY);

export const saveSnapshot = (id: string, json: string) => kvSet(`igh:backup:${id}`, json);
export const loadSnapshot = (id: string) => kvGet<string>(`igh:backup:${id}`);
export const deleteSnapshot = (id: string) => kvDel(`igh:backup:${id}`);

// ---- small synchronous prefs (theme, sidebar …) -------------------------------
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`igh.${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`igh.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removePref(key: string) {
  try {
    localStorage.removeItem(`igh.${key}`);
  } catch {
    /* ignore */
  }
}
