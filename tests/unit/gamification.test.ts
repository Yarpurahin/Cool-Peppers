import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateReward,
  globalProgress,
  masteryStars,
  normalizeSkillKey,
  rewardReasonFromHistory,
  rewardRepeatPercent,
  skillProgress,
} from '../../src/features/gamification/model.ts';

test('first completion and a new ending keep the full reward', () => {
  const first = calculateReward('hard', 'success', 0, 'first_completion');
  const newEnding = calculateReward('hard', 'success', 0, 'new_ending');
  assert.equal(first.baseXp, 150);
  assert.equal(first.xp, 150);
  assert.equal(first.skillXp, 16);
  assert.equal(first.stars, 3);
  assert.deepEqual(newEnding, first);
  assert.equal(rewardRepeatPercent('new_ending'), 100);
});

test('reward reason distinguishes first run, new ending and repeated ending', () => {
  assert.equal(rewardReasonFromHistory(false, false), 'first_completion');
  assert.equal(rewardReasonFromHistory(true, false), 'new_ending');
  assert.equal(rewardReasonFromHistory(true, true), 'repeat_ending');
});

test('the same ending is reduced to 35 percent but still grants progress', () => {
  const repeat = calculateReward('hard', 'success', 0, 'repeat_ending');
  assert.equal(repeat.repeatPercent, 35);
  assert.equal(repeat.xp, 55);
  assert.equal(repeat.skillXp, 6);
  assert.equal(repeat.stars, 3);
  assert.ok(repeat.xp > 0);
});

test('ending type and penalties affect XP and mastery independently', () => {
  const neutral = calculateReward('medium', 'neutral', 1, 'first_completion');
  assert.equal(neutral.baseXp, 125);
  assert.equal(neutral.endingPercent, 75);
  assert.equal(neutral.penaltyXp, 5);
  assert.equal(neutral.xp, 90);
  assert.equal(neutral.stars, 2);
  assert.equal(masteryStars('failure', 0), 1);
  assert.equal(masteryStars('success', 2), 2);
});

test('level and skill progress are derived from XP', () => {
  assert.equal(globalProgress(0).level, 1);
  assert.equal(globalProgress(200).level, 2);
  assert.ok(globalProgress(900).level > globalProgress(200).level);
  assert.ok(skillProgress(300).level > skillProgress(0).level);
  assert.equal(normalizeSkillKey('  Сложные   переговоры '), 'сложные переговоры');
});
