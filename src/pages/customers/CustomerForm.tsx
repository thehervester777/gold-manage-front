import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { Drawer } from '../../components/overlays';
import { Button, TextAreaField, TextField } from '../../components/controls';
import { useApp } from '../../lib/store';
import { useDb, useT } from '../../lib/hooks';
import { errorText } from '../../lib/hooks';
import { isValidMobile, normalizeMobile } from '../../lib/domain';
import { toast } from '../../lib/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit this customer; leave out to add a new one. */
  customerId?: string;
  onSaved?: (id: string) => void;
}

export function CustomerForm({ open, onClose, customerId, onSaved }: Props) {
  const t = useT();
  const db = useDb();
  const add = useApp((s) => s.addCustomer);
  const edit = useApp((s) => s.editCustomer);
  const existing = customerId ? db.customers.find((c) => c.id === customerId) : undefined;

  const blank = { name: '', mobile: '', address: '', nid: '', alt: '', notes: '' };
  const [v, setV] = useState(blank);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setV(existing ? { name: existing.name, mobile: existing.mobile, address: existing.address, nid: existing.nid ?? '', alt: existing.altMobile ?? '', notes: existing.notes ?? '' } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId]);

  const set = (k: keyof typeof blank) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  const errors = {
    name: !v.name.trim() ? t('err.nameRequired') : undefined,
    mobile: !isValidMobile(v.mobile) ? t('err.mobileInvalid') : undefined,
    address: !v.address.trim() ? t('err.addressRequired') : undefined,
    alt: v.alt.trim() && !isValidMobile(v.alt) ? t('err.mobileInvalid') : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  const dup = useMemo(() => {
    if (!isValidMobile(v.mobile)) return undefined;
    const m = normalizeMobile(v.mobile);
    return db.customers.find((c) => c.mobile === m && c.id !== customerId);
  }, [v.mobile, db.customers, customerId]);

  const submit = () => {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    try {
      const input = { name: v.name, mobile: v.mobile, address: v.address, nid: v.nid, altMobile: v.alt, notes: v.notes };
      let id = customerId;
      if (customerId) edit(customerId, input);
      else id = add(input);
      toast.success(customerId ? t('cust.form.saved') : t('cust.form.added'));
      onClose();
      if (id) onSaved?.(id);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? t('cust.form.editTitle') : t('cust.form.addTitle')}
      subtitle={existing ? `${existing.code}` : t('cust.form.addSub')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{existing ? t('common.saveChanges') : t('cust.form.save')}</Button>
        </>
      }
    >
      <div className="stack" style={{ '--gap': '18px' } as React.CSSProperties}>
        <TextField label={t('cust.form.name')} placeholder={t('cust.form.namePh')} value={v.name} onChange={set('name')} error={tried ? errors.name : undefined} autoComplete="off" autoFocus />
        <TextField
          label={t('cust.form.mobile')}
          hint={t('cust.form.mobileHint')}
          value={v.mobile}
          onChange={set('mobile')}
          error={tried ? errors.mobile : undefined}
          inputMode="tel"
          autoComplete="off"
          mono
        />
        {dup ? (
          <div className="callout callout--warn" role="status">
            <TriangleAlert size={18} />
            <span>
              {t('cust.form.dup', { name: dup.name, code: dup.code })}{' '}
              <Link className="link" to={`/customers/${dup.id}`} onClick={onClose}>{t('cust.form.dupOpen')}</Link>
            </span>
          </div>
        ) : null}
        <TextAreaField label={t('cust.form.address')} value={v.address} onChange={set('address')} error={tried ? errors.address : undefined} rows={2} />
        <div className="form-grid">
          <TextField label={t('cust.form.nid')} optional={t('common.optional')} value={v.nid} onChange={set('nid')} mono autoComplete="off" />
          <TextField label={t('cust.form.alt')} optional={t('common.optional')} value={v.alt} onChange={set('alt')} error={tried ? errors.alt : undefined} inputMode="tel" mono autoComplete="off" />
        </div>
        <TextAreaField label={t('cust.form.notes')} optional={t('common.optional')} placeholder={t('cust.form.notesPh')} value={v.notes} onChange={set('notes')} rows={3} />
      </div>
    </Drawer>
  );
}
