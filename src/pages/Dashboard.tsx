import { usePageFX } from '../motion/fx';
import { usePortfolio, useT } from '../lib/hooks';
import { Hero } from './dashboard/Hero';
import { Metrics } from './dashboard/Metrics';
import { MaturingCard, OverdueCard } from './dashboard/Lists';
import { FlowCard } from './dashboard/Flow';
import { PortfolioStory } from './dashboard/Story';
import { ActivityCard, RatesCard } from './dashboard/Activity';

export function Dashboard() {
  const t = useT();
  const pf = usePortfolio();
  const ref = usePageFX();
  return (
    <div className="dash" ref={ref}>
      <Hero overdueCount={pf.overdueCount} />
      <Metrics />
      <div className="dash__row dash__row--attention">
        <OverdueCard />
        <MaturingCard />
      </div>
      <FlowCard />
      <PortfolioStory />
      <div className="dash__row dash__row--bottom">
        <ActivityCard />
        <RatesCard />
      </div>
      <p className="dash__foot muted small" data-fx="fade">{t('dash.footnote')}</p>
    </div>
  );
}
