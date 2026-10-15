import type { Permission } from '../../lib/types';
import { ROLE_IDS } from '../../lib/permissions';
import type { Tone } from '../../components/controls';

/** Permissions that change money rules, people or data. Granting one asks for a second look. */
export const SENSITIVE: ReadonlySet<Permission> = new Set<Permission>([
  'interest.configure',
  'interest.override',
  'users.manage',
  'backup.manage',
  'settings.manage',
]);

export const USERNAME_RE = /^[a-z0-9._-]{3,24}$/;

export const roleTone = (roleId: string): Tone => (roleId === ROLE_IDS.owner ? 'gold' : roleId === ROLE_IDS.manager ? 'info' : 'neutral');

/** A password that is easy to read out loud: no 0/O, 1/l/I. */
export function suggestPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export const samePerms = (a: readonly Permission[], b: readonly Permission[]) => a.length === b.length && a.every((p) => b.includes(p));
