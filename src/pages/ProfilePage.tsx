import { Link } from 'react-router-dom';
import { demoProfile, practiceHistory } from '../data/profile.ts';
import { findScenario } from '../data/scenarios.ts';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';
import { useDemoMessage } from '../app/DemoProvider.tsx';

export function ProfilePage() {
  const show = useDemoMessage();
  const average = Math.round(
    practiceHistory.reduce((sum, row) => sum + row.score, 0) / practiceHistory.length,
  );
  const minutes = practiceHistory.reduce((sum, row) => sum + row.duration, 0);
  return (
    <div className="container page profile-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" />
            Личное пространство
          </p>
          <h1>Моя практика</h1>
        </div>
        <span className="badge badge--outline">Демонстрационный профиль</span>
      </div>
      <div className="profile-overview">
        <div className="profile-person">
          <span className="avatar avatar--large">{demoProfile.initials}</span>
          <div>
            <h2>{demoProfile.name}</h2>
            <p>Участник Арены</p>
          </div>
        </div>
        <div className="stat stat--dark">
          <span>Средний балл</span>
          <strong>
            {average}
            <small> / 100</small>
          </strong>
          <p>По {practiceHistory.length} примерам тренировок</p>
          <Icon name="chart" size={22} />
        </div>
        <div className="stat">
          <span>Тренировок</span>
          <strong>{String(practiceHistory.length).padStart(2, '0')}</strong>
          <p>Каждая — новый опыт</p>
        </div>
        <div className="stat">
          <span>Время практики</span>
          <strong>
            {minutes}
            <small> мин</small>
          </strong>
          <p>Вклад в уверенность</p>
        </div>
      </div>
      <section className="panel personal-panel">
        <div className="panel-heading">
          <h2>Личные данные</h2>
          <Icon name="user" />
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            show(
              'Сохранение пока недоступно',
              'Вы редактируете пример профиля. Изменения не сохранены и исчезнут после ухода со страницы.',
            );
          }}
        >
          <div className="two-fields">
            <label className="field">
              Имя
              <input
                name="name"
                defaultValue={demoProfile.name}
                required
                maxLength={100}
                autoComplete="off"
              />
            </label>
            <label className="field">
              Электронная почта
              <input
                name="email"
                type="email"
                defaultValue={demoProfile.email}
                required
                autoComplete="off"
              />
            </label>
          </div>
          <div className="form-bottom">
            <Button type="submit" variant="secondary">
              <Icon name="check" size={18} />
              Сохранить изменения
            </Button>
            <p>Данные приведены для примера</p>
          </div>
        </form>
      </section>
      <section className="panel history-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Каждый разговор имеет значение</p>
            <h2>История практики</h2>
          </div>
          <span className="badge">Пример данных</span>
        </div>
        <div className="history-list">
          {practiceHistory.map((row, index) => {
            const scenario = findScenario(row.scenarioId)!;
            return (
              <article className="history-row" key={row.scenarioId}>
                <span className={`history-icon cover--${scenario.art}`}>
                  <Icon
                    name={index === 0 ? 'clock' : index === 1 ? 'message' : 'check'}
                    size={23}
                  />
                </span>
                <div className="history-title">
                  <h3>{scenario.title}</h3>
                  <p>
                    {row.date} <span>·</span> {row.duration} мин
                  </p>
                </div>
                <div className="history-score">
                  <strong>{row.score}</strong>
                  <span> / 100</span>
                  <div className="score-track">
                    <span style={{ width: `${row.score}%` }} />
                  </div>
                </div>
                <Link
                  className="review-link"
                  to={`/scenarios/${row.scenarioId}/result`}
                  aria-label={`Разбор: ${scenario.title}`}
                >
                  <Icon name="chart" size={17} />
                  <span>Разбор</span>
                  <Icon name="upRight" size={18} />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
      <DemoNotice>
        История и баллы — готовые примеры. Пройденные тренировки появятся здесь после подключения
        сценариев.
      </DemoNotice>
    </div>
  );
}
