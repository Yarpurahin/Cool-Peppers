import type { GamificationSummary } from '../../types/api.ts';
import { Icon } from '../../components/ui/Icon.tsx';
import { MasteryStars } from './MasteryStars.tsx';

export function GamificationProfile({
  summary,
  loading,
  error,
}: {
  summary: GamificationSummary | null;
  loading: boolean;
  error: string;
}) {
  if (loading && !summary)
    return (
      <section className="panel gamification-loading" role="status">
        Загружаем прогресс…
      </section>
    );
  if (error && !summary)
    return (
      <section className="panel gamification-loading" role="status">
        Прогресс временно недоступен.
      </section>
    );
  if (!summary) return null;

  const weekly = Math.min(summary.weeklyGoal.completed, summary.weeklyGoal.target);
  const weeklyPercent = Math.round((weekly / summary.weeklyGoal.target) * 100);
  const activeAchievements = summary.achievements.filter((item) => item.active || item.unlocked);

  return (
    <section className="gamification-section" aria-labelledby="gamification-title">
      <div className="gamification-hero">
        <div className="gamification-level-mark" aria-hidden="true">
          <Icon name="award" size={28} />
        </div>
        <div className="gamification-level-copy">
          <p className="eyebrow">Прогресс переговорщика</p>
          <div className="gamification-level-line">
            <h2 id="gamification-title">Уровень {summary.level}</h2>
            <span>{summary.levelTitle}</span>
          </div>
          <div className="gamification-progress-copy">
            <span>
              {summary.earnedInLevel} / {summary.neededInLevel} XP до следующего уровня
            </span>
            <strong>{summary.totalXp} XP всего</strong>
          </div>
          <div
            className="gamification-progress"
            aria-label={`Прогресс уровня ${summary.progressPercent}%`}
          >
            <span style={{ width: `${summary.progressPercent}%` }} />
          </div>
        </div>
        <div className="weekly-goal-card">
          <span>Цель недели</span>
          <strong>
            {weekly}/{summary.weeklyGoal.target}
          </strong>
          <small>завершённых тренировок</small>
          <div className="weekly-goal-track" aria-hidden="true">
            <span style={{ width: `${weeklyPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="gamification-columns">
        <section className="panel gamification-card skills-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Развитие</p>
              <h2>Навыки</h2>
            </div>
            <Icon name="chart" />
          </div>
          {summary.skills.length ? (
            <div className="skill-list">
              {summary.skills.map((skill) => (
                <article className="skill-row" key={skill.key}>
                  <div className="skill-row-heading">
                    <div>
                      <strong>{skill.name}</strong>
                      <span>
                        Ур. {skill.level} · {skill.levelTitle}
                      </span>
                    </div>
                    <small>{skill.xp} XP</small>
                  </div>
                  <div
                    className="skill-progress"
                    aria-label={`Прогресс навыка ${skill.progressPercent}%`}
                  >
                    <span style={{ width: `${skill.progressPercent}%` }} />
                  </div>
                  <p>
                    {skill.earnedInLevel}/{skill.neededInLevel} XP уровня · тренировок:{' '}
                    {skill.attempts}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="gamification-empty">
              Завершите сценарий — здесь появится прогресс навыков.
            </p>
          )}
        </section>

        <section className="panel gamification-card achievements-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Коллекция</p>
              <h2>Достижения</h2>
            </div>
            <span className="achievement-count">
              {activeAchievements.filter((item) => item.unlocked).length}/{activeAchievements.length}
            </span>
          </div>
          <div className="achievement-grid">
            {activeAchievements.map((item) => (
              <article
                className={`achievement-item ${item.unlocked ? 'is-unlocked' : 'is-locked'}`}
                key={item.id}
              >
                <span className="achievement-icon">
                  <Icon name={item.unlocked ? item.icon : 'lock'} size={18} />
                </span>
                <div className="achievement-copy">
                  <div className="achievement-title-row">
                    <strong>{item.title}</strong>
                    {!item.active && item.unlocked && <small>Архив</small>}
                  </div>
                  <p>{item.description}</p>
                  {item.unlocked ? (
                    item.unlockedAt && (
                      <small>Получено {new Date(item.unlockedAt).toLocaleDateString('ru-RU')}</small>
                    )
                  ) : (
                    <div className="achievement-progress-wrap">
                      <div className="achievement-progress-copy">
                        <span>Прогресс</span>
                        <strong>
                          {item.progress}/{item.target}
                        </strong>
                      </div>
                      <div
                        className="achievement-progress-track"
                        aria-label={`Прогресс достижения ${item.progressPercent}%`}
                      >
                        <span style={{ width: `${item.progressPercent}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel gamification-card mastery-card">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Повторная практика</p>
            <h2>Мастерство сценариев</h2>
          </div>
          <Icon name="star" />
        </div>
        {summary.mastery.length ? (
          <div className="mastery-list">
            {summary.mastery.map((item) => (
              <article className="mastery-row" key={item.scenarioId}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.completedAttempts} прохожд.</span>
                </div>
                <MasteryStars value={item.bestStars} />
                <small>лучший результат: +{item.bestXp} XP</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="gamification-empty">
            После первого завершённого сценария здесь появится мастерство.
          </p>
        )}
      </section>
    </section>
  );
}
