import type { Express } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { MakerDefinition } from '../src/features/maker/model/types.ts';
import {
  ACHIEVEMENT_ICON_NAMES,
  calculateReward,
  globalProgress,
  normalizeSkillKey,
  rewardReasonFromHistory,
  skillProgress,
  type AchievementConditionType,
  type AchievementIconName,
  type Difficulty,
  type EndingType,
  type RewardReason,
} from '../src/features/gamification/model.ts';
import type {
  AdminAchievement,
  AttemptReward,
  GamificationAchievement,
  GamificationSummary,
  GamificationSkill,
  ScenarioMastery,
  UnlockedAchievement,
} from '../src/types/api.ts';
import { admin, randomUUID, user } from './auth.ts';
import type { AttemptRow, Database } from './store.ts';
import { uuidSchema } from './validation.ts';

interface RewardRow {
  attempt_id: string;
  user_id: string;
  scenario_id: string;
  ending_id: string;
  skill_name: string;
  difficulty: Difficulty;
  ending_type: EndingType;
  reward_reason: RewardReason;
  base_xp: number;
  ending_percent: number;
  penalty_xp: number;
  repeat_percent: number;
  xp_earned: number;
  skill_xp_earned: number;
  mastery_stars: 1 | 2 | 3;
}

interface AchievementRow {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: AchievementIconName;
  condition_type: AchievementConditionType;
  condition_value: number;
  condition_param: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface AchievementStats {
  completed: number;
  successful: number;
  perfect: number;
  threeStar: number;
  distinctScenarios: number;
  maxDistinctEndings: number;
  maxSkillAttempts: number;
  easySuccesses: number;
  mediumSuccesses: number;
  hardSuccesses: number;
  totalXp: number;
  level: number;
}

const CONDITION_TYPES = [
  'completed_attempts',
  'successful_attempts',
  'perfect_attempts',
  'difficulty_successes',
  'three_star_attempts',
  'distinct_endings',
  'skill_attempts',
  'distinct_scenarios',
  'global_level',
] as const;

const achievementInputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(300),
    icon: z.enum(ACHIEVEMENT_ICON_NAMES),
    conditionType: z.enum(CONDITION_TYPES),
    conditionValue: z.coerce.number().int().min(1).max(1_000_000),
    conditionParam: z.string().trim().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (value.conditionType === 'difficulty_successes') {
      if (!['easy', 'medium', 'hard'].includes(value.conditionParam ?? ''))
        context.addIssue({
          code: 'custom',
          path: ['conditionParam'],
          message: 'Выберите сложность сценария.',
        });
    }
  });

function mapUnlocked(row: AchievementRow): UnlockedAchievement {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    icon: row.icon,
  };
}

async function achievementsForAttempt(db: Database, attemptId: string) {
  const rows = await db.query<AchievementRow>(
    `SELECT a.* FROM user_achievements ua
     JOIN achievements a ON a.id = ua.achievement_id
     WHERE ua.source_attempt_id = $1 ORDER BY ua.unlocked_at, a.code`,
    [attemptId],
  );
  return rows.rows.map(mapUnlocked);
}

function mapReward(row: RewardRow, achievementsUnlocked: UnlockedAchievement[]): AttemptReward {
  return {
    attemptId: row.attempt_id,
    xpEarned: Number(row.xp_earned),
    skillXpEarned: Number(row.skill_xp_earned),
    masteryStars: Number(row.mastery_stars) as 1 | 2 | 3,
    endingType: row.ending_type,
    skill: row.skill_name,
    rewardReason: row.reward_reason,
    breakdown: {
      baseXp: Number(row.base_xp),
      endingPercent: Number(row.ending_percent),
      penaltyXp: Number(row.penalty_xp),
      repeatPercent: Number(row.repeat_percent),
    },
    achievementsUnlocked,
  };
}

export async function getAttemptReward(
  db: Database,
  attemptId: string,
): Promise<AttemptReward | undefined> {
  const reward = await db.query<RewardRow>('SELECT * FROM attempt_rewards WHERE attempt_id = $1', [
    attemptId,
  ]);
  if (!reward.rowCount) return undefined;
  return mapReward(reward.rows[0], await achievementsForAttempt(db, attemptId));
}

async function achievementStats(db: Database, userId: string): Promise<AchievementStats> {
  const result = await db.query<{
    completed: number;
    successful: number;
    perfect: number;
    three_star: number;
    distinct_scenarios: number;
    max_distinct_endings: number;
    max_skill_attempts: number;
    easy_successes: number;
    medium_successes: number;
    hard_successes: number;
    total_xp: number;
  }>(
    `SELECT
      count(*)::int AS completed,
      count(*) FILTER (WHERE r.ending_type = 'success')::int AS successful,
      count(*) FILTER (WHERE a.penalties = 0)::int AS perfect,
      count(*) FILTER (WHERE r.mastery_stars = 3)::int AS three_star,
      count(DISTINCT r.scenario_id)::int AS distinct_scenarios,
      coalesce((SELECT max(n) FROM (
        SELECT count(DISTINCT ending_id)::int AS n FROM attempt_rewards
        WHERE user_id = $1 GROUP BY scenario_id
      ) endings), 0)::int AS max_distinct_endings,
      coalesce((SELECT max(n) FROM (
        SELECT count(*)::int AS n FROM attempt_rewards
        WHERE user_id = $1 GROUP BY skill_key
      ) skills), 0)::int AS max_skill_attempts,
      count(*) FILTER (WHERE r.difficulty = 'easy' AND r.ending_type = 'success')::int AS easy_successes,
      count(*) FILTER (WHERE r.difficulty = 'medium' AND r.ending_type = 'success')::int AS medium_successes,
      count(*) FILTER (WHERE r.difficulty = 'hard' AND r.ending_type = 'success')::int AS hard_successes,
      coalesce(sum(r.xp_earned), 0)::int AS total_xp
    FROM attempt_rewards r
    LEFT JOIN attempts a ON a.id = r.attempt_id
    WHERE r.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  const totalXp = Number(row.total_xp);
  return {
    completed: Number(row.completed),
    successful: Number(row.successful),
    perfect: Number(row.perfect),
    threeStar: Number(row.three_star),
    distinctScenarios: Number(row.distinct_scenarios),
    maxDistinctEndings: Number(row.max_distinct_endings),
    maxSkillAttempts: Number(row.max_skill_attempts),
    easySuccesses: Number(row.easy_successes),
    mediumSuccesses: Number(row.medium_successes),
    hardSuccesses: Number(row.hard_successes),
    totalXp,
    level: globalProgress(totalXp).level,
  };
}

function achievementCurrent(row: AchievementRow, stats: AchievementStats) {
  switch (row.condition_type) {
    case 'completed_attempts':
      return stats.completed;
    case 'successful_attempts':
      return stats.successful;
    case 'perfect_attempts':
      return stats.perfect;
    case 'difficulty_successes':
      if (row.condition_param === 'easy') return stats.easySuccesses;
      if (row.condition_param === 'medium') return stats.mediumSuccesses;
      return stats.hardSuccesses;
    case 'three_star_attempts':
      return stats.threeStar;
    case 'distinct_endings':
      return stats.maxDistinctEndings;
    case 'skill_attempts':
      return stats.maxSkillAttempts;
    case 'distinct_scenarios':
      return stats.distinctScenarios;
    case 'global_level':
      return stats.level;
  }
}

async function activeAchievementRows(db: Database, onlyId?: string) {
  return (
    await db.query<AchievementRow>(
      `SELECT * FROM achievements WHERE is_active${onlyId ? ' AND id = $1' : ''} ORDER BY created_at, code`,
      onlyId ? [onlyId] : [],
    )
  ).rows;
}

async function syncAchievementsForUser(
  db: Database,
  userId: string,
  sourceAttemptId: string | null = null,
  onlyId?: string,
) {
  const [stats, definitions] = await Promise.all([
    achievementStats(db, userId),
    activeAchievementRows(db, onlyId),
  ]);
  const unlocked: UnlockedAchievement[] = [];
  for (const definition of definitions) {
    if (achievementCurrent(definition, stats) < Number(definition.condition_value)) continue;
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO user_achievements(user_id, achievement_id, source_attempt_id)
       VALUES ($1,$2,$3) ON CONFLICT (user_id, achievement_id) DO NOTHING RETURNING achievement_id AS id`,
      [userId, definition.id, sourceAttemptId],
    );
    if (inserted.rowCount) unlocked.push(mapUnlocked(definition));
  }
  return unlocked;
}

async function syncAchievementForAllUsers(db: Database, achievementId: string) {
  const users = await db.query<{ id: string }>('SELECT id FROM app_users ORDER BY created_at, id');
  for (const account of users.rows)
    await syncAchievementsForUser(db, account.id, null, achievementId);
}

async function rewardReasonFor(
  db: Database,
  userId: string,
  scenarioId: string,
  endingId: string,
): Promise<RewardReason> {
  const previous = await db.query<{ any_scenario: boolean; same_ending: boolean }>(
    `SELECT
      EXISTS (SELECT 1 FROM attempt_rewards WHERE user_id = $1 AND scenario_id = $2) AS any_scenario,
      EXISTS (SELECT 1 FROM attempt_rewards WHERE user_id = $1 AND scenario_id = $2 AND ending_id = $3) AS same_ending`,
    [userId, scenarioId, endingId],
  );
  return rewardReasonFromHistory(previous.rows[0].any_scenario, previous.rows[0].same_ending);
}

export async function awardCompletedAttempt(
  db: Database,
  userId: string,
  row: AttemptRow,
  definition: MakerDefinition,
): Promise<AttemptReward> {
  const existing = await getAttemptReward(db, row.id);
  if (existing) return existing;
  if (row.status !== 'completed' || !row.ending_id)
    throw new Error('Gamification reward requires a completed attempt');
  const ending = definition.endings.find((item) => item.id === row.ending_id);
  if (!ending) throw new Error(`Unknown ending for gamification: ${row.ending_id}`);
  const difficulty = definition.metadata.difficulty;
  const skill = definition.metadata.skill.trim() || 'Общие переговоры';
  const reason = await rewardReasonFor(db, userId, row.scenario_id, row.ending_id);
  const points = calculateReward(difficulty, ending.type, row.penalties, reason);
  const inserted = await db.query<RewardRow>(
    `INSERT INTO attempt_rewards(
      attempt_id, user_id, scenario_id, ending_id, skill_key, skill_name, difficulty, ending_type,
      reward_reason, base_xp, ending_percent, penalty_xp, repeat_percent,
      xp_earned, skill_xp_earned, mastery_stars, awarded_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (attempt_id) DO NOTHING RETURNING *`,
    [
      row.id,
      userId,
      row.scenario_id,
      row.ending_id,
      normalizeSkillKey(skill),
      skill,
      difficulty,
      ending.type,
      reason,
      points.baseXp,
      points.endingPercent,
      points.penaltyXp,
      points.repeatPercent,
      points.xp,
      points.skillXp,
      points.stars,
      row.completed_at ?? row.updated_at,
    ],
  );
  if (!inserted.rowCount) {
    const saved = await getAttemptReward(db, row.id);
    if (!saved) throw new Error('Gamification reward was not saved');
    return saved;
  }
  const achievementsUnlocked = await syncAchievementsForUser(db, userId, row.id);
  return mapReward(inserted.rows[0], achievementsUnlocked);
}

export async function getGamificationSummary(
  db: Database,
  userId: string,
): Promise<GamificationSummary> {
  await syncAchievementsForUser(db, userId);
  const stats = await achievementStats(db, userId);
  const global = globalProgress(stats.totalXp);

  const week = await db.query<{ completed: number; starts_at: Date; ends_at: Date }>(
    `SELECT
      count(*) FILTER (WHERE awarded_at >= date_trunc('week', now()))::int AS completed,
      date_trunc('week', now()) AS starts_at,
      date_trunc('week', now()) + interval '7 days' AS ends_at
    FROM attempt_rewards WHERE user_id = $1`,
    [userId],
  );

  const skillRows = await db.query<{
    skill_key: string;
    skill_name: string;
    xp: number;
    attempts: number;
  }>(
    `SELECT skill_key, max(skill_name) AS skill_name,
      sum(skill_xp_earned)::int AS xp, count(*)::int AS attempts
    FROM attempt_rewards WHERE user_id = $1
    GROUP BY skill_key ORDER BY xp DESC, skill_name`,
    [userId],
  );
  const skills: GamificationSkill[] = skillRows.rows.map((row) => {
    const value = skillProgress(Number(row.xp));
    return {
      key: row.skill_key,
      name: row.skill_name,
      xp: Number(row.xp),
      attempts: Number(row.attempts),
      level: value.level,
      levelTitle: value.title,
      progressPercent: value.percent,
      earnedInLevel: value.earnedInLevel,
      neededInLevel: value.neededInLevel,
    };
  });

  const masteryRows = await db.query<{
    scenario_id: string;
    title: string;
    best_stars: 1 | 2 | 3;
    completed_attempts: number;
    best_xp: number;
  }>(
    `SELECT r.scenario_id,
      (array_agg(v.preview->>'title' ORDER BY a.completed_at DESC, a.id DESC))[1] AS title,
      max(r.mastery_stars)::int AS best_stars,
      count(*)::int AS completed_attempts,
      max(r.xp_earned)::int AS best_xp
    FROM attempt_rewards r
    JOIN attempts a ON a.id = r.attempt_id
    JOIN scenario_versions v ON (v.scenario_id, v.version) = (a.scenario_id, a.scenario_version)
    WHERE r.user_id = $1
    GROUP BY r.scenario_id
    ORDER BY best_stars DESC, completed_attempts DESC, title`,
    [userId],
  );
  const mastery: ScenarioMastery[] = masteryRows.rows.map((row) => ({
    scenarioId: row.scenario_id,
    title: row.title,
    bestStars: Number(row.best_stars) as 1 | 2 | 3,
    completedAttempts: Number(row.completed_attempts),
    bestXp: Number(row.best_xp),
  }));

  const definitions = await db.query<AchievementRow & { unlocked_at: Date | null }>(
    `SELECT a.*, ua.unlocked_at
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
     WHERE a.is_active OR ua.user_id IS NOT NULL
     ORDER BY (ua.unlocked_at IS NOT NULL) DESC, a.is_active DESC, a.created_at, a.code`,
    [userId],
  );
  const achievements: GamificationAchievement[] = definitions.rows.map((item) => {
    const current = achievementCurrent(item, stats);
    const target = Number(item.condition_value);
    return {
      id: item.id,
      code: item.code,
      title: item.title,
      description: item.description,
      icon: item.icon,
      unlocked: Boolean(item.unlocked_at),
      unlockedAt: item.unlocked_at?.toISOString() ?? null,
      active: item.is_active,
      progress: Math.min(current, target),
      target,
      progressPercent: target ? Math.min(100, Math.round((current / target) * 100)) : 100,
    };
  });

  return {
    totalXp: stats.totalXp,
    level: global.level,
    levelTitle: global.title,
    progressPercent: global.percent,
    earnedInLevel: global.earnedInLevel,
    neededInLevel: global.neededInLevel,
    completedAttempts: stats.completed,
    successfulAttempts: stats.successful,
    perfectAttempts: stats.perfect,
    weeklyGoal: {
      target: 3,
      completed: Number(week.rows[0].completed),
      startsAt: week.rows[0].starts_at.toISOString(),
      endsAt: week.rows[0].ends_at.toISOString(),
    },
    skills,
    achievements,
    mastery,
  };
}

function adminAchievement(row: AchievementRow & { unlocked_users: number; total_users: number }): AdminAchievement {
  const totalUsers = Number(row.total_users);
  const unlockedUsers = Number(row.unlocked_users);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    icon: row.icon,
    conditionType: row.condition_type,
    conditionValue: Number(row.condition_value),
    conditionParam: row.condition_param,
    isActive: row.is_active,
    unlockedUsers,
    unlockedPercent: totalUsers ? Math.round((unlockedUsers / totalUsers) * 100) : 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function listAdminAchievements(db: Database) {
  const rows = await db.query<AchievementRow & { unlocked_users: number; total_users: number }>(
    `SELECT a.*,
      (SELECT count(*)::int FROM user_achievements ua WHERE ua.achievement_id = a.id) AS unlocked_users,
      (SELECT count(*)::int FROM app_users) AS total_users
     FROM achievements a ORDER BY a.is_active DESC, a.created_at, a.code`,
  );
  return rows.rows.map(adminAchievement);
}

function normalizedParam(type: AchievementConditionType, value: string | null | undefined) {
  return type === 'difficulty_successes' ? value ?? 'hard' : null;
}

export function registerGamificationRoutes(app: Express, pool: Pool) {
  app.get('/api/me/gamification', async (_req, res) => {
    res.json(await getGamificationSummary(pool, user(res).id));
  });

  app.get('/api/admin/achievements', async (_req, res) => {
    admin(res);
    const active = await activeAchievementRows(pool);
    for (const achievement of active) await syncAchievementForAllUsers(pool, achievement.id);
    res.json(await listAdminAchievements(pool));
  });

  app.post('/api/admin/achievements', async (req, res) => {
    admin(res);
    const input = achievementInputSchema.parse(req.body);
    const id = randomUUID();
    const code = `custom_${id.replaceAll('-', '')}`.slice(0, 80);
    await pool.query(
      `INSERT INTO achievements(
        id, code, title, description, icon, condition_type, condition_value, condition_param, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        code,
        input.title,
        input.description,
        input.icon,
        input.conditionType,
        input.conditionValue,
        normalizedParam(input.conditionType, input.conditionParam),
        input.isActive ?? true,
      ],
    );
    if (input.isActive ?? true) await syncAchievementForAllUsers(pool, id);
    const saved = (await listAdminAchievements(pool)).find((item) => item.id === id);
    res.status(201).json(saved);
  });

  app.patch('/api/admin/achievements/:id', async (req, res) => {
    admin(res);
    const id = uuidSchema.parse(req.params.id);
    const input = achievementInputSchema.parse(req.body);
    const saved = await pool.query(
      `UPDATE achievements SET title=$2, description=$3, icon=$4, condition_type=$5,
       condition_value=$6, condition_param=$7, is_active=$8, updated_at=now()
       WHERE id=$1 RETURNING id`,
      [
        id,
        input.title,
        input.description,
        input.icon,
        input.conditionType,
        input.conditionValue,
        normalizedParam(input.conditionType, input.conditionParam),
        input.isActive ?? true,
      ],
    );
    if (!saved.rowCount) {
      res.status(404).json({ error: 'Достижение не найдено' });
      return;
    }
    if (input.isActive ?? true) await syncAchievementForAllUsers(pool, id);
    res.json((await listAdminAchievements(pool)).find((item) => item.id === id));
  });
}
