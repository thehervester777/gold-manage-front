import { PERMISSIONS, type Permission, type Role } from './types';

export const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** Permission groups shown in the role editor. */
export const PERMISSION_GROUPS: { id: string; permissions: Permission[] }[] = [
  { id: 'overview', permissions: ['dashboard.view'] },
  { id: 'customers', permissions: ['customers.view', 'customers.edit'] },
  { id: 'loans', permissions: ['loans.view', 'loans.create', 'loans.renew', 'loans.release', 'payments.collect'] },
  { id: 'items', permissions: ['items.view', 'items.edit'] },
  { id: 'records', permissions: ['receipts.view', 'reports.view', 'audit.view'] },
  { id: 'interest', permissions: ['interest.configure', 'interest.override'] },
  { id: 'admin', permissions: ['users.manage', 'backup.manage', 'settings.manage'] },
];

export const ROLE_IDS = {
  owner: 'role_owner',
  manager: 'role_manager',
  cashier: 'role_cashier',
  auditor: 'role_auditor',
} as const;

export function defaultRoles(): Role[] {
  return [
    {
      id: ROLE_IDS.owner,
      name: { en: 'Owner', bn: 'মালিক' },
      description: {
        en: 'Full access to every account, report, receipt and setting.',
        bn: 'সব হিসাব, প্রতিবেদন, রসিদ ও সেটিংসে পূর্ণ অধিকার।',
      },
      permissions: [...ALL_PERMISSIONS],
      system: true,
      locked: true,
    },
    {
      id: ROLE_IDS.manager,
      name: { en: 'Manager', bn: 'ম্যানেজার' },
      description: {
        en: 'Runs daily work, renews and releases pledges, checks interest and sees every report.',
        bn: 'দৈনন্দিন কাজ চালান, বন্ধক নবায়ন ও ছাড় করেন, সুদ যাচাই করেন এবং সব প্রতিবেদন দেখেন।',
      },
      permissions: [
        'dashboard.view', 'customers.view', 'customers.edit', 'loans.view', 'loans.create', 'loans.renew',
        'loans.release', 'payments.collect', 'items.view', 'items.edit', 'receipts.view', 'reports.view',
        'interest.override', 'audit.view',
      ],
      system: true,
    },
    {
      id: ROLE_IDS.cashier,
      name: { en: 'Cashier', bn: 'ক্যাশিয়ার' },
      description: {
        en: 'Registers customers, issues loans and collects payments.',
        bn: 'গ্রাহক নিবন্ধন করেন, ঋণ দেন এবং টাকা আদায় করেন।',
      },
      permissions: [
        'dashboard.view', 'customers.view', 'customers.edit', 'loans.view', 'loans.create', 'payments.collect',
        'items.view', 'receipts.view',
      ],
      system: true,
    },
    {
      id: ROLE_IDS.auditor,
      name: { en: 'Auditor', bn: 'অডিটর' },
      description: {
        en: 'Read-only access to records, reports and the audit log.',
        bn: 'রেকর্ড, প্রতিবেদন ও অডিট লগ শুধু দেখতে পারেন।',
      },
      permissions: ['dashboard.view', 'customers.view', 'loans.view', 'items.view', 'receipts.view', 'reports.view', 'audit.view'],
      system: true,
    },
  ];
}

/** Which permission each route needs. A missing entry means any signed-in user. */
export const ROUTE_PERMISSIONS: { prefix: string; permission: Permission }[] = [
  { prefix: '/customers', permission: 'customers.view' },
  { prefix: '/loans/new', permission: 'loans.create' },
  { prefix: '/loans', permission: 'loans.view' },
  { prefix: '/vault', permission: 'items.view' },
  { prefix: '/payments', permission: 'loans.view' },
  { prefix: '/receipts', permission: 'receipts.view' },
  { prefix: '/reports', permission: 'reports.view' },
  { prefix: '/interest', permission: 'loans.view' },
  { prefix: '/users', permission: 'users.manage' },
  { prefix: '/audit', permission: 'audit.view' },
  { prefix: '/backup', permission: 'backup.manage' },
];

export function permissionForPath(path: string): Permission | undefined {
  return ROUTE_PERMISSIONS.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`))?.permission;
}
