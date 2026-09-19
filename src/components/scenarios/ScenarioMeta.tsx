import type { ScenarioPreview } from '../../types/scenario.ts';
import { Icon } from '../ui/Icon.tsx';

export function ScenarioMeta({ scenario }: { scenario: ScenarioPreview }) {
  return (
    <div className="scenario-meta">
      <span className="badge badge--green">{scenario.level}</span>
      <span>
        <Icon name="clock" size={16} />
        {scenario.duration}
      </span>
      <span>{scenario.skill}</span>
    </div>
  );
}
