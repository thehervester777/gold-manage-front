import type { LucideIcon } from 'lucide-react';
import {
  Wallet, HandCoins, Gem, LayoutDashboard, Percent, Receipt, ScrollText, Settings, ShieldCheck, Users, DatabaseBackup, FileChartColumn, Plus,
} from 'lucide-react';
import type { Permission } from '../lib/types';
import type { TKey } from '../lib/i18n';

export interface NavItem {
  path: string;
  key: TKey;
  icon: LucideIcon;
  perm?: Permission;
  end?: boolean;
  group: 'overview' | 'operations' | 'insight' | 'admin';
}

export const NAV: NavItem[] = [
  { path: '/', key: 'nav.dashboard', icon: LayoutDashboard, perm: 'dashboard.view', end: true, group: 'overview' },
  { path: '/customers', key: 'nav.customers', icon: Users, perm: 'customers.view', group: 'operations' },
  { path: '/loans', key: 'nav.loans', icon: HandCoins, perm: 'loans.view', group: 'operations' },
  { path: '/vault', key: 'nav.vault', icon: Gem, perm: 'items.view', group: 'operations' },
  { path: '/payments', key: 'nav.payments', icon: Wallet, perm: 'loans.view', group: 'operations' },
  { path: '/receipts', key: 'nav.receipts', icon: Receipt, perm: 'receipts.view', group: 'insight' },
  { path: '/reports', key: 'nav.reports', icon: FileChartColumn, perm: 'reports.view', group: 'insight' },
  { path: '/interest', key: 'nav.interest', icon: Percent, perm: 'loans.view', group: 'insight' },
  { path: '/users', key: 'nav.users', icon: ShieldCheck, perm: 'users.manage', group: 'admin' },
  { path: '/audit', key: 'nav.audit', icon: ScrollText, perm: 'audit.view', group: 'admin' },
  { path: '/backup', key: 'nav.backup', icon: DatabaseBackup, perm: 'backup.manage', group: 'admin' },
  { path: '/settings', key: 'nav.settings', icon: Settings, group: 'admin' },
];

export const NAV_GROUPS: { id: NavItem['group']; key: TKey }[] = [
  { id: 'overview', key: 'nav.overview' },
  { id: 'operations', key: 'nav.operations' },
  { id: 'insight', key: 'nav.insight' },
  { id: 'admin', key: 'nav.admin' },
];

export const NEW_LOAN = { path: '/loans/new', key: 'nav.newLoan' as TKey, icon: Plus, perm: 'loans.create' as Permission };

/** Which section a path belongs to — moving inside a section gets a lighter transition. */
export const sectionOf = (pathname: string) => (pathname === '/' ? '/' : `/${pathname.split('/')[1] ?? ''}`);

export function titleKeyFor(pathname: string): TKey | null {
  if (pathname === '/loans/new') return 'nav.newLoan';
  const hit = NAV.filter((n) => (n.end ? pathname === n.path : pathname === n.path || pathname.startsWith(`${n.path}/`))).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
  return hit?.key ?? null;
}
