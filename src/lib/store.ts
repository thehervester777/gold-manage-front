/**
 * Application state. One zustand store holds the whole database plus a few
 * view preferences. Every business change goes through `run()`, which checks the
 * signed-in user's permission, applies the change to an immer draft (so a
 * validation error leaves the data untouched) and schedules a save.
 */
import { create } from 'zustand';
import { produce } from 'immer';
import type {
  AuditChange,
  BackupRecord,
  Bilingual,
  Database,
  GoldRate,
  InterestPolicy,
  Lang,
  Permission,
  RatePlan,
  Role,
  Settings,
  User,
} from './types';
import { type ISODate, localDateOf, nowStamp, todayISO } from './dates';
import {
  AppError,
  type AdjustInput,
  type Ctx,
  type CustomerInput,
  type ManualCheckInput,
  type NewLoanInput,
  type PaymentInput,
  type RenewInput,
  type ItemPatch,
  adjustInterest,
  collectPayment,
  createCustomer,
  createLoan,
  planCode,
  pushAudit,
  recordManualCheck,
  releasePledge,
  renewLoan,
  updateCustomer,
  updateItem,
} from './domain';
import { checkPassword, hashPassword, randomSalt, sha256Hex } from './auth';
import { DB_VERSION, baseDatabase, buildSeed } from './seed';
import {
  clearDatabase,
  deleteSnapshot,
  loadDatabase,
  loadSnapshot,
  readPref,
  removePref,
  saveDatabase,
  saveSnapshot,
  storageMode,
  type StorageMode,
  writePref,
} from './persist';
import { saveFile } from './files';
import { byteLength, cryptoSupported, countsOf, encryptBackup, parseBackup, runRestoreTest, snapshotOf, totalsOf, wrapBackup, type BackupTest } from './backup';
import { ROLE_IDS } from './permissions';

// ---------------------------------------------------------------------------
// Preferences (per browser)
// ---------------------------------------------------------------------------
export type ThemePref = 'system' | 'light' | 'dark';
export interface Prefs {
  theme: ThemePref;
  /** Inertial scrolling (Lenis). */
  smooth: boolean;
  /** Animated page-to-page transitions. */
  transitions: boolean;
  /** "full" plays the scroll stories and parallax; "calm" keeps only quick fades. */
  motion: 'full' | 'calm';
  sidebarCollapsed: boolean;
  loginLang: Lang;
}

const prefersReduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const defaultPrefs = (): Prefs => ({
  theme: 'system',
  smooth: true,
  transitions: true,
  motion: prefersReduced() ? 'calm' : 'full',
  sidebarCollapsed: false,
  loginLang: 'en',
});

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------
let idSeq = 0;
export const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Backup helpers live in ./backup (re-exported for the screens).
export { parseBackup } from './backup';
export type { BackupCounts, BackupTest, ParsedBackup } from './backup';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
const SESSION_KEY = 'session';
const SESSION_HOURS = 12;

export interface AppState {
  ready: boolean;
  db: Database | null;
  today: ISODate;
  userId: string | null;
  prefs: Prefs;
  storage: StorageMode;
  /** Bumped when data is saved, so the UI can show "saved" feedback. */
  savedAt: number;

  init(): Promise<void>;
  refreshToday(): void;
  setPrefs(patch: Partial<Prefs>): void;

  login(username: string, password: string): Promise<'ok' | 'invalid' | 'disabled'>;
  logout(): void;

  // business
  addCustomer(input: CustomerInput): string;
  editCustomer(id: string, input: CustomerInput): void;
  addLoan(input: NewLoanInput): { loanId: string; receiptId: string };
  addPayment(input: PaymentInput): { paymentId: string; receiptIds: string[]; released: boolean };
  releaseLoan(loanId: string, date: ISODate): { receiptIds: string[] };
  renew(input: RenewInput): { receiptIds: string[] };
  adjust(input: AdjustInput): string;
  manualCheck(input: ManualCheckInput): void;
  editItem(id: string, patch: ItemPatch): void;

  // settings
  setUserLanguage(lang: Lang): void;
  setDefaultLanguage(lang: Lang): void;
  saveBusiness(b: Settings['business']): void;
  savePolicy(policy: InterestPolicy, maxLtv: number, defaultTermMonths: number): void;
  approveInterestRules(): void;
  saveRatePlans(plans: RatePlan[]): void;
  addGoldRate(rate: GoldRate): void;
  saveBackupSettings(patch: Partial<Settings['backup']>): void;

  // users & roles
  saveUser(input: { id?: string; username: string; name: string; mobile?: string; roleId: string; language: Lang; password?: string }): void;
  setUserStatus(id: string, status: User['status']): void;
  changeOwnPassword(current: string, next: string): void;
  saveRole(role: Role): void;
  deleteRole(id: string): void;

  // data lifecycle
  clearSampleData(): void;
  loadSampleData(): Promise<void>;
  factoryReset(): Promise<void>;

  // backups
  createBackup(kind?: BackupRecord['kind']): Promise<BackupRecord>;
  verifyBackup(id: string): Promise<BackupTest>;
  restoreBackup(id: string): Promise<void>;
  restoreData(data: Database, source: string): Promise<void>;
  downloadBackup(id?: string, password?: string): Promise<'saved' | 'declined' | 'unsupported'>;
  deleteBackup(id: string): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => {
  // -- internals ------------------------------------------------------------
  const currentUser = (): User | undefined => {
    const s = get();
    return s.db && s.userId ? s.db.users.find((u) => u.id === s.userId) : undefined;
  };

  const persistNow = async () => {
    const db = get().db;
    if (!db) return;
    await saveDatabase(db);
    set({ storage: storageMode(), savedAt: Date.now() });
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistNow(), 350);
  };

  if (typeof window !== 'undefined') {
    const flush = () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        void persistNow();
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else get().refreshToday();
    });
  }

  const makeCtx = (user: User): Ctx => ({
    actor: { id: user.id, name: user.name, roleId: user.roleId },
    at: nowStamp(),
    today: get().today,
    id: makeId,
  });

  const can = (db: Database, user: User, perm: Permission) => !!db.roles.find((r) => r.id === user.roleId)?.permissions.includes(perm);

  /** Run a change as the signed-in user. Throws AppError and leaves the data untouched on any failure. */
  function run<T>(perm: Permission | null, fn: (d: Database, ctx: Ctx) => T): T {
    const db = get().db;
    const user = currentUser();
    if (!db || !user) throw new AppError('err.notSignedIn');
    if (user.status !== 'active') throw new AppError('err.forbidden');
    if (perm && !can(db, user, perm)) throw new AppError('err.forbidden');
    const ctx = makeCtx(user);
    let result!: T;
    const next = produce(db, (draft) => {
      result = fn(draft as Database, ctx);
    });
    set({ db: next });
    scheduleSave();
    return result;
  }

  const systemCtx = (): Ctx => ({
    actor: { id: 'system', name: 'System', roleId: '' },
    at: nowStamp(),
    today: get().today,
    id: makeId,
  });

  const settingsAudit = (d: Database, ctx: Ctx, label: string, changes: AuditChange[], entity: 'settings' | 'rate_plan' = 'settings') => {
    if (!changes.length) return;
    pushAudit(d, ctx, { action: 'update', entity, entityId: entity, label, changes });
  };

  // -- backups --------------------------------------------------------------
  const pruneBackups = async (db: Database): Promise<Database> => {
    const keep = Math.max(1, db.settings.backup.keep);
    const auto = db.backups.filter((b) => b.kind === 'auto').sort((a, b) => b.at.localeCompare(a.at));
    const pre = db.backups.filter((b) => b.kind === 'pre_restore').sort((a, b) => b.at.localeCompare(a.at));
    const drop = new Set([...auto.slice(keep), ...pre.slice(3)].map((b) => b.id));
    if (!drop.size) return db;
    await Promise.all([...drop].map((id) => deleteSnapshot(id)));
    return { ...db, backups: db.backups.filter((b) => !drop.has(b.id)) };
  };

  const makeBackup = async (kind: BackupRecord['kind'], by: string, auditCtx?: Ctx): Promise<BackupRecord> => {
    const db = get().db!;
    const json = snapshotOf(db);
    const record: BackupRecord = {
      id: makeId('bk'),
      at: nowStamp(),
      by,
      kind,
      sizeBytes: byteLength(json),
      checksum: sha256Hex(json),
      counts: countsOf(db),
      totals: totalsOf(db, get().today),
    };
    await saveSnapshot(record.id, json);
    let next = produce(get().db!, (d) => {
      d.backups.push(record);
      if (kind === 'auto') d.settings.backup.lastAutoAt = record.at;
      if (auditCtx) pushAudit(d as Database, auditCtx, { action: 'backup', entity: 'backup', entityId: record.id, label: record.id.slice(-6), meta: { kind, size: record.sizeBytes } });
    });
    next = await pruneBackups(next);
    set({ db: next });
    scheduleSave();
    return record;
  };

  const maybeAutoBackup = async () => {
    const db = get().db;
    if (!db || !db.settings.backup.autoDaily) return;
    const last = db.settings.backup.lastAutoAt ? localDateOf(db.settings.backup.lastAutoAt) : undefined;
    if (last === get().today) return;
    if (!db.customers.length && !db.audit.length) return;
    await makeBackup('auto', 'System', systemCtx());
  };

  let initPromise: Promise<void> | null = null;
  const runInit = async () => {
    const today = todayISO();
    let db = await loadDatabase();
    let fresh = false;
    if (!db || typeof db.version !== 'number' || db.version !== DB_VERSION || !Array.isArray(db.customers)) {
      // Let the splash paint before the (synchronous) sample build.
      await new Promise((r) => setTimeout(r, 30));
      db = buildSeed(today);
      fresh = true;
    }
    set({ db, today, ready: true, storage: storageMode() });
    if (fresh) await persistNow();

    const sess = readPref<{ userId: string; exp: number } | null>(SESSION_KEY, null);
    if (sess && sess.exp > Date.now() && db.users.some((u) => u.id === sess.userId && u.status === 'active')) {
      set({ userId: sess.userId });
    } else if (sess) {
      removePref(SESSION_KEY);
    }
    try {
      await maybeAutoBackup();
    } catch {
      /* backups are best-effort at start-up */
    }
  };

  // -- the store ------------------------------------------------------------
  return {
    ready: false,
    db: null,
    today: todayISO(),
    userId: null,
    prefs: { ...defaultPrefs(), ...readPref<Partial<Prefs>>('prefs', {}) },
    storage: 'idb',
    savedAt: 0,

    init() {
      if (get().ready) return Promise.resolve();
      return (initPromise ??= runInit());
    },

    refreshToday() {
      const t = todayISO();
      if (t !== get().today) set({ today: t });
    },

    setPrefs(patch) {
      const prefs = { ...get().prefs, ...patch };
      set({ prefs });
      writePref('prefs', prefs);
    },

    async login(username, password) {
      const db = get().db;
      if (!db) return 'invalid';
      const name = username.trim().toLowerCase();
      const user = db.users.find((u) => u.username.toLowerCase() === name);
      // Hash either way, so timing does not reveal whether the username exists.
      const ok = checkPassword(password, user?.salt ?? 'none', user?.passwordHash ?? 'none');
      if (!user || !ok) return 'invalid';
      if (user.status !== 'active') return 'disabled';
      const stamp = nowStamp();
      const ctx: Ctx = { actor: { id: user.id, name: user.name, roleId: user.roleId }, at: stamp, today: get().today, id: makeId };
      const next = produce(db, (d) => {
        const u = d.users.find((x) => x.id === user.id)!;
        u.lastLoginAt = stamp;
        pushAudit(d as Database, ctx, { action: 'login', entity: 'session', entityId: user.id, label: user.username });
      });
      writePref(SESSION_KEY, { userId: user.id, exp: Date.now() + SESSION_HOURS * 3_600_000 });
      set({ db: next, userId: user.id });
      scheduleSave();
      return 'ok';
    },

    logout() {
      const user = currentUser();
      if (user && get().db) {
        const ctx = makeCtx(user);
        set({ db: produce(get().db!, (d) => void pushAudit(d as Database, ctx, { action: 'logout', entity: 'session', entityId: user.id, label: user.username })) });
        scheduleSave();
      }
      removePref(SESSION_KEY);
      set({ userId: null });
    },

    // ---- business ---------------------------------------------------------
    addCustomer: (input) => run('customers.edit', (d, c) => createCustomer(d, c, input)),
    editCustomer: (id, input) => run('customers.edit', (d, c) => updateCustomer(d, c, id, input)),
    addLoan: (input) => run('loans.create', (d, c) => createLoan(d, c, input)),
    addPayment: (input) => run('payments.collect', (d, c) => collectPayment(d, c, input)),
    releaseLoan: (loanId, date) => run('loans.release', (d, c) => releasePledge(d, c, loanId, date)),
    renew: (input) => run('loans.renew', (d, c) => renewLoan(d, c, input)),
    adjust: (input) => run('interest.override', (d, c) => adjustInterest(d, c, input)),
    manualCheck: (input) => void run('interest.override', (d, c) => recordManualCheck(d, c, input)),
    editItem: (id, patch) => run('items.edit', (d, c) => updateItem(d, c, id, patch)),

    // ---- settings ---------------------------------------------------------
    setUserLanguage(lang) {
      const user = currentUser();
      if (!user) {
        get().setPrefs({ loginLang: lang });
        return;
      }
      run(null, (d) => {
        const u = d.users.find((x) => x.id === user.id);
        if (u) u.language = lang;
      });
      get().setPrefs({ loginLang: lang });
    },

    setDefaultLanguage: (lang) =>
      run('settings.manage', (d, c) => {
        if (d.settings.defaultLanguage !== lang) {
          settingsAudit(d, c, 'defaultLanguage', [{ field: 'defaultLanguage', before: d.settings.defaultLanguage, after: lang }]);
          d.settings.defaultLanguage = lang;
        }
      }),

    saveBusiness: (b) =>
      run('settings.manage', (d, c) => {
        const changes: AuditChange[] = [];
        const cmp = (field: string, before: string, after: string) => before !== after && changes.push({ field, before, after });
        const o = d.settings.business;
        cmp('name.en', o.name.en, b.name.en);
        cmp('name.bn', o.name.bn, b.name.bn);
        cmp('tagline.en', o.tagline.en, b.tagline.en);
        cmp('tagline.bn', o.tagline.bn, b.tagline.bn);
        cmp('address.en', o.address.en, b.address.en);
        cmp('address.bn', o.address.bn, b.address.bn);
        cmp('phone', o.phone, b.phone);
        cmp('email', o.email, b.email);
        cmp('licenseNo', o.licenseNo, b.licenseNo);
        cmp('receiptFooter.en', o.receiptFooter.en, b.receiptFooter.en);
        cmp('receiptFooter.bn', o.receiptFooter.bn, b.receiptFooter.bn);
        d.settings.business = b;
        settingsAudit(d, c, 'business', changes);
      }),

    savePolicy: (policy, maxLtv, defaultTermMonths) =>
      run('interest.configure', (d, c) => {
        if (!Number.isInteger(policy.graceDays) || policy.graceDays < 0 || policy.graceDays > 15) throw new AppError('err.policyInvalid');
        if (!Number.isInteger(policy.minMonths) || policy.minMonths < 0 || policy.minMonths > 3) throw new AppError('err.policyInvalid');
        if (!(maxLtv > 0 && maxLtv <= 100)) throw new AppError('err.policyInvalid');
        if (!Number.isInteger(defaultTermMonths) || defaultTermMonths < 1 || defaultTermMonths > 36) throw new AppError('err.termInvalid');
        const s = d.settings.interest;
        const changes: AuditChange[] = [];
        if (s.policy.graceDays !== policy.graceDays) changes.push({ field: 'graceDays', before: s.policy.graceDays, after: policy.graceDays });
        if (s.policy.minMonths !== policy.minMonths) changes.push({ field: 'minMonths', before: s.policy.minMonths, after: policy.minMonths });
        if (s.policy.partialBase !== policy.partialBase) changes.push({ field: 'partialBase', before: s.policy.partialBase, after: policy.partialBase });
        if (s.maxLtv !== maxLtv) changes.push({ field: 'maxLtv', before: s.maxLtv, after: maxLtv });
        if (s.defaultTermMonths !== defaultTermMonths) changes.push({ field: 'defaultTermMonths', before: s.defaultTermMonths, after: defaultTermMonths });
        s.policy = { ...policy };
        s.maxLtv = maxLtv;
        s.defaultTermMonths = defaultTermMonths;
        if (changes.length) {
          // A changed rule needs a fresh sign-off.
          s.approvedBy = undefined;
          s.approvedAt = undefined;
          settingsAudit(d, c, 'interest', changes);
        }
      }),

    approveInterestRules: () =>
      run('interest.configure', (d, c) => {
        d.settings.interest.approvedBy = c.actor.name;
        d.settings.interest.approvedAt = c.at;
        pushAudit(d, c, { action: 'approve', entity: 'settings', entityId: 'interest', label: 'interest' });
      }),

    saveRatePlans: (plans) =>
      run('interest.configure', (d, c) => {
        for (const p of plans) {
          if (!p.name.en.trim() || !p.name.bn.trim()) throw new AppError('err.nameRequired');
          if (!(p.rate > 0 && p.rate <= 15)) throw new AppError('err.rateInvalid');
        }
        const old = d.settings.ratePlans;
        const changes: AuditChange[] = [];
        for (const p of plans) {
          const o = old.find((x) => x.id === p.id);
          if (!o) changes.push({ field: 'ratePlan', before: null, after: planCode(p) });
          else if (planCode(o) !== planCode(p)) changes.push({ field: 'ratePlan', before: planCode(o), after: planCode(p) });
        }
        for (const o of old) if (!plans.some((x) => x.id === o.id)) changes.push({ field: 'ratePlan', before: planCode(o), after: null });
        d.settings.ratePlans = plans;
        settingsAudit(d, c, 'ratePlans', changes, 'rate_plan');
      }),

    addGoldRate: (rate) =>
      run('settings.manage', (d, c) => {
        if (![rate.k24, rate.k22, rate.k21, rate.k18].every((v) => Number.isFinite(v) && v > 0)) throw new AppError('err.amountInvalid');
        const list = d.settings.goldRates.filter((r) => r.date !== rate.date);
        list.push(rate);
        list.sort((a, b) => a.date.localeCompare(b.date));
        d.settings.goldRates = list.slice(-120);
        pushAudit(d, c, { action: 'update', entity: 'settings', entityId: 'goldRates', label: rate.date, changes: [{ field: 'k22', before: null, after: rate.k22 }] });
      }),

    saveBackupSettings: (patch) =>
      run('backup.manage', (d, c) => {
        const o = d.settings.backup;
        const changes: AuditChange[] = [];
        if (patch.autoDaily !== undefined && patch.autoDaily !== o.autoDaily) changes.push({ field: 'autoDaily', before: o.autoDaily, after: patch.autoDaily });
        if (patch.keep !== undefined && patch.keep !== o.keep) changes.push({ field: 'keep', before: o.keep, after: patch.keep });
        d.settings.backup = { ...o, ...patch, keep: Math.min(30, Math.max(1, patch.keep ?? o.keep)) };
        settingsAudit(d, c, 'backup', changes);
      }),

    // ---- users & roles ----------------------------------------------------
    saveUser: (input) =>
      run('users.manage', (d, c) => {
        const username = input.username.trim().toLowerCase();
        const name = input.name.trim();
        if (!name) throw new AppError('err.nameRequired');
        if (!/^[a-z0-9._-]{3,24}$/.test(username)) throw new AppError('err.usernameInvalid');
        if (!d.roles.some((r) => r.id === input.roleId)) throw new AppError('err.notFound');
        if (d.users.some((u) => u.username.toLowerCase() === username && u.id !== input.id)) throw new AppError('err.usernameTaken');
        if (input.password !== undefined && input.password !== '' && input.password.length < 6) throw new AppError('err.passwordShort');
        if (input.id) {
          const u = d.users.find((x) => x.id === input.id);
          if (!u) throw new AppError('err.notFound');
          if (u.roleId === ROLE_IDS.owner && input.roleId !== ROLE_IDS.owner && d.users.filter((x) => x.roleId === ROLE_IDS.owner && x.status === 'active').length <= 1) {
            throw new AppError('err.lastOwner');
          }
          const changes: AuditChange[] = [];
          if (u.name !== name) changes.push({ field: 'name', before: u.name, after: name });
          if (u.username !== username) changes.push({ field: 'username', before: u.username, after: username });
          if (u.roleId !== input.roleId) changes.push({ field: 'role', before: u.roleId, after: input.roleId });
          if ((u.mobile ?? '') !== (input.mobile ?? '')) changes.push({ field: 'mobile', before: u.mobile ?? null, after: input.mobile ?? null });
          if (u.language !== input.language) changes.push({ field: 'language', before: u.language, after: input.language });
          Object.assign(u, { username, name, mobile: input.mobile?.trim() || undefined, roleId: input.roleId, language: input.language });
          if (input.password) {
            u.salt = randomSalt();
            u.passwordHash = hashPassword(input.password, u.salt);
            changes.push({ field: 'password', before: null, after: 'reset' });
          }
          if (changes.length) pushAudit(d, c, { action: 'update', entity: 'user', entityId: u.id, label: u.username, changes });
        } else {
          if (!input.password) throw new AppError('err.passwordShort');
          const salt = randomSalt();
          const u: User = {
            id: c.id('u'),
            username,
            name,
            mobile: input.mobile?.trim() || undefined,
            roleId: input.roleId,
            status: 'active',
            salt,
            passwordHash: hashPassword(input.password, salt),
            language: input.language,
            createdAt: c.at,
            createdBy: c.actor.id,
          };
          d.users.push(u);
          pushAudit(d, c, { action: 'create', entity: 'user', entityId: u.id, label: u.username });
        }
      }),

    setUserStatus: (id, status) =>
      run('users.manage', (d, c) => {
        const u = d.users.find((x) => x.id === id);
        if (!u) throw new AppError('err.notFound');
        if (u.id === c.actor.id) throw new AppError('err.selfDisable');
        if (status === 'disabled' && u.roleId === ROLE_IDS.owner && d.users.filter((x) => x.roleId === ROLE_IDS.owner && x.status === 'active').length <= 1) {
          throw new AppError('err.lastOwner');
        }
        if (u.status !== status) {
          pushAudit(d, c, { action: 'update', entity: 'user', entityId: id, label: u.username, changes: [{ field: 'status', before: u.status, after: status }] });
          u.status = status;
        }
      }),

    changeOwnPassword: (current, next) =>
      run(null, (d, c) => {
        const u = d.users.find((x) => x.id === c.actor.id);
        if (!u) throw new AppError('err.notFound');
        if (!checkPassword(current, u.salt, u.passwordHash)) throw new AppError('err.passwordWrong');
        if (next.length < 6) throw new AppError('err.passwordShort');
        u.salt = randomSalt();
        u.passwordHash = hashPassword(next, u.salt);
        pushAudit(d, c, { action: 'update', entity: 'user', entityId: u.id, label: u.username, changes: [{ field: 'password', before: null, after: 'changed' }] });
      }),

    saveRole: (role) =>
      run('users.manage', (d, c) => {
        if (!role.name.en.trim() || !role.name.bn.trim()) throw new AppError('err.nameRequired');
        const existing = d.roles.find((r) => r.id === role.id);
        if (existing?.locked) throw new AppError('err.roleLocked');
        if (existing) {
          const added = role.permissions.filter((p) => !existing.permissions.includes(p));
          const removed = existing.permissions.filter((p) => !role.permissions.includes(p));
          const changes: AuditChange[] = [
            ...added.map((p) => ({ field: p, before: false, after: true })),
            ...removed.map((p) => ({ field: p, before: true, after: false })),
          ];
          if (existing.name.en !== role.name.en) changes.push({ field: 'name', before: existing.name.en, after: role.name.en });
          Object.assign(existing, { name: role.name, description: role.description, permissions: role.permissions });
          if (changes.length) pushAudit(d, c, { action: 'update', entity: 'role', entityId: role.id, label: role.name.en, changes });
        } else {
          d.roles.push({ ...role, system: false });
          pushAudit(d, c, { action: 'create', entity: 'role', entityId: role.id, label: role.name.en });
        }
      }),

    deleteRole: (id) =>
      run('users.manage', (d, c) => {
        const r = d.roles.find((x) => x.id === id);
        if (!r) throw new AppError('err.notFound');
        if (r.system) throw new AppError('err.roleLocked');
        if (d.users.some((u) => u.roleId === id)) throw new AppError('err.roleInUse');
        d.roles = d.roles.filter((x) => x.id !== id);
        pushAudit(d, c, { action: 'delete', entity: 'role', entityId: id, label: r.name.en });
      }),

    // ---- data lifecycle ---------------------------------------------------
    clearSampleData: () =>
      run('settings.manage', (d, c) => {
        const keepCtx = c;
        d.customers = [];
        d.loans = [];
        d.items = [];
        d.payments = [];
        d.receipts = [];
        d.audit = [];
        d.settings.counters = { customer: 0, loan: 0, item: 0, receipt: 0 };
        d.meta.demo = false;
        pushAudit(d, keepCtx, { action: 'reset', entity: 'settings', entityId: 'data', label: 'clear', meta: { scope: 'sample' } });
      }),

    async loadSampleData() {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      const db = get().db!;
      if (!can(db, user, 'settings.manage')) throw new AppError('err.forbidden');
      const seed = buildSeed(get().today);
      const next: Database = {
        ...seed,
        users: db.users,
        roles: db.roles,
        settings: { ...seed.settings, business: db.settings.business, defaultLanguage: db.settings.defaultLanguage, backup: db.settings.backup },
        backups: db.backups,
      };
      const ctx = makeCtx(user);
      set({ db: produce(next, (d) => void pushAudit(d as Database, ctx, { action: 'reset', entity: 'settings', entityId: 'data', label: 'sample', meta: { scope: 'load' } })) });
      await persistNow();
    },

    async factoryReset() {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      const db = get().db!;
      if (!can(db, user, 'settings.manage')) throw new AppError('err.forbidden');
      await Promise.all(db.backups.map((b) => deleteSnapshot(b.id)));
      await clearDatabase();
      removePref(SESSION_KEY);
      set({ db: buildSeed(get().today), userId: null });
      await persistNow();
    },

    // ---- backups ----------------------------------------------------------
    async createBackup(kind = 'manual') {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      if (!can(get().db!, user, 'backup.manage')) throw new AppError('err.forbidden');
      return makeBackup(kind, user.name, makeCtx(user));
    },

    async verifyBackup(id) {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      if (!can(get().db!, user, 'backup.manage')) throw new AppError('err.forbidden');
      const rec = get().db!.backups.find((b) => b.id === id);
      if (!rec) throw new AppError('err.notFound');
      const json = await loadSnapshot(id);
      const result = runRestoreTest({ text: json, expect: { checksum: rec.checksum, counts: rec.counts, totals: rec.totals } });
      set({
        db: produce(get().db!, (d) => {
          const r = d.backups.find((b) => b.id === id);
          if (r) {
            r.verifiedAt = nowStamp();
            r.verifiedOk = result.ok;
          }
        }),
      });
      scheduleSave();
      return result;
    },

    async restoreData(data, source) {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      if (!can(get().db!, user, 'backup.manage')) throw new AppError('err.forbidden');
      // Safety copy first, so a restore can always be undone.
      await makeBackup('pre_restore', user.name, makeCtx(user));
      const backups = get().db!.backups;
      const ctx = makeCtx(user);
      const restored = produce({ ...data, version: DB_VERSION, backups } as Database, (d) => {
        const actorStillThere = d.users.some((u) => u.id === user.id);
        pushAudit(d as Database, actorStillThere ? ctx : { ...ctx, actor: { ...ctx.actor, id: 'system' } }, {
          action: 'restore',
          entity: 'backup',
          entityId: source,
          label: source,
          meta: { customers: d.customers.length, loans: d.loans.length },
        });
      });
      set({ db: restored });
      if (!restored.users.some((u) => u.id === user.id && u.status === 'active')) {
        removePref(SESSION_KEY);
        set({ userId: null });
      }
      await persistNow();
    },

    async restoreBackup(id) {
      const rec = get().db!.backups.find((b) => b.id === id);
      if (!rec) throw new AppError('err.notFound');
      const json = await loadSnapshot(id);
      if (!json) throw new AppError('err.backupMissing');
      if (sha256Hex(json) !== rec.checksum) throw new AppError('err.backupCorrupt');
      const parsed = parseBackup(json);
      if (!parsed.ok) throw new AppError('err.backupCorrupt');
      await get().restoreData(parsed.data, rec.id.slice(-6));
    },

    async downloadBackup(id, password) {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      const state = get();
      const db = state.db!;
      if (!can(db, user, 'backup.manage')) throw new AppError('err.forbidden');
      let json: string;
      let at = nowStamp();
      let counts = countsOf(db);
      let totals = totalsOf(db, state.today);
      if (id) {
        const rec = db.backups.find((b) => b.id === id);
        const loaded = await loadSnapshot(id);
        if (!rec || !loaded) throw new AppError('err.backupMissing');
        json = loaded;
        at = rec.at;
        counts = rec.counts;
        const parsed = parseBackup(loaded);
        totals = rec.totals ?? (parsed.ok ? totalsOf(parsed.data, localDateOf(rec.at)) : totals);
      } else {
        json = snapshotOf(db);
      }
      let file = wrapBackup(json, at, counts, totals);
      let name = `ithika-gold-house-backup-${localDateOf(at)}`;
      if (password) {
        if (!cryptoSupported()) throw new AppError('err.backupNoCrypto');
        file = await encryptBackup(file, password, at);
        name += '-protected';
      }
      return saveFile(`${name}.json`, file, 'application/json');
    },

    async deleteBackup(id) {
      const user = currentUser();
      if (!user) throw new AppError('err.notSignedIn');
      if (!can(get().db!, user, 'backup.manage')) throw new AppError('err.forbidden');
      await deleteSnapshot(id);
      set({ db: produce(get().db!, (d) => void (d.backups = d.backups.filter((b) => b.id !== id))) });
      scheduleSave();
    },
  };
});

// ---------------------------------------------------------------------------
// Plain selectors
// ---------------------------------------------------------------------------
export const selectUser = (s: AppState): User | undefined => (s.db && s.userId ? s.db.users.find((u) => u.id === s.userId) : undefined);
export const selectRole = (s: AppState): Role | undefined => {
  const u = selectUser(s);
  return u && s.db ? s.db.roles.find((r) => r.id === u.roleId) : undefined;
};
export const selectLang = (s: AppState): Lang => selectUser(s)?.language ?? s.prefs.loginLang;

export const bi = (b: Bilingual, lang: Lang) => b[lang] || b.en;
