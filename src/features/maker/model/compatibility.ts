/**
 * Read-only compatibility for Arena data created before MakerDefinition became the
 * only executable scenario model. Nothing in this file is written back by new code.
 */
import type { Character, ScenarioMetadata } from '../../negotiation/model/types.ts';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import type { MakerDefinition, Penalty } from './types.ts';
import { analyzePenalty } from './penaltyAnalysis.ts';

export interface LegacyScenarioDefinition {
  metadata: ScenarioMetadata;
  settings: {
    allowRestart: boolean;
    collectFeedback: boolean;
    failure: { rule: 'half-all-questions'; endingId: string } | { rule: 'none' };
    navigation?: 'graph';
    assessmentNote?: string;
    feedbackMode?: 'immediate' | 'summary' | 'hidden';
  };
  startNodeId: string;
  characters: readonly Character[];
  stages: readonly { id: string; title: string }[];
  nodes: readonly {
    id: string;
    stageId: string;
    title: string;
    speakerId: string;
    text: string;
    textVariants?: readonly { afterAnswerId: string; text: string }[];
    answers: readonly {
      id: string;
      text: string;
      grade?: string;
      penalty: number;
      feedback: string;
      next: { type: 'node'; nodeId: string } | { type: 'ending'; endingId: string };
    }[];
  }[];
  endings: readonly {
    id: string;
    type: 'success' | 'neutral' | 'failure';
    title: string;
    description: string;
    nextStep: string;
  }[];
}

export interface LegacyScenarioPreview extends ScenarioPreview {
  dialogue: {
    title: string;
    speech: string;
    answers: { text: string; next: number }[];
  }[];
  example: {
    score: number;
    outcome: string;
    nextStep: string;
    observations: { title: string; text: string; quote: string }[];
  };
}

function penalty(value: number): Penalty {
  return value >= 2 ? 2 : value === 1 ? 1 : 0;
}

function activateLegacyPenalty(definition: MakerDefinition, endingId: string) {
  definition.settings.penalty.failureEndingId = endingId;
  const analysis = analyzePenalty(definition);
  definition.settings.penalty.threshold = analysis.recommendations?.recommended ?? 1;
  definition.settings.penalty.enabled = true;
}

export function upgradeLegacyDefinition(def: LegacyScenarioDefinition): MakerDefinition {
  const definition: MakerDefinition = {
    schemaVersion: 3,
    metadata: structuredClone(def.metadata),
    startNodeId: def.startNodeId,
    characters: structuredClone([...def.characters]),
    stages: structuredClone([...def.stages]),
    nodes: def.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      text: node.text,
      characterId: node.speakerId,
      stageId: node.stageId,
      textVariants: node.textVariants?.map((variant) => ({
        afterReactionId: variant.afterAnswerId,
        text: variant.text,
      })),
      reactions: node.answers.map((answer, index) => ({
        id: answer.id,
        intent: `legacy_${index + 1}_${answer.id.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 100),
        label: answer.text,
        examples: [answer.text],
        ...(answer.next.type === 'node'
          ? { nextNodeId: answer.next.nodeId }
          : { endingId: answer.next.endingId }),
        penalty: penalty(answer.penalty),
        feedback: answer.feedback,
      })),
    })),
    endings: def.endings.map((ending) => ({ ...structuredClone(ending) })),
    settings: {
      allowRestart: def.settings.allowRestart,
      collectFeedback: def.settings.collectFeedback,
      feedbackMode: def.settings.feedbackMode ?? 'summary',
      penalty: { enabled: false, threshold: 1 },
    },
  };
  if (def.settings.failure.rule === 'half-all-questions')
    activateLegacyPenalty(definition, def.settings.failure.endingId);
  return definition;
}

/** Last-resort upgrade for very old preview-only database snapshots. */
export function definitionFromLegacyPreview(preview: LegacyScenarioPreview): MakerDefinition {
  return {
    schemaVersion: 3,
    metadata: {
      id: preview.id,
      version: 1,
      title: preview.title,
      description: preview.description,
      category: preview.category,
      difficulty:
        preview.level === 'Начальный' ? 'easy' : preview.level === 'Продвинутый' ? 'hard' : 'medium',
      duration: preview.duration,
      skill: preview.skill,
      context: preview.context,
      goal: preview.goal,
      playerRole: preview.role,
      tip: preview.tip,
    },
    settings: {
      allowRestart: true,
      collectFeedback: true,
      feedbackMode: 'summary',
      penalty: { enabled: false, threshold: 1 },
    },
    startNodeId: 'node_1',
    characters: [
      {
        id: 'character_1',
        name: preview.person.name,
        initials: preview.person.initials,
        role: preview.person.role,
        description: preview.person.character,
      },
    ],
    stages: [{ id: 'conversation', title: 'Разговор' }],
    nodes: preview.dialogue.map((node, index) => ({
      id: `node_${index + 1}`,
      title: node.title,
      text: node.speech,
      characterId: 'character_1',
      stageId: 'conversation',
      reactions: node.answers.map((answer, reactionIndex) => ({
        id: `reaction_${index + 1}_${reactionIndex + 1}`,
        intent: `reaction_${index + 1}_${reactionIndex + 1}`,
        label: answer.text,
        examples: [answer.text],
        penalty: 0,
        feedback: '',
        ...(answer.next === -1
          ? { endingId: 'ending_1' }
          : { nextNodeId: `node_${answer.next + 1}` }),
      })),
    })),
    endings: [
      {
        id: 'ending_1',
        type: 'neutral',
        title: preview.example.outcome || 'Разговор завершён',
        description: 'Вы прошли выбранную ветку диалога.',
        nextStep: preview.example.nextStep || undefined,
      },
    ],
  };
}

export function stripLegacyPreview(preview: LegacyScenarioPreview | ScenarioPreview): ScenarioPreview {
  const { dialogue: _dialogue, example: _example, ...current } = preview as LegacyScenarioPreview;
  void _dialogue;
  void _example;
  return structuredClone(current);
}
