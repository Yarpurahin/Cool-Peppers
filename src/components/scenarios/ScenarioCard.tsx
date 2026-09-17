import { Link } from 'react-router-dom';
import type { Scenario } from '../../types/scenario.ts';
import { ScenarioArt } from './ScenarioArt.tsx';
import { Icon } from '../ui/Icon.tsx';

export function ScenarioCard({ scenario, index }: { scenario: Scenario; index: number }) {
  return (
    <article className="scenario-card">
      <Link to={`/scenarios/${scenario.id}`} aria-label={`${scenario.title} — открыть сценарий`}>
        <div className={`scenario-cover cover--${scenario.art}`}>
          <span className="cover-label">ПРАКТИКА / {String(index + 1).padStart(2, '0')}</span>
          <ScenarioArt kind={scenario.art} />
        </div>
        <div className="scenario-card-content">
          <div className="card-meta">
            <span className={`badge ${scenario.level === 'Начальный' ? 'badge--green' : ''}`}>
              {scenario.level}
            </span>
            <span>{scenario.skill}</span>
          </div>
          <h3>{scenario.title}</h3>
          <p>{scenario.description}</p>
          <div className="card-bottom">
            <span>
              <Icon name="clock" size={15} />
              {scenario.duration}
            </span>
            <span className="round-arrow">
              <Icon name="upRight" size={19} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
