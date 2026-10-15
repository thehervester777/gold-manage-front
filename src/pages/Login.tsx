import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, LogIn, User as UserIcon } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { Button, Field } from '../components/controls';
import { Avatar } from '../components/blocks';
import { LanguageToggle, ThemeToggle } from '../shell/Topbar';
import { gsap, useGSAP } from '../motion/gsap';
import { fullMotion, usePageFX } from '../motion/fx';
import { useApp } from '../lib/store';
import { useBi, useFmt, useT } from '../lib/hooks';
import { DEMO_ACCOUNTS } from '../lib/seed';
import { defaultRoles } from '../lib/permissions';
import { cx } from '../lib/cx';

/** The 30-day rule, drawn from the two examples in the written requirements. */
function RuleBoard() {
  const t = useT();
  const f = useFmt();
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!fullMotion()) return;
      const q = gsap.utils.selector(ref);
      gsap.set(q('.rb-fill'), { scaleX: 0, transformOrigin: '0% 50%' });
      gsap.set(q('.rb-month span'), { opacity: 0, x: -8 });
      gsap.set(q('.rb-day'), { opacity: 0, y: 10, scale: 0.8 });
      gsap.set(q('.rb-tag'), { opacity: 0, y: 8 });
      const tl = gsap.timeline({ delay: 1.15 });
      tl.from(q('.rb-head, .rb-lane-label'), { opacity: 0, y: 12, stagger: 0.08, duration: 0.7 })
        .to(q('.rb-fill'), { scaleX: 1, duration: 1.1, stagger: 0.12, ease: 'power3.inOut' }, '-=0.3')
        .to(q('.rb-month span'), { opacity: 1, x: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out' }, '<0.45')
        .to(q('[data-lane="b"] .rb-day'), { opacity: 1, y: 0, scale: 1, stagger: 0.12, duration: 0.5, ease: 'back.out(2)' }, '-=0.15')
        .to(q('[data-lane="b"] .rb-tag'), { opacity: 1, y: 0, duration: 0.6 }, '-=0.1')
        .to(q('[data-lane="c"] .rb-day'), { opacity: 1, y: 0, scale: 1, stagger: 0.12, duration: 0.5, ease: 'back.out(2)' }, '-=0.1')
        .fromTo(q('.rb-day--add'), { boxShadow: '0 0 0 0 rgba(226,185,92,0.7)' }, { boxShadow: '0 0 0 14px rgba(226,185,92,0)', duration: 1.1, ease: 'power2.out', repeat: 1 }, '-=0.1')
        .to(q('[data-lane="c"] .rb-tag'), { opacity: 1, y: 0, duration: 0.6 }, '-=1.2');
    },
    { scope: ref },
  );

  const lane = (key: 'b' | 'c', extra: number, add: boolean) => (
    <div className="rb-lane" data-lane={key}>
      <div className="rb-lane-label">{t(`login.rule.${key}`)}</div>
      <div className="rb-bar">
        <div className="rb-month"><i className="rb-fill" /><span>{t('login.rule.oneMonth')}</span></div>
        <div className="rb-days">
          {Array.from({ length: extra }, (_, i) => (
            <span key={i} className={cx('rb-day', add && i === extra - 1 && 'rb-day--add')}>{f.n(i + 1)}</span>
          ))}
        </div>
      </div>
      <div className="rb-tag">
        <b className={add ? 'is-add' : undefined}>{add ? t('login.rule.twoMonths') : t('login.rule.oneMonth')}</b>
        <span>{t('login.rule.extra', { n: extra })} · {add ? t('login.rule.added') : t('login.rule.free')}</span>
      </div>
    </div>
  );

  return (
    <div className="rule-board" ref={ref}>
      <div className="rb-head">
        <b>{t('login.rule.title')}</b>
        <span>{t('login.rule.a')}</span>
      </div>
      {lane('b', 3, false)}
      {lane('c', 4, true)}
    </div>
  );
}

export function Login() {
  const t = useT();
  const bi = useBi();
  const login = useApp((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<null | 'invalid' | 'disabled'>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<HTMLFormElement>(null);
  const root = usePageFX<HTMLDivElement>();
  const roles = defaultRoles();

  const submit = async (u: string, p: string) => {
    setBusy(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 380)); // a beat, so the state change reads as deliberate
    const res = await login(u, p);
    setBusy(false);
    if (res !== 'ok') {
      setError(res);
      if (card.current && fullMotion()) gsap.fromTo(card.current, { x: -12 }, { x: 0, duration: 0.7, ease: 'elastic.out(1.2, 0.35)', clearProps: 'transform' });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('invalid');
      return;
    }
    void submit(username, password);
  };

  useEffect(() => {
    document.title = 'Ithika Gold House';
  }, []);

  return (
    <div className="login" ref={root}>
      <section className="login__hero" aria-hidden={false}>
        <div className="login__grain" aria-hidden="true" />
        <div className="login__glow" aria-hidden="true" data-parallax="0.4" />
        <div className="login__brand" data-fx="fade">
          <LogoMark size={44} />
          <div>
            <b>Ithika Gold House</b>
            <span>{t('login.brandSub')}</span>
          </div>
        </div>
        <div className="login__pitch">
          <h1 className="display login__headline" data-fx="split" key={t('login.headline')}>{t('login.headline')}</h1>
          <p className="login__lead" data-fx="rise" data-fx-delay="0.5">{t('login.lead')}</p>
        </div>
        <RuleBoard />
        <p className="login__foot" data-fx="fade" data-fx-delay="1.6">{t('login.rule.body')}</p>
      </section>

      <section className="login__panel">
        <div className="login__mbrand" aria-hidden="true">
          <LogoMark size={34} />
          <b>Ithika Gold House</b>
        </div>
        <div className="login__tools">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <form ref={card} className="login__card" onSubmit={onSubmit} noValidate>
          <div data-fx="rise" data-fx-delay="0.3">
            <h2 className="h2">{t('login.title')}</h2>
            <p className="muted" style={{ marginTop: 6 }}>{t('login.subtitle')}</p>
          </div>

          <div className="stack" style={{ '--gap': '16px' } as React.CSSProperties} data-fx="rise" data-fx-delay="0.4">
            <Field label={t('login.username')}>
              <span className="input-group">
                <span className="input-group__pre"><UserIcon size={17} /></span>
                <input className="input input--lg" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="owner" />
              </span>
            </Field>
            <Field label={t('login.password')}>
              <span className="input-group input-group--post">
                <span className="input-group__pre"><Lock size={17} /></span>
                <input className="input input--lg" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
                <button type="button" className="input-group__post login__eye" onClick={() => setShow((s) => !s)} aria-label={show ? t('login.hidePassword') : t('login.showPassword')}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </Field>
            {error ? (
              <div className="callout callout--danger" role="alert">
                <span>{error === 'disabled' ? t('login.disabled') : t('login.invalid')}</span>
              </div>
            ) : null}
            <Button type="submit" variant="primary" size="lg" block loading={busy} icon={busy ? undefined : <LogIn size={18} />} magnetic>
              {busy ? t('login.checking') : t('login.submit')}
            </Button>
          </div>

          <div className="login__demo" data-fx="rise" data-fx-delay="0.5">
            <div className="login__demo-head">
              <b>{t('login.demoTitle')}</b>
              <span>{t('login.demoHint')}</span>
            </div>
            <div className="login__accounts" data-fx-group data-stagger="0.06">
              {DEMO_ACCOUNTS.map((a) => {
                const role = roles.find((r) => r.id === a.roleId)!;
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="login__account"
                    disabled={busy}
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(a.password);
                      void submit(a.username, a.password);
                    }}
                  >
                    <Avatar name={a.name} size="sm" />
                    <span className="login__account-text">
                      <b>{bi(role.name)}</b>
                      <small className="mono">{a.username} / {a.password}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="micro muted" style={{ marginTop: 12 }}>{t('login.demoNote')}</p>
          </div>
        </form>
      </section>
    </div>
  );
}
