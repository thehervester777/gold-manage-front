import { useRef } from 'react';
import { Monitor, Moon, Play, Sun } from 'lucide-react';
import { Card, CardHead } from '../../components/blocks';
import { Button, Chip, Segmented, Switch } from '../../components/controls';
import { gsap, osReducedMotion, useGSAP } from '../../motion/gsap';
import { useApp, type Prefs } from '../../lib/store';
import { useT } from '../../lib/hooks';

/** How the system looks and moves. These live on the device, not in the shared records. */
export function AppearanceSection() {
  const t = useT();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const stage = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP({ scope: stage });

  /** A small replay of the same moves the screens use, so a choice can be felt before it is kept. */
  const play = contextSafe((next?: Partial<Prefs>) => {
    const root = stage.current;
    if (!root) return;
    const now = { ...useApp.getState().prefs, ...next };
    const rows = root.querySelectorAll('.set-stage__row');
    const streak = root.querySelector('.set-stage__streak');
    const curtain = root.querySelector('.set-stage__curtain');
    // Start from a clean slate: the stylesheet holds no transforms, so GSAP's own values are the only ones in play.
    gsap.killTweensOf([rows, streak, curtain]);
    gsap.set([rows, streak, curtain], { clearProps: 'all' });
    if (now.motion !== 'full') {
      gsap.fromTo(rows, { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power1.out' });
      return;
    }
    const tl = gsap.timeline();
    if (now.transitions && curtain) {
      tl.set(rows, { opacity: 0 })
        .set(curtain, { autoAlpha: 1, xPercent: -101 })
        .to(curtain, { xPercent: 0, duration: 0.45, ease: 'igh' })
        .to(curtain, { xPercent: 101, duration: 0.55, ease: 'igh' }, '+=0.05')
        .set(curtain, { autoAlpha: 0 })
        .fromTo(rows, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: 'igh' }, '-=0.45');
    } else {
      tl.fromTo(rows, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09, ease: 'igh' });
    }
    if (streak) tl.fromTo(streak, { xPercent: -120, autoAlpha: 1 }, { xPercent: 260, duration: 1.1, ease: 'power2.inOut' }, 0.1).set(streak, { autoAlpha: 0 });
  });

  const change = (patch: Partial<Prefs>) => {
    setPrefs(patch);
    if ('motion' in patch || 'transitions' in patch) play(patch);
  };

  return (
    <Card id="set-appearance" className="set-card" data-fx="rise" aria-labelledby="set-appearance-h">
      <CardHead id="set-appearance-h" title={t('set.look.title')} sub={t('set.look.sub')} />
      <div className="card__body set-look">
        <div className="set-look__controls">
          <div className="set-line">
            <div className="set-line__text">
              <b>{t('set.look.theme')}</b>
              <p>{t('set.look.themeHint')}</p>
            </div>
            <Segmented<Prefs['theme']>
              label={t('set.look.theme')}
              value={prefs.theme}
              onChange={(theme) => change({ theme })}
              items={[
                { id: 'system', label: t('set.look.theme.system'), icon: <Monitor size={15} /> },
                { id: 'light', label: t('set.look.theme.light'), icon: <Sun size={15} /> },
                { id: 'dark', label: t('set.look.theme.dark'), icon: <Moon size={15} /> },
              ]}
            />
          </div>

          <div className="set-line">
            <div className="set-line__text">
              <b>{t('set.look.motion')}</b>
              <p>{t('set.look.motionHint')}</p>
              {osReducedMotion() ? <Chip tone="info" plain>{t('set.look.reduced')}</Chip> : null}
            </div>
            <Segmented<Prefs['motion']>
              label={t('set.look.motion')}
              value={prefs.motion}
              onChange={(motion) => change({ motion })}
              items={[
                { id: 'full', label: t('set.look.motion.full') },
                { id: 'calm', label: t('set.look.motion.calm') },
              ]}
            />
          </div>

          <label className="set-line set-line--switch">
            <span className="set-line__text">
              <b>{t('set.look.smooth')}</b>
              <p>{t('set.look.smoothHint')}</p>
            </span>
            <Switch checked={prefs.smooth} onChange={(smooth) => change({ smooth })} label={t('set.look.smooth')} />
          </label>

          <label className="set-line set-line--switch">
            <span className="set-line__text">
              <b>{t('set.look.transitions')}</b>
              <p>{t('set.look.transitionsHint')}</p>
            </span>
            <Switch checked={prefs.transitions} onChange={(transitions) => change({ transitions })} label={t('set.look.transitions')} />
          </label>
        </div>

        <div className="set-stage" ref={stage}>
          <div className="set-stage__head">
            <b>{t('set.look.preview')}</b>
            <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => play()}>
              {t('set.look.play')}
            </Button>
          </div>
          <div className="set-stage__screen" aria-hidden="true">
            <span className="set-stage__streak" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="set-stage__row">
                <i className="set-stage__dot" />
                <span className="set-stage__lines">
                  <i />
                  <i />
                </span>
                <em />
              </div>
            ))}
            <span className="set-stage__curtain" />
          </div>
          <p className="set-stage__note">{t('set.look.previewNote')}</p>
        </div>
      </div>
    </Card>
  );
}
