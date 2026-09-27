import type { AttemptReward } from '../../types/api.ts';
import { MasteryStars } from './MasteryStars.tsx';
import { Icon } from '../../components/ui/Icon.tsx';

const reasonText = {
  first_completion: 'Первое прохождение этого сценария',
  new_ending: 'Открыта новая концовка сценария',
  repeat_ending: 'Повтор уже открытой концовки',
} as const;

export function RewardPanel({ reward }: { reward: AttemptReward }) {
  const outcomeFactor = reward.breakdown.endingPercent / 100;
  const repeatFactor = reward.breakdown.repeatPercent / 100;
  return (
    <section className="panel reward-panel" aria-label="Награда за тренировку">
      <div className="reward-panel-heading">
        <div>
          <p className="eyebrow">
            <Icon name="award" size={17} /> Прогресс
          </p>
          <h2>Тренировка засчитана</h2>
          <p>{reasonText[reward.rewardReason]}</p>
        </div>
        <strong className="reward-xp">+{reward.xpEarned} XP</strong>
      </div>

      <div className="reward-breakdown" aria-label="Расчёт награды">
        <div>
          <span>Базовая награда</span>
          <strong>+{reward.breakdown.baseXp} XP</strong>
        </div>
        <div>
          <span>Итог переговоров</span>
          <strong>× {outcomeFactor.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</strong>
        </div>
        <div>
          <span>Штрафные баллы</span>
          <strong>{reward.breakdown.penaltyXp ? `−${reward.breakdown.penaltyXp} XP` : '0 XP'}</strong>
        </div>
        {reward.breakdown.repeatPercent < 100 && (
          <div>
            <span>Повтор уже открытой концовки</span>
            <strong>× {repeatFactor.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</strong>
          </div>
        )}
      </div>

      <div className="reward-metrics">
        <div className="reward-metric">
          <span>Мастерство сценария</span>
          <MasteryStars value={reward.masteryStars} />
        </div>
        <div className="reward-metric">
          <span>Навык</span>
          <strong>{reward.skill}</strong>
          <small>+{reward.skillXpEarned} XP навыка</small>
        </div>
      </div>

      {reward.achievementsUnlocked.length > 0 && (
        <div className="reward-achievements">
          <span>
            {reward.achievementsUnlocked.length === 1
              ? 'Получено достижение'
              : 'Получены достижения'}
          </span>
          {reward.achievementsUnlocked.map((item) => (
            <div className="reward-achievement" key={item.id}>
              <Icon name={item.icon} size={18} />
              <div>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
