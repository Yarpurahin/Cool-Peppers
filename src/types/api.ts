import type { Feedback, ScenarioAttempt } from '../features/negotiation/model/types.ts';
import type { MakerDefinition } from '../features/maker/model/types.ts';
import type { ScenarioPreview } from './scenario.ts';
import type { AchievementConditionType, AchievementIconName, RewardReason } from '../features/gamification/model.ts';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
  avatar: string | null;
  createdAt: string;
}
export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  scenarioCount: number;
}
export interface ScenarioDocument {
  preview: ScenarioPreview;
  definition: MakerDefinition;
}
export interface ScenarioDraft extends ScenarioDocument {
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
}
export interface AdminScenarioSummary {
  id: string;
  title: string;
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
  archivedAt: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface AttemptDetail {
  attempt: ScenarioAttempt;
  definition: MakerDefinition;
  feedback?: Feedback;
  reward?: AttemptReward;
  isCurrent: boolean;
  abandonedAt: string | null;
}
export interface HistoryRow {
  id: string;
  scenarioId: string;
  scenarioVersion: number;
  title: string;
  status: 'in-progress' | 'completed';
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  penalties: number;
  answers: number;
  outcome: string | null;
  xpEarned?: number;
  masteryStars?: 1 | 2 | 3;
}

export interface UnlockedAchievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: AchievementIconName;
}

export interface AttemptReward {
  attemptId: string;
  xpEarned: number;
  skillXpEarned: number;
  masteryStars: 1 | 2 | 3;
  endingType: 'success' | 'neutral' | 'failure';
  skill: string;
  rewardReason: RewardReason;
  breakdown: {
    baseXp: number;
    endingPercent: number;
    penaltyXp: number;
    repeatPercent: number;
  };
  achievementsUnlocked: UnlockedAchievement[];
}

export interface GamificationSkill {
  key: string;
  name: string;
  xp: number;
  attempts: number;
  level: number;
  levelTitle: string;
  progressPercent: number;
  earnedInLevel: number;
  neededInLevel: number;
}

export interface GamificationAchievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: AchievementIconName;
  unlocked: boolean;
  unlockedAt: string | null;
  active: boolean;
  progress: number;
  target: number;
  progressPercent: number;
}

export interface ScenarioMastery {
  scenarioId: string;
  title: string;
  bestStars: 1 | 2 | 3;
  completedAttempts: number;
  bestXp: number;
}

export interface GamificationSummary {
  totalXp: number;
  level: number;
  levelTitle: string;
  progressPercent: number;
  earnedInLevel: number;
  neededInLevel: number;
  completedAttempts: number;
  successfulAttempts: number;
  perfectAttempts: number;
  weeklyGoal: {
    target: number;
    completed: number;
    startsAt: string;
    endsAt: string;
  };
  skills: GamificationSkill[];
  achievements: GamificationAchievement[];
  mastery: ScenarioMastery[];
}

export interface AdminAchievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: AchievementIconName;
  conditionType: AchievementConditionType;
  conditionValue: number;
  conditionParam: string | null;
  isActive: boolean;
  unlockedUsers: number;
  unlockedPercent: number;
  createdAt: string;
  updatedAt: string;
}
