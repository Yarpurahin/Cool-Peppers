import { Link } from 'react-router-dom';
import type { ScenarioPreview } from '../../types/scenario.ts';
import { ScenarioArt } from './ScenarioArt.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { ScenarioMastery } from '../../types/api.ts';
import { MasteryStars } from '../../features/gamification/MasteryStars.tsx';

export function ScenarioCard({
  scenario,
  index,
  mastery,
}: {
  scenario: ScenarioPreview;
  index: number;
  mastery?: ScenarioMastery;
}) {
  return (
    <article className="scenario-card">
      <Link to={`/scenarios/${scenario.id}`} aria-label={`${scenario.title} — открыть сценарий`}>
        <div className={`scenario-cover cover--${scenario.art}`}>
          <span className="cover-label">ПРАКТИКА / {String(index + 1).padStart(2, '0')}</span>
          <ScenarioArt kind={scenario.art} image={scenario.coverImage} />
        </div>
        <div className="scenario-card-content">
          <div className="card-meta">
            <span className={`badge ${scenario.level === 'Начальный' ? 'badge--green' : ''}`}>
              {scenario.level}
            </span>
            <span>{scenario.skill}</span>
          </div>
          <h3>{scenario.title}</h3>
          {mastery && (
            <div className="scenario-mastery">
              <MasteryStars value={mastery.bestStars} compact />
              <span>{mastery.completedAttempts} прохожд.</span>
            </div>
          )}
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
