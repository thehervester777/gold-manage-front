import { useMemo } from 'react';
import { Card, CardHead, EmptyState } from '../../components/blocks';
import { useCan, useDb, useFmt, useLang, useSettings, useT } from '../../lib/hooks';
import { auditLine, auditTone } from '../../lib/auditText';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp } from 'lucide-react';

export function ActivityCard() {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const db = useDb();
  const canAudit = useCan('audit.view');
  const items = useMemo(
    () =>
      db.audit
        .filter((e) => e.action !== 'login' && e.action !== 'logout' && !(e.action === 'create' && e.entity === 'receipt') && e.action !== 'backup')
        .slice(-9)
        .reverse(),
    [db.audit],
  );
  return (
    <Card className="d-activity" data-fx="rise">
      <CardHead title={t('dash.activity.title')} actions={canAudit ? <Link className="link" to="/audit">{t('common.viewAll')}</Link> : null} />
      {items.length === 0 ? (
        <EmptyState compact title={t('dash.activity.title')} body={t('dash.activity.empty')} />
      ) : (
        <ol className="timeline" data-fx-group data-stagger="0.05">
          {items.map((e) => (
            <li key={e.id} className={`timeline__item timeline__item--${auditTone(e)}`}>
              <span className="timeline__dot" />
              <div>
                <div className="timeline__text">{auditLine(e, lang)}</div>
                <div className="timeline__meta">{e.userName} · {f.dateTime(e.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function RatesCard() {
  const t = useT();
  const f = useFmt();
  const settings = useSettings();
  const rates = settings.goldRates;
  const cur = rates.at(-1);
  const wk = rates.at(-8) ?? rates[0];
  if (!cur) return null;
  const rows = [
    { n: 24, v: cur.k24, p: wk.k24 },
    { n: 22, v: cur.k22, p: wk.k22 },
    { n: 21, v: cur.k21, p: wk.k21 },
    { n: 18, v: cur.k18, p: wk.k18 },
  ];
  return (
    <Card className="d-rates" data-fx="rise" data-fx-delay="0.1">
      <CardHead title={t('dash.rates.title')} sub={t('dash.rate.updated', { date: f.date(cur.date) })} />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('common.carat')}</th>
              <th className="r">{t('common.perVori')}</th>
              <th className="r hide-sm">{t('dash.rates.perGram')}</th>
              <th className="r">{t('dash.rate.week')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = ((r.v - r.p) / r.p) * 100;
              return (
                <tr key={r.n}>
                  <td><b>{f.digits(r.n)}K</b></td>
                  <td className="r num">{f.money(r.v)}</td>
                  <td className="r num hide-sm">{f.money(r.v / 11.664)}</td>
                  <td className="r">
                    <span className={d >= 0 ? 'delta delta--up' : 'delta delta--down'}>
                      {d >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {f.n(Math.abs(d), 2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
