import { PERMISSIONS, type AuditEntry, type Lang } from './types';
import { translate } from './i18n';
import { en } from './i18n/en';
import { makeFmt } from './format';

const has = (key: string) => key in en;
/** True when the English dictionary knows this key (dynamic keys are built at run time). */
export const hasKey = has;

/** The reference shown inside a sentence: settings entries store a code, people read a phrase. */
function readableLabel(e: AuditEntry, lang: Lang): string {
  if (e.entity === 'settings' && e.entityId === 'goldRates' && /^\d{4}-\d{2}-\d{2}$/.test(e.label)) return makeFmt(lang).date(e.label);
  if ((e.entity === 'settings' || e.entity === 'rate_plan') && has(`audit.lbl.${e.label}`)) return translate(lang, `audit.lbl.${e.label}`);
  return e.label;
}

/** One readable sentence for an audit entry, in the viewer's language. */
export function auditLine(e: AuditEntry, lang: Lang): string {
  const label = readableLabel(e, lang);
  const key = e.entity === 'settings' && e.entityId === 'goldRates' ? 'audit.s.update.goldRates' : `audit.s.${e.action}.${e.entity}`;
  if (has(key)) return translate(lang, key, { label });
  return translate(lang, 'audit.s.other', {
    action: translate(lang, `audit.act.${e.action}`),
    entity: translate(lang, `audit.ent.${e.entity}`),
    label,
  });
}

/** Small icon-family hint so the activity list can colour its dots. */
export function auditTone(e: AuditEntry): 'gold' | 'ok' | 'danger' | 'info' | 'neutral' {
  if (e.action === 'payment') return 'ok';
  if (e.action === 'override' || e.action === 'reset' || e.action === 'delete' || e.action === 'restore') return 'danger';
  if (e.action === 'create' || e.action === 'release' || e.action === 'renew') return 'gold';
  if (e.action === 'login' || e.action === 'logout') return 'neutral';
  return 'info';
}

const isPermission = (field: string) => (PERMISSIONS as readonly string[]).includes(field);

/** The name of a changed field, in the viewer's language. */
export function auditFieldLabel(field: string, lang: Lang): string {
  if (has(`audit.field.${field}`)) return translate(lang, `audit.field.${field}`);
  if (has(`perm.${field}`)) return translate(lang, `perm.${field}`);
  return field;
}

const MONEY_FIELDS = new Set(['valuation', 'interestOutstanding', 'k22']);

/** A before/after value shown the way a person would read it. */
export function auditValueText(
  field: string,
  value: string | number | boolean | null | undefined,
  lang: Lang,
  resolve?: { role?: (id: string) => string | undefined },
): string {
  const tr = (key: string) => translate(lang, key);
  const f = makeFmt(lang);
  if (value === null || value === undefined || value === '') return tr('audit.val.none');
  if (typeof value === 'boolean') return tr(isPermission(field) ? (value ? 'audit.val.allowed' : 'audit.val.denied') : value ? 'audit.val.on' : 'audit.val.off');
  switch (field) {
    case 'photo':
      return tr('audit.val.photo');
    case 'password':
      return has(`audit.val.${value}`) ? tr(`audit.val.${value}`) : String(value);
    case 'language':
    case 'defaultLanguage':
    case 'partialBase':
      return has(`audit.val.${value}`) ? tr(`audit.val.${value}`) : String(value);
    case 'status':
      return value === 'active' ? tr('status.userActive') : value === 'disabled' ? tr('status.userDisabled') : String(value);
    case 'role':
      return resolve?.role?.(String(value)) ?? String(value);
    case 'maturityDate':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? f.date(value) : String(value);
    case 'ratePlan': {
      const [nameEn, nameBn, rate, active] = String(value).split('|');
      const name = lang === 'bn' ? nameBn || nameEn : nameEn;
      return `${name} · ${f.pct(Number(rate))}${active === '0' ? ` · ${tr('audit.val.planOff')}` : ''}`;
    }
    case 'mobile':
    case 'altMobile':
    case 'phone':
    case 'nid':
    case 'ratePlans':
      return f.digits(String(value));
    default:
      break;
  }
  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(field)) return f.money(value);
    if (field === 'maxLtv') return f.pct(value);
    return f.n(value, 2);
  }
  return String(value);
}
