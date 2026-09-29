export type EndingType = 'success' | 'neutral' | 'failure';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type RewardReason = 'first_completion' | 'new_ending' | 'repeat_ending';

export type AchievementConditionType =
  | 'completed_attempts'
  | 'successful_attempts'
  | 'perfect_attempts'
  | 'difficulty_successes'
  | 'three_star_attempts'
  | 'distinct_endings'
  | 'skill_attempts'
  | 'distinct_scenarios'
  | 'global_level';

export const ACHIEVEMENT_CONDITIONS: readonly {
  value: AchievementConditionType;
  label: string;
  description: string;
  unit: string;
  needsDifficulty?: boolean;
}[] = [
  {
    value: 'completed_attempts',
    label: 'Завершённые тренировки',
    description: 'Сколько тренировок пользователь завершил.',
    unit: 'тренировок',
  },
  {
    value: 'successful_attempts',
    label: 'Успешные исходы',
    description: 'Количество завершений с типом success.',
    unit: 'успешных исходов',
  },
  {
    value: 'perfect_attempts',
    label: 'Прохождения без штрафов',
    description: 'Количество тренировок с нулём штрафных баллов.',
    unit: 'чистых прохождений',
  },
  {
    value: 'difficulty_successes',
    label: 'Успех на выбранной сложности',
    description: 'Успешные завершения сценариев выбранной сложности.',
    unit: 'успешных прохождений',
    needsDifficulty: true,
  },
  {
    value: 'three_star_attempts',
    label: 'Три звезды мастерства',
    description: 'Количество прохождений с максимальным мастерством.',
    unit: 'трёхзвёздочных прохождений',
  },
  {
    value: 'distinct_endings',
    label: 'Разные концовки одного сценария',
    description: 'Максимальное число разных концовок, открытых в одном сценарии.',
    unit: 'концовок',
  },
  {
    value: 'skill_attempts',
    label: 'Практика одного навыка',
    description: 'Максимальное число тренировок, относящихся к одному навыку.',
    unit: 'тренировок навыка',
  },
  {
    value: 'distinct_scenarios',
    label: 'Разные сценарии',
    description: 'Количество различных сценариев, которые пользователь завершил.',
    unit: 'сценариев',
  },
  {
    value: 'global_level',
    label: 'Уровень переговорщика',
    description: 'Достижение выдаётся при достижении указанного уровня.',
    unit: 'уровень',
  },
] as const;

export const ACHIEVEMENT_ICON_NAMES = [
  'award',
  'target',
  'star',
  'chart',
  'shield',
  'message',
  'book',
  'flag',
] as const;
export type AchievementIconName = (typeof ACHIEVEMENT_ICON_NAMES)[number];

export interface ProgressLevel {
  level: number;
  title: string;
  currentThreshold: number;
  nextThreshold: number;
  earnedInLevel: number;
  neededInLevel: number;
  percent: number;
}

export interface RewardPoints {
  baseXp: number;
  endingPercent: number;
  penaltyXp: number;
  repeatPercent: number;
  xp: number;
  skillXp: number;
  stars: 1 | 2 | 3;
}

const DIFFICULTY_XP: Record<Difficulty, number> = {
  easy: 100,
  medium: 125,
  hard: 150,
};
const SKILL_XP: Record<Difficulty, number> = {
  easy: 10,
  medium: 13,
  hard: 16,
};
const ENDING_PERCENT: Record<EndingType, number> = {
  success: 100,
  neutral: 75,
  failure: 50,
};

export function rewardReasonFromHistory(anyScenario: boolean, sameEnding: boolean): RewardReason {
  if (!anyScenario) return 'first_completion';
  if (!sameEnding) return 'new_ending';
  return 'repeat_ending';
}

export function rewardRepeatPercent(reason: RewardReason) {
  return reason === 'repeat_ending' ? 35 : 100;
}

export function masteryStars(ending: EndingType, penalties: number): 1 | 2 | 3 {
  if (ending === 'success' && penalties <= 1) return 3;
  if (ending === 'success' || ending === 'neutral') return 2;
  return 1;
}

function roundToFive(value: number) {
  return Math.max(0, Math.round(value / 5) * 5);
}

export function calculateReward(
  difficulty: Difficulty,
  ending: EndingType,
  penalties: number,
  reason: RewardReason = 'first_completion',
): RewardPoints {
  const safePenalties = Math.max(0, Math.trunc(penalties));
  const baseXp = DIFFICULTY_XP[difficulty];
  const endingPercent = ENDING_PERCENT[ending];
  const penaltyXp = safePenalties * 5;
  const repeatPercent = rewardRepeatPercent(reason);
  const beforeRepeat = Math.max(25, roundToFive((baseXp * endingPercent) / 100) - penaltyXp);
  const xp = Math.max(10, roundToFive((beforeRepeat * repeatPercent) / 100));

  const skillBeforeRepeat = Math.max(
    4,
    Math.round((SKILL_XP[difficulty] * endingPercent) / 100) - safePenalties,
  );
  const skillXp = Math.max(2, Math.round((skillBeforeRepeat * repeatPercent) / 100));
  return {
    baseXp,
    endingPercent,
    penaltyXp,
    repeatPercent,
    xp,
    skillXp,
    stars: masteryStars(ending, safePenalties),
  };
}

export function normalizeSkillKey(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ') || 'общие переговоры';
}

function globalThreshold(level: number) {
  if (level <= 1) return 0;
  return 50 * (level - 1) * (level + 2);
}

function skillThreshold(level: number) {
  if (level <= 1) return 0;
  return 25 * (level - 1) * (level + 2);
}

function findLevel(total: number, threshold: (level: number) => number) {
  let level = 1;
  while (total >= threshold(level + 1)) level += 1;
  return level;
}

function progress(
  total: number,
  threshold: (level: number) => number,
  title: (level: number) => string,
): ProgressLevel {
  const safeTotal = Math.max(0, Math.trunc(total));
  const level = findLevel(safeTotal, threshold);
  const currentThreshold = threshold(level);
  const nextThreshold = threshold(level + 1);
  const earnedInLevel = safeTotal - currentThreshold;
  const neededInLevel = nextThreshold - currentThreshold;
  return {
    level,
    title: title(level),
    currentThreshold,
    nextThreshold,
    earnedInLevel,
    neededInLevel,
    percent: neededInLevel ? Math.min(100, Math.round((earnedInLevel / neededInLevel) * 100)) : 100,
  };
}

function globalTitle(level: number) {
  if (level < 3) return 'Новичок';
  if (level < 6) return 'Практик';
  if (level < 10) return 'Уверенный переговорщик';
  if (level < 15) return 'Продвинутый переговорщик';
  return 'Эксперт переговоров';
}

function skillTitle(level: number) {
  if (level < 2) return 'Базовый';
  if (level < 4) return 'Практик';
  if (level < 6) return 'Уверенный';
  if (level < 9) return 'Продвинутый';
  return 'Эксперт';
}

export function globalProgress(totalXp: number) {
  return progress(totalXp, globalThreshold, globalTitle);
}

export function skillProgress(totalXp: number) {
  return progress(totalXp, skillThreshold, skillTitle);
}
