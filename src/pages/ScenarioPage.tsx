import { Link, useParams } from 'react-router-dom';
import { findScenario } from '../data/scenarios.ts';
import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { ScenarioArt } from '../components/scenarios/ScenarioArt.tsx';
import { ScenarioMeta } from '../components/scenarios/ScenarioMeta.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function ScenarioPage() {
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  if (!scenario) return <ErrorPage />;
  return (
    <div className="container page scenario-page">
      <Link to="/scenarios" className="back-link">
        <Icon name="back" size={16} />
        Все сценарии
      </Link>
      <div className="scenario-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" />
            {scenario.category}
          </p>
          <h1>{scenario.title}</h1>
          <ScenarioMeta scenario={scenario} />
        </div>
        <div className={`heading-art cover--${scenario.art}`}>
          <ScenarioArt kind={scenario.art} />
        </div>
      </div>
      <div className="preview-grid">
        <div className="preview-content">
          <section className="panel context-panel">
            <h2>Представьте ситуацию</h2>
            <p>{scenario.context}</p>
            <div className="task-box">
              <Icon name="target" size={24} />
              <div>
                <h3>Ваша задача</h3>
                <p>{scenario.goal}</p>
              </div>
            </div>
            <hr />
            <h2>Как пройдёт разговор</h2>
            <p>
              В готовом тренажёре вы сможете выбирать реплики и пробовать разные подходы, а затем
              разобрать свои решения. Сейчас можно посмотреть демонстрационный экран диалога.
            </p>
          </section>
          <section className="tip-box">
            <Icon name="bulb" size={24} />
            <div>
              <h3>Совет перед началом</h3>
              <p>{scenario.tip}</p>
            </div>
          </section>
        </div>
        <aside className="panel counterpart-card">
          <p className="eyebrow">Ваш собеседник</p>
          <div className={`counterpart-portrait cover--${scenario.art}`}>
            <span className="portrait-orbit" />
            <span className="avatar portrait-avatar">{scenario.person.initials}</span>
            <span className="portrait-bubble">
              <Icon name="message" size={30} />
            </span>
            <span className="portrait-label">ДРУГАЯ СТОРОНА ДИАЛОГА</span>
          </div>
          <h2>{scenario.person.name}</h2>
          <p className="person-role">{scenario.person.role}</p>
          <p>{scenario.person.character}</p>
          <blockquote>«{scenario.person.quote}»</blockquote>
          <div className="counterpart-bottom">
            <p className="eyebrow">Ваша роль</p>
            <strong>{scenario.role}</strong>
            <ButtonLink to={`/scenarios/${scenario.id}/play`} className="button--full">
              Открыть диалог <Icon name="arrow" size={18} />
            </ButtonLink>
            <p className="subtle-caption">Демонстрация экрана переговоров</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
