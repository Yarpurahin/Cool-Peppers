-- Progress is derived from completed attempts. A reward is immutable and one-per-attempt,
-- which prevents answer retries from granting XP twice.
CREATE TABLE attempt_rewards (
  attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  scenario_id text NOT NULL,
  ending_id text NOT NULL,
  skill_key text NOT NULL CHECK (char_length(skill_key) BETWEEN 1 AND 200),
  skill_name text NOT NULL CHECK (char_length(skill_name) BETWEEN 1 AND 200),
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ending_type text NOT NULL CHECK (ending_type IN ('success', 'neutral', 'failure')),
  reward_reason text NOT NULL CHECK (reward_reason IN ('first_completion', 'new_ending', 'repeat_ending')),
  base_xp integer NOT NULL CHECK (base_xp >= 0),
  ending_percent integer NOT NULL CHECK (ending_percent BETWEEN 0 AND 100),
  penalty_xp integer NOT NULL CHECK (penalty_xp >= 0),
  repeat_percent integer NOT NULL CHECK (repeat_percent BETWEEN 1 AND 100),
  xp_earned integer NOT NULL CHECK (xp_earned >= 0),
  skill_xp_earned integer NOT NULL CHECK (skill_xp_earned >= 0),
  mastery_stars smallint NOT NULL CHECK (mastery_stars BETWEEN 1 AND 3),
  awarded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attempt_rewards_user_idx ON attempt_rewards(user_id, awarded_at DESC);
CREATE INDEX attempt_rewards_skill_idx ON attempt_rewards(user_id, skill_key);
CREATE INDEX attempt_rewards_mastery_idx ON attempt_rewards(user_id, scenario_id);
CREATE INDEX attempt_rewards_ending_idx ON attempt_rewards(user_id, scenario_id, ending_id);

-- Achievement rules live in the database and can be managed by administrators.
CREATE TABLE achievements (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{1,80}$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 300),
  icon text NOT NULL DEFAULT 'award' CHECK (icon IN ('award','target','star','chart','shield','message','book','flag')),
  condition_type text NOT NULL CHECK (condition_type IN (
    'completed_attempts','successful_attempts','perfect_attempts','difficulty_successes',
    'three_star_attempts','distinct_endings','skill_attempts','distinct_scenarios','global_level'
  )),
  condition_value integer NOT NULL CHECK (condition_value BETWEEN 1 AND 1000000),
  condition_param text CHECK (condition_param IS NULL OR char_length(condition_param) <= 80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX achievements_active_idx ON achievements(is_active, created_at);

CREATE TABLE user_achievements (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE RESTRICT,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  source_attempt_id uuid REFERENCES attempts(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX user_achievements_unlocked_idx ON user_achievements(user_id, unlocked_at DESC);
CREATE INDEX user_achievements_achievement_idx ON user_achievements(achievement_id, unlocked_at DESC);

INSERT INTO achievements(id, code, title, description, icon, condition_type, condition_value, condition_param) VALUES
  ('00000000-0000-4000-8000-000000000001', 'first_round', 'Первый раунд', 'Завершите первый сценарий переговоров.', 'award', 'completed_attempts', 1, NULL),
  ('00000000-0000-4000-8000-000000000002', 'clean_round', 'Чистая аргументация', 'Завершите сценарий без штрафных баллов.', 'target', 'perfect_attempts', 1, NULL),
  ('00000000-0000-4000-8000-000000000003', 'hard_success', 'Сложный разговор', 'Получите успешный итог в сложном сценарии.', 'shield', 'difficulty_successes', 1, 'hard'),
  ('00000000-0000-4000-8000-000000000004', 'five_sessions', 'Регулярная практика', 'Завершите пять тренировок.', 'chart', 'completed_attempts', 5, NULL),
  ('00000000-0000-4000-8000-000000000005', 'master_scenario', 'Мастер сценария', 'Получите три звезды мастерства.', 'star', 'three_star_attempts', 1, NULL),
  ('00000000-0000-4000-8000-000000000006', 'three_endings', 'Несколько путей', 'Откройте три разные концовки одного сценария.', 'flag', 'distinct_endings', 3, NULL),
  ('00000000-0000-4000-8000-000000000007', 'skill_builder', 'Навык в работе', 'Завершите три тренировки одного навыка.', 'message', 'skill_attempts', 3, NULL),
  ('00000000-0000-4000-8000-000000000008', 'scenario_explorer', 'Широкий кругозор', 'Завершите три разных сценария.', 'book', 'distinct_scenarios', 3, NULL);

-- Backfill completed graph-based scenarios. The repeat multiplier is reconstructed in chronological
-- order: first completion and every new ending give 100%, an already seen ending gives 35%.
WITH completed AS (
  SELECT
    a.id AS attempt_id,
    a.user_id,
    a.scenario_id,
    a.ending_id,
    a.penalties,
    a.completed_at,
    coalesce(nullif(btrim(v.definition #>> '{metadata,skill}'), ''), 'Общие переговоры') AS skill_name,
    CASE coalesce(v.definition #>> '{metadata,difficulty}', 'medium')
      WHEN 'easy' THEN 'easy'
      WHEN 'hard' THEN 'hard'
      ELSE 'medium'
    END AS difficulty,
    coalesce((
      SELECT e->>'type'
      FROM jsonb_array_elements(v.definition->'endings') e
      WHERE e->>'id' = a.ending_id
      LIMIT 1
    ), 'neutral') AS ending_type
  FROM attempts a
  JOIN scenario_versions v
    ON (v.scenario_id, v.version) = (a.scenario_id, a.scenario_version)
  WHERE a.status = 'completed' AND v.definition IS NOT NULL AND a.ending_id IS NOT NULL
), ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY user_id, scenario_id ORDER BY completed_at, attempt_id) AS scenario_seq,
    row_number() OVER (PARTITION BY user_id, scenario_id, ending_id ORDER BY completed_at, attempt_id) AS ending_seq
  FROM completed
), scored AS (
  SELECT *,
    lower(regexp_replace(btrim(skill_name), '[[:space:]]+', ' ', 'g')) AS skill_key,
    CASE difficulty WHEN 'easy' THEN 100 WHEN 'hard' THEN 150 ELSE 125 END AS base_xp,
    CASE difficulty WHEN 'easy' THEN 10 WHEN 'hard' THEN 16 ELSE 13 END AS base_skill_xp,
    CASE ending_type WHEN 'success' THEN 100 WHEN 'failure' THEN 50 ELSE 75 END AS ending_percent,
    CASE WHEN scenario_seq = 1 THEN 'first_completion'
         WHEN ending_seq = 1 THEN 'new_ending'
         ELSE 'repeat_ending' END AS reward_reason,
    CASE WHEN scenario_seq = 1 OR ending_seq = 1 THEN 100 ELSE 35 END AS repeat_percent
  FROM ranked
), reduced AS (
  SELECT *,
    greatest(25, (round((base_xp * ending_percent)::numeric / 500) * 5)::int - penalties * 5) AS before_repeat,
    greatest(4, round((base_skill_xp * ending_percent)::numeric / 100)::int - penalties) AS skill_before_repeat
  FROM scored
)
INSERT INTO attempt_rewards(
  attempt_id, user_id, scenario_id, ending_id, skill_key, skill_name, difficulty, ending_type,
  reward_reason, base_xp, ending_percent, penalty_xp, repeat_percent,
  xp_earned, skill_xp_earned, mastery_stars, awarded_at
)
SELECT
  attempt_id, user_id, scenario_id, ending_id, skill_key, skill_name, difficulty, ending_type,
  reward_reason, base_xp, ending_percent, penalties * 5, repeat_percent,
  greatest(10, (round((before_repeat * repeat_percent)::numeric / 500) * 5)::int),
  greatest(2, round((skill_before_repeat * repeat_percent)::numeric / 100)::int),
  CASE
    WHEN ending_type = 'success' AND penalties <= 1 THEN 3
    WHEN ending_type IN ('success', 'neutral') THEN 2
    ELSE 1
  END,
  completed_at
FROM reduced
ON CONFLICT (attempt_id) DO NOTHING;

-- Seeded achievements are also retroactive. Custom achievements are synchronized by the server
-- when an administrator creates/edits them and whenever a user opens their progress.
INSERT INTO user_achievements(user_id, achievement_id, unlocked_at, source_attempt_id)
SELECT DISTINCT ON (r.user_id) r.user_id, '00000000-0000-4000-8000-000000000001', r.awarded_at, r.attempt_id
FROM attempt_rewards r ORDER BY r.user_id, r.awarded_at, r.attempt_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at, source_attempt_id)
SELECT DISTINCT ON (r.user_id) r.user_id, '00000000-0000-4000-8000-000000000002', r.awarded_at, r.attempt_id
FROM attempt_rewards r JOIN attempts a ON a.id = r.attempt_id
WHERE a.penalties = 0 ORDER BY r.user_id, r.awarded_at, r.attempt_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at, source_attempt_id)
SELECT DISTINCT ON (r.user_id) r.user_id, '00000000-0000-4000-8000-000000000003', r.awarded_at, r.attempt_id
FROM attempt_rewards r WHERE r.difficulty = 'hard' AND r.ending_type = 'success'
ORDER BY r.user_id, r.awarded_at, r.attempt_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at)
SELECT r.user_id, '00000000-0000-4000-8000-000000000004', max(r.awarded_at)
FROM attempt_rewards r GROUP BY r.user_id HAVING count(*) >= 5
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at, source_attempt_id)
SELECT DISTINCT ON (r.user_id) r.user_id, '00000000-0000-4000-8000-000000000005', r.awarded_at, r.attempt_id
FROM attempt_rewards r WHERE r.mastery_stars = 3
ORDER BY r.user_id, r.awarded_at, r.attempt_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at)
SELECT x.user_id, '00000000-0000-4000-8000-000000000006', max(x.awarded_at)
FROM attempt_rewards x
WHERE EXISTS (
  SELECT 1 FROM attempt_rewards r
  WHERE r.user_id = x.user_id
  GROUP BY r.scenario_id HAVING count(DISTINCT r.ending_id) >= 3
)
GROUP BY x.user_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at)
SELECT x.user_id, '00000000-0000-4000-8000-000000000007', max(x.awarded_at)
FROM attempt_rewards x
WHERE EXISTS (
  SELECT 1 FROM attempt_rewards r
  WHERE r.user_id = x.user_id
  GROUP BY r.skill_key HAVING count(*) >= 3
)
GROUP BY x.user_id
ON CONFLICT DO NOTHING;

INSERT INTO user_achievements(user_id, achievement_id, unlocked_at)
SELECT r.user_id, '00000000-0000-4000-8000-000000000008', max(r.awarded_at)
FROM attempt_rewards r GROUP BY r.user_id HAVING count(DISTINCT r.scenario_id) >= 3
ON CONFLICT DO NOTHING;
