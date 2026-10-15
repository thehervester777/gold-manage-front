import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Gem, MapPin, Pencil, Percent, Phone, Plus, TriangleAlert, UserPlus, UserRound, X } from 'lucide-react';
import { Avatar, Card, CardHead, PageHeader } from '../../components/blocks';
import { Button, ButtonLink, CheckBox, Chip } from '../../components/controls';
import { Combobox, type ComboOption } from '../../components/pickers';
import { ItemArt } from '../../components/ItemArt';
import { KV } from '../../components/lists';
import { Seal } from '../../components/Seal';
import { gsap } from '../../motion/gsap';
import { fullMotion, usePageFX } from '../../motion/fx';
import { scrollToElement } from '../../motion/smooth';
import { Num } from '../../motion/Num';
import { useApp } from '../../lib/store';
import { errorText, useCan, useDb, useFmt, useRows, useT, useToday } from '../../lib/hooks';
import { confirmDialog, toast } from '../../lib/ui';
import { cx } from '../../lib/cx';
import { addMonths, localDateOf } from '../../lib/dates';
import { locationText } from '../../lib/domain';
import { CustomerForm } from '../customers/CustomerForm';
import { ItemEditor } from './wizard/ItemEditor';
import { TermsStep, TERM_PRESETS, resolveRate } from './wizard/TermsStep';
import { blankDraft, blankItem, itemValid, netOf, toItemInput, totals, type Draft, type DraftItem, type DraftTerms } from './wizard/draft';

const STEPS = [
  { id: 'customer', key: 'wiz.step.customer', icon: UserRound },
  { id: 'items', key: 'wiz.step.items', icon: Gem },
  { id: 'terms', key: 'wiz.step.terms', icon: Percent },
  { id: 'review', key: 'wiz.step.review', icon: ClipboardCheck },
] as const;

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (n: number) => void }) {
  const t = useT();
  const fill = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const p = step / (STEPS.length - 1);
    if (first.current || !fullMotion()) {
      gsap.set(fill.current, { scaleX: p });
      first.current = false;
    } else {
      gsap.to(fill.current, { scaleX: p, duration: 0.9, ease: 'igh' });
    }
  }, [step]);

  return (
    <nav className="card stepper" aria-label={t('wiz.title')} data-fx="rise">
      <div className="stepper__wrap">
        <div className="stepper__track" aria-hidden="true">
          <span ref={fill} className="stepper__fill" />
        </div>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.id} className={cx('step', i < step && 'is-done', i === step && 'is-current')}>
              <button type="button" disabled={i > reached} onClick={() => onGo(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="step__dot">{i < step ? <Check size={17} strokeWidth={2.6} /> : <s.icon size={17} />}</span>
                <span className="step__label">{t(s.key)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — customer
// ---------------------------------------------------------------------------
function CustomerStep({ customerId, onPick, showError }: { customerId: string | null; onPick: (id: string | null) => void; showError: boolean }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const rows = useRows();
  const [adding, setAdding] = useState(false);
  const options = useMemo<ComboOption[]>(
    () =>
      db.customers.map((c) => ({
        id: c.id,
        label: c.name,
        sub: `${c.code} · ${c.mobile}`,
        search: `${c.name} ${c.mobile} ${c.code} ${c.altMobile ?? ''}`.toLowerCase(),
      })),
    [db.customers],
  );
  const customer = customerId ? db.customers.find((c) => c.id === customerId) : undefined;
  const mine = customer ? rows.filter((r) => r.customer.id === customer.id && r.loan.status === 'active') : [];
  const owed = mine.reduce((s, r) => s + r.calc.totalOutstanding, 0);
  const late = mine.filter((r) => r.state === 'overdue').length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="wiz-pick">
        <Combobox
          className="grow"
          label={t('common.customer')}
          value={customerId}
          onChange={onPick}
          options={options}
          placeholder={t('wiz.c.placeholder')}
          searchPlaceholder={t('wiz.c.search')}
          emptyText={t('wiz.c.empty')}
          error={showError && !customerId ? t('err.customerRequired') : undefined}
          big
        />
        <Button variant="secondary" icon={<UserPlus size={17} />} onClick={() => setAdding(true)}>{t('wiz.c.new')}</Button>
      </div>

      {customer ? (
        <div className="sel-customer" key={customer.id}>
          <Avatar name={customer.name} size="xl" />
          <div className="sel-customer__main">
            <div className="row row--wrap" style={{ gap: 10 }}>
              <h3 className="display sel-customer__name">{customer.name}</h3>
              <Chip tone="neutral" plain><span className="mono">{customer.code}</span></Chip>
            </div>
            <div className="sel-customer__facts">
              <span><Phone size={15} /> <span className="mono">{customer.mobile}</span></span>
              <span><MapPin size={15} /> {customer.address}</span>
            </div>
            <div className="row row--wrap" style={{ gap: 8 }}>
              {mine.length ? (
                <>
                  <Chip tone="info">{t('wiz.c.activeLoans', { n: mine.length })}</Chip>
                  <Chip tone="gold" plain>{t('wiz.c.outstanding', { a: f.money(owed) })}</Chip>
                </>
              ) : (
                <Chip tone="ok" plain>{t('wiz.c.first')}</Chip>
              )}
              <span className="muted small">{t('wiz.c.history', { date: f.date(localDateOf(customer.createdAt)) })}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={() => onPick(null)}>{t('wiz.c.change')}</Button>
        </div>
      ) : null}

      {late > 0 ? (
        <div className="callout callout--danger" role="status">
          <TriangleAlert size={18} />
          <span>
            {t('wiz.c.overdue', { n: late })}{' '}
            <Link className="link" to={`/customers/${customer!.id}`}>{t('common.view')}</Link>
          </span>
        </div>
      ) : null}

      <CustomerForm open={adding} onClose={() => setAdding(false)} onSaved={(id) => onPick(id)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — review
// ---------------------------------------------------------------------------
function ReviewStep({ draft, high, maxLtv, onEdit, onChange }: { draft: Draft; high: boolean; maxLtv: number; onEdit: (n: number) => void; onChange: (patch: Partial<Draft>) => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const plans = db.settings.ratePlans;
  const customer = db.customers.find((c) => c.id === draft.customerId);
  const tot = totals(draft.items);
  const rate = resolveRate(draft.terms, plans) ?? 0;
  const principal = draft.terms.principal ?? 0;
  const maturity = addMonths(draft.terms.date, draft.terms.term ?? 0);
  const ratio = tot.value > 0 ? (principal / tot.value) * 100 : 0;
  const edit = (n: number) => (
    <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => onEdit(n)}>{t('wiz.r.edit')}</Button>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <Card flat sunken className="rv">
        <CardHead title={t('wiz.step.customer')} actions={edit(0)} />
        {customer ? (
          <div className="rv__body rv__person">
            <Avatar name={customer.name} />
            <div className="cell-main">
              <b>{customer.name}</b>
              <span><span className="mono">{customer.code}</span> · <span className="mono">{customer.mobile}</span></span>
              <span>{customer.address}</span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card flat sunken className="rv">
        <CardHead title={t('wiz.step.items')} sub={`${t('common.itemCount', { n: tot.count })} · ${f.weight(tot.net)} · ${f.money(tot.value)}`} actions={edit(1)} />
        <ul className="item-rows">
          {draft.items.map((i) => (
            <li key={i.key} className="item-row">
              <span className="item-row__pic">{i.photo ? <img src={i.photo} alt="" /> : <ItemArt category={i.category} size={42} />}</span>
              <span className="cell-main grow">
                <b>{i.description}</b>
                <span>{t(`cat.${i.category}`)} · {t('wiz.i.summary', { c: i.carat, w: f.weight(netOf(i)) })}</span>
                <span className="mono">{locationText({ vault: i.vault, shelf: i.shelf, box: i.box })}</span>
              </span>
              <span className="item-row__nums">
                <b className="num">{f.money(i.valuation ?? 0)}</b>
                <span className="muted small">{f.vori(netOf(i))}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card flat sunken className="rv">
        <CardHead title={t('wiz.step.terms')} actions={edit(2)} />
        <div className="rv__body">
          <KV
            items={[
              { label: t('wiz.t.date'), value: f.date(draft.terms.date) },
              { label: t('wiz.t.principal'), value: <b className="num">{f.money(principal)}</b> },
              { label: t('wiz.s.ltv'), value: `${f.n(Math.round(ratio * 10) / 10, 1)}%` },
              { label: t('common.rate'), value: `${f.pct(rate)} ${t('common.perMonth')}` },
              { label: t('common.term'), value: t('common.monthCount', { n: draft.terms.term ?? 0 }) },
              { label: t('wiz.t.matures'), value: f.date(maturity) },
              { label: t('common.notes'), value: draft.terms.notes.trim() || '—', hide: !draft.terms.notes.trim() },
            ]}
          />
        </div>
      </Card>

      <div className="stack" style={{ gap: 12 }}>
        <CheckBox checked={draft.confirm} onChange={(v) => onChange({ confirm: v })}>{t('wiz.r.confirm')}</CheckBox>
        {high ? <CheckBox checked={draft.confirmLtv} onChange={(v) => onChange({ confirmLtv: v })}>{t('wiz.r.confirmLtv', { m: maxLtv })}</CheckBox> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live summary
// ---------------------------------------------------------------------------
function Summary({ draft }: { draft: Draft }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const customer = db.customers.find((c) => c.id === draft.customerId);
  const tot = totals(draft.items);
  const rate = resolveRate(draft.terms, db.settings.ratePlans);
  const principal = draft.terms.principal ?? 0;
  const term = draft.terms.term;
  const ratio = tot.value > 0 ? (principal / tot.value) * 100 : 0;
  const none = <span className="wiz-sum__none">{t('wiz.s.none')}</span>;

  return (
    <aside className="wiz-sum" aria-label={t('wiz.s.title')}>
      <div className="wiz-sum__glow" aria-hidden />
      <h2 className="wiz-sum__title">{t('wiz.s.title')}</h2>
      <div className="wiz-sum__who">
        {customer ? (
          <>
            <Avatar name={customer.name} tone="ink" />
            <div className="cell-main">
              <b>{customer.name}</b>
              <span className="mono">{customer.mobile}</span>
            </div>
          </>
        ) : (
          none
        )}
      </div>
      <div className="wiz-sum__amount">
        <span>{t('wiz.s.amount')}</span>
        <b className="display"><Num value={principal} kind="money" immediate duration={0.6} /></b>
      </div>
      <dl className="wiz-sum__rows">
        <div><dt>{t('wiz.s.items')}</dt><dd>{tot.count ? t('common.itemCount', { n: tot.count }) : '—'}</dd></div>
        <div><dt>{t('wiz.s.gold')}</dt><dd>{tot.net > 0 ? f.weight(tot.net) : '—'}</dd></div>
        <div><dt>{t('wiz.s.value')}</dt><dd>{tot.value > 0 ? f.money(tot.value) : '—'}</dd></div>
        <div><dt>{t('wiz.s.ltv')}</dt><dd>{principal > 0 && tot.value > 0 ? `${f.n(Math.round(ratio * 10) / 10, 1)}%` : '—'}</dd></div>
        <div><dt>{t('wiz.s.rate')}</dt><dd>{rate ? `${f.pct(rate)} ${t('common.perMonth')}` : '—'}</dd></div>
        <div><dt>{t('wiz.s.matures')}</dt><dd>{term && term >= 1 && term <= 36 ? f.date(addMonths(draft.terms.date, term)) : '—'}</dd></div>
      </dl>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------
function Issued({ loanId, receiptId, onAnother }: { loanId: string; receiptId: string; onAnother: () => void }) {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const root = useRef<HTMLDivElement>(null);
  const loan = db.loans.find((l) => l.id === loanId);
  const receipt = db.receipts.find((r) => r.id === receiptId);
  const customer = loan ? db.customers.find((c) => c.id === loan.customerId) : undefined;
  const items = db.items.filter((i) => i.loanId === loanId);
  const canReceipt = useCan('receipts.view');

  useEffect(() => {
    if (!fullMotion() || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.done-in', { opacity: 0, y: 20, duration: 0.8, stagger: 0.09, delay: 0.55, ease: 'igh' });
    }, root);
    return () => ctx.revert();
  }, []);

  if (!loan || !receipt || !customer) return null;
  return (
    <Card className="issued">
      <div className="issued__inner" ref={root}>
        <Seal gold size={104} />
        <h2 className="display issued__title done-in">{t('wiz.done.title')}</h2>
        <p className="muted done-in issued__body">{t('wiz.done.body', { loan: loan.number, name: customer.name })}</p>
        <div className="issued__ids done-in">
          <div><span>{t('common.loan')}</span><b className="mono">{loan.number}</b></div>
          <div><span>{t('rtype.new_loan')}</span><b className="mono">{receipt.number}</b></div>
          <div><span>{t('wiz.t.principal')}</span><b className="num">{f.money(loan.principal)}</b></div>
        </div>
        <div className="issued__where done-in">
          <h3 className="h3">{t('wiz.done.stored')}</h3>
          <ul className="handback">
            {items.map((i) => (
              <li key={i.id}>
                {i.photo ? <img src={i.photo} alt="" /> : <ItemArt category={i.category} size={40} />}
                <span className="cell-main">
                  <b>{i.description}</b>
                  <span className="mono">{i.ref} · {t('loan.d.tag', { tag: i.tagNo })} · {locationText(i.location)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="row row--wrap done-in" style={{ justifyContent: 'center', gap: 12 }}>
          {canReceipt ? <ButtonLink to={`/receipts/${receipt.id}`} variant="primary">{t('wiz.done.receipt')}</ButtonLink> : null}
          <ButtonLink to={`/loans/${loan.id}`} variant="secondary">{t('wiz.done.open')}</ButtonLink>
          <Button variant="ghost" icon={<Plus size={16} />} onClick={onAnother}>{t('wiz.done.another')}</Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function NewLoan() {
  const t = useT();
  const nav = useNavigate();
  const db = useDb();
  const today = useToday();
  const addLoan = useApp((s) => s.addLoan);
  const [sp] = useSearchParams();
  const ref = usePageFX();
  const { ratePlans, interest } = db.settings;

  const pre = sp.get('customer');
  const preOk = !!pre && db.customers.some((c) => c.id === pre);
  const fresh = () => blankDraft(db, today, ratePlans, interest.defaultTermMonths);
  const [draft, setDraft] = useState<Draft>(() => {
    const d = fresh();
    if (preOk) d.customerId = pre;
    return d;
  });
  const [step, setStep] = useState(preOk ? 1 : 0);
  const [reached, setReached] = useState(preOk ? 1 : 0);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [openKey, setOpenKey] = useState<string>(draft.items[0].key);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ loanId: string; receiptId: string } | null>(null);
  const dir = useRef(1);
  const stepper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const plans = ratePlans.filter((p) => p.active);
  const tot = totals(draft.items);
  const rate = resolveRate(draft.terms, plans);
  const principal = draft.terms.principal ?? 0;
  const term = draft.terms.term;
  const ratio = tot.value > 0 ? (principal / tot.value) * 100 : 0;
  const high = ratio > interest.maxLtv + 1e-9;

  const itemsOk = draft.items.length > 0 && draft.items.every(itemValid);
  const termsOk = principal > 0 && rate != null && rate > 0 && rate <= 15 && term != null && Number.isInteger(term) && term >= 1 && term <= 36 && !!draft.terms.date && draft.terms.date <= today;
  const canIssue = draft.confirm && (!high || draft.confirmLtv);
  const dirty = !!draft.customerId || draft.items.some((i) => i.description.trim() || i.gross) || principal > 0;

  const go = (n: number) => {
    dir.current = n >= step ? 1 : -1;
    setStep(n);
    setReached((r) => Math.max(r, n));
  };

  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = content.current;
    if (stepper.current) scrollToElement(stepper.current, -88);
    if (!el || !fullMotion()) return;
    gsap.fromTo(el, { opacity: 0, x: dir.current * 34 }, { opacity: 1, x: 0, duration: 0.65, ease: 'igh', clearProps: 'opacity,transform' });
  }, [step]);

  const patchItem = (key: string, patch: Partial<DraftItem>) => setDraft((d) => ({ ...d, items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const patchTerms = (patch: Partial<DraftTerms>) => setDraft((d) => ({ ...d, terms: { ...d.terms, ...patch }, confirm: false, confirmLtv: false }));
  const addItem = () => {
    const item = blankItem(db, draft.items.length);
    setDraft((d) => ({ ...d, items: [...d.items, item] }));
    setOpenKey(item.key);
    setTried((s) => ({ ...s, 1: false }));
  };
  const removeItem = (key: string) =>
    setDraft((d) => {
      const items = d.items.filter((i) => i.key !== key);
      if (openKey === key && items[0]) setOpenKey(items[0].key);
      return { ...d, items };
    });

  const next = () => {
    setTried((s) => ({ ...s, [step]: true }));
    if (step === 0 && !draft.customerId) return;
    if (step === 1 && !itemsOk) {
      const bad = draft.items.find((i) => !itemValid(i));
      if (bad) setOpenKey(bad.key);
      toast.error(t('wiz.i.fixMany'));
      return;
    }
    if (step === 2 && !termsOk) return;
    go(step + 1);
  };

  const issue = () => {
    if (!canIssue || !draft.customerId || rate == null || term == null) return;
    setBusy(true);
    try {
      const res = addLoan({
        customerId: draft.customerId,
        date: draft.terms.date,
        principal,
        rate,
        ratePlanId: draft.terms.planId === 'custom' ? undefined : draft.terms.planId,
        customRate: draft.terms.planId === 'custom',
        termMonths: term,
        notes: draft.terms.notes,
        items: draft.items.map(toItemInput),
      });
      setDone(res);
      if (stepper.current) scrollToElement(stepper.current, -88);
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (dirty && !done) {
      const ok = await confirmDialog({ title: t('wiz.leave'), body: t('wiz.leaveBody'), confirmLabel: t('wiz.leaveGo'), cancelLabel: t('wiz.leaveStay'), tone: 'danger' });
      if (!ok) return;
    }
    nav(preOk && pre ? `/customers/${pre}` : '/loans');
  };

  const another = () => {
    setDraft(fresh());
    setDone(null);
    setStep(0);
    setReached(0);
    setTried({});
    dir.current = -1;
  };

  useEffect(() => {
    // keep the open card valid when items change
    if (!draft.items.some((i) => i.key === openKey) && draft.items[0]) setOpenKey(draft.items[0].key);
  }, [draft.items, openKey]);

  return (
    <div ref={ref} className="page wiz-page">
      <PageHeader
        title={t('wiz.title')}
        subtitle={t('wiz.subtitle')}
        crumbs={[{ label: t('nav.loans'), to: '/loans' }, { label: t('nav.newLoan') }]}
        actions={!done ? <Button variant="ghost" onClick={() => void leave()}>{t('common.cancel')}</Button> : undefined}
      />

      {done ? (
        <Issued loanId={done.loanId} receiptId={done.receiptId} onAnother={another} />
      ) : (
        <>
          <div ref={stepper}>
            <Stepper step={step} reached={reached} onGo={go} />
          </div>
          <div className="wiz">
            <div className="wiz__main">
              <Card className="wiz-card" data-fx="rise" data-fx-delay="0.1">
                <div className="wiz-card__head">
                  <span className="wiz-card__step">{t('wiz.stepOf', { a: step + 1, b: STEPS.length })}</span>
                  <h2 className="display wiz-card__title">{t(['wiz.c.title', 'wiz.i.title', 'wiz.t.title', 'wiz.r.title'][step] as 'wiz.c.title')}</h2>
                  <p className="muted">{t(['wiz.c.sub', 'wiz.i.sub', 'wiz.t.sub', 'wiz.r.sub'][step] as 'wiz.c.sub')}</p>
                </div>

                <div ref={content} className="wiz-card__body">
                  {step === 0 ? (
                    <CustomerStep customerId={draft.customerId} onPick={(id) => setDraft((d) => ({ ...d, customerId: id }))} showError={!!tried[0]} />
                  ) : step === 1 ? (
                    <div className="stack" style={{ gap: 14 }}>
                      {draft.items.map((it, idx) => (
                        <ItemEditor
                          key={it.key}
                          item={it}
                          index={idx}
                          open={openKey === it.key}
                          showErrors={!!tried[1]}
                          canRemove={draft.items.length > 1}
                          rates={db.settings.goldRates}
                          onToggle={() => setOpenKey(openKey === it.key ? '' : it.key)}
                          onChange={(p) => patchItem(it.key, p)}
                          onRemove={() => removeItem(it.key)}
                        />
                      ))}
                      <div className="wiz-items-foot">
                        <Button variant="secondary" icon={<Plus size={17} />} onClick={addItem}>{t('wiz.i.add')}</Button>
                        {tot.count > 0 ? (
                          <span className="wiz-items-foot__total">
                            {t('wiz.i.total')}: <b>{t('common.itemCount', { n: tot.count })}</b>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : step === 2 ? (
                    <TermsStep terms={draft.terms} value={tot.value} showErrors={!!tried[2]} onChange={patchTerms} />
                  ) : (
                    <ReviewStep draft={draft} high={high} maxLtv={interest.maxLtv} onEdit={go} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
                  )}
                </div>

                <div className="wiz-nav">
                  <Button variant="ghost" icon={<ChevronLeft size={17} />} onClick={() => go(step - 1)} disabled={step === 0}>{t('common.back')}</Button>
                  {step < STEPS.length - 1 ? (
                    <Button variant="primary" iconRight={<ChevronRight size={17} />} onClick={next} magnetic>{t('common.next')}</Button>
                  ) : (
                    <Button variant="primary" loading={busy} disabled={!canIssue} onClick={issue} magnetic>{t('wiz.r.cta')}</Button>
                  )}
                </div>
              </Card>
            </div>
            <div className="wiz__aside">
              <Summary draft={draft} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

void TERM_PRESETS;
