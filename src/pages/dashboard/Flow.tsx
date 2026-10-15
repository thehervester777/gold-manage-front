import { useMemo } from 'react';
import { Card, CardHead } from '../../components/blocks';
import { FlowChart } from '../../components/charts';
import { useDb, useFmt, useT, useToday } from '../../lib/hooks';
import { monthlySeries } from '../../lib/selectors';

export function FlowCard() {
  const t = useT();
  const f = useFmt();
  const db = useDb();
  const today = useToday();
  const data = useMemo(() => monthlySeries(db, today, 12), [db, today]);
  const totals = data.reduce((a, d) => ({ out: a.out + d.disbursed, interest: a.interest + d.interest, principal: a.principal + d.principalIn }), { out: 0, interest: 0, principal: 0 });

  return (
    <Card className="d-flow" data-fx="rise">
      <CardHead title={t('dash.flow.title')} sub={t('dash.flow.sub')} />
      <div className="flow-totals">
        <div><span className="swatch" style={{ background: 'var(--c2)' }} /><span>{t('dash.flow.disbursed')}</span><b className="serif-num">{f.money(totals.out)}</b></div>
        <div><span className="swatch" style={{ background: 'var(--c1)' }} /><span>{t('dash.flow.collected')}</span><b className="serif-num">{f.money(totals.interest)}</b></div>
        <div><span className="swatch" style={{ background: 'var(--c3)' }} /><span>{t('dash.flow.principalIn')}</span><b className="serif-num">{f.money(totals.principal)}</b></div>
      </div>
      <div className="card__body" style={{ paddingTop: 6 }}>
        <FlowChart data={data} />
      </div>
    </Card>
  );
}
