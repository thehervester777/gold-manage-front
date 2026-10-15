import { useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Card, CardHead, rowDelay } from '../../components/blocks';
import { Button, Chip } from '../../components/controls';
import { useFmt, useT } from '../../lib/hooks';
import { runTestCases, type InterestPolicy } from '../../lib/interest';
import type { TKey } from '../../lib/i18n';
import { cx } from '../../lib/cx';

/** The worked examples from the quotation plus month-end edge cases, run against the rules being edited. */
export function AgreedExamples({ policy, previewing }: { policy: InterestPolicy; previewing: boolean }) {
  const t = useT();
  const f = useFmt();
  const results = useMemo(() => runTestCases(policy), [policy]);
  const [round, setRound] = useState(0);
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const all = passed === total;

  return (
    <Card className="ilab" data-fx="rise" aria-labelledby="ilab-title">
      <CardHead
        id="ilab-title"
        title={t('int.lab.title')}
        sub={t('int.lab.sub')}
        actions={
          <>
            {previewing ? <Chip tone="gold">{t('int.preview')}</Chip> : null}
            <Button size="sm" icon={<RefreshCw size={15} />} onClick={() => setRound((r) => r + 1)}>{t('int.lab.run')}</Button>
          </>
        }
      />
      <div className="ilab__sum">
        <div className={cx('ilab__badge', all ? 'is-ok' : 'is-warn')} aria-hidden="true">{all ? <CheckCircle2 size={20} /> : <TriangleAlert size={20} />}</div>
        <div className="ilab__sumtext">
          <b>{all ? t('int.lab.allPass', { n: total }) : t('int.lab.somePass', { p: passed, n: total })}</b>
          <div className="ilab__meter" aria-hidden="true">
            <i key={round} className={cx(!all && 'is-warn')} style={{ width: `${(passed / total) * 100}%` }} />
          </div>
        </div>
      </div>
      {!all ? <p className="ilab__note">{t('int.lab.differ')}</p> : null}

      <div className="tbl-wrap">
        <table className="tbl tbl--dense">
          <thead>
            <tr>
              <th>{t('int.lab.col.case')}</th>
              <th>{t('int.lab.col.dates')}</th>
              <th>{t('int.lab.col.agreed')}</th>
              <th>{t('int.lab.col.counted')}</th>
              <th>{t('int.lab.col.result')}</th>
            </tr>
          </thead>
          <tbody key={round}>
            {results.map((r, i) => {
              const c = r.case;
              return (
                <tr key={c.id} className="row-in" style={rowDelay(i)}>
                  <td>
                    <div className="ilab__case">
                      <Chip plain tone={c.note === 'doc' ? 'gold' : 'neutral'}>{c.note === 'doc' ? t('int.lab.doc') : t('int.lab.edge')}</Chip>
                      <b>{t(`int.case.${c.id}` as TKey)}</b>
                    </div>
                  </td>
                  <td className="ilab__dates">{f.date(c.start)} – {f.date(c.end)}</td>
                  <td>
                    <div className="ilab__val">
                      <b>{t('common.monthCount', { n: c.expectedMonths })}</b>
                      {c.expectedInterest != null ? <span>{t('int.lab.interest', { amount: f.money(c.expectedInterest) })}</span> : null}
                    </div>
                  </td>
                  <td>
                    <div className="ilab__val">
                      <b>{t('common.monthCount', { n: r.months.chargeable })}</b>
                      <span>{r.interest != null ? t('int.lab.interest', { amount: f.money(r.interest) }) : t(`int.ruleName.${r.months.rule}` as TKey)}</span>
                    </div>
                  </td>
                  <td>
                    <Chip tone={r.pass ? 'ok' : 'warn'}>{r.pass ? t('int.lab.agrees') : t('int.lab.differs')}</Chip>
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
