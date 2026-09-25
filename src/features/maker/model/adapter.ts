import type { ScenarioDefinition } from '../../negotiation/model/types.ts';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import type { AuthoringDraft, MakerDefinition, MakerDraft } from './types.ts';

export function isMakerDefinition(
  value: ScenarioDefinition | MakerDefinition,
): value is MakerDefinition {
  return 'schemaVersion' in value && value.schemaVersion === 2;
}

/** A pure, repeatable adapter: no generated IDs, no database writes, no changes to old versions. */
export function toMakerDefinition(def: ScenarioDefinition): MakerDefinition {
  return {
    schemaVersion: 2,
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
      textVariants: node.textVariants?.map((v) => ({
        afterReactionId: v.afterAnswerId,
        text: v.text,
      })),
      reactions: node.answers.map((answer, index) => ({
        id: answer.id,
        intent: `legacy_${index + 1}_${answer.id.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(0, 100),
        label: answer.text,
        examples: [answer.text],
        ...(answer.next.type === 'node'
          ? { nextNodeId: answer.next.nodeId }
          : { endingId: answer.next.endingId }),
        legacy: { penalty: answer.penalty, feedback: answer.feedback },
      })),
    })),
    endings: structuredClone([...def.endings]),
    settings: {
      allowRestart: def.settings.allowRestart,
      collectFeedback: def.settings.collectFeedback,
      ...(def.settings.failure.rule === 'half-all-questions'
        ? { legacyFailure: { ...def.settings.failure } }
        : {}),
      assessmentNote: def.settings.assessmentNote,
    },
  };
}

export function fromPreview(preview: ScenarioPreview): MakerDefinition {
  const blank = createBlankDefinition(preview.id, preview.title);
  const { example: _example, dialogue: _dialogue, person: _person, ...meta } = preview;
  void _example;
  void _dialogue;
  void _person;
  blank.metadata = {
    ...blank.metadata,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    difficulty:
      meta.level === 'Начальный' ? 'easy' : meta.level === 'Продвинутый' ? 'hard' : 'medium',
    duration: meta.duration,
    skill: meta.skill,
    context: meta.context,
    goal: meta.goal,
    playerRole: meta.role,
    tip: meta.tip,
  };
  blank.characters = [
    {
      id: 'character_1',
      name: preview.person.name,
      initials: preview.person.initials,
      role: preview.person.role,
      description: preview.person.character,
    },
  ];
  blank.nodes = preview.dialogue.map((node, index) => ({
    id: `node_${index + 1}`,
    title: node.title,
    text: node.speech,
    characterId: 'character_1',
    stageId: 'conversation',
    reactions: node.answers.map((answer, i) => ({
      id: `reaction_${index + 1}_${i + 1}`,
      intent: `reaction_${index + 1}_${i + 1}`,
      label: answer.text,
      examples: [answer.text],
      ...(answer.next === -1
        ? { endingId: 'ending_1' }
        : { nextNodeId: `node_${answer.next + 1}` }),
    })),
  }));
  blank.startNodeId = 'node_1';
  // Legacy preview "scores" were placeholders, so they are not turned into real assessment.
  blank.endings = [
    {
      id: 'ending_1',
      type: 'neutral',
      title: 'Разговор завершён',
      description: 'Вы прошли выбранную ветку диалога.',
    },
  ];
  return blank;
}

export function createBlankDefinition(id: string, title: string): MakerDefinition {
  return {
    schemaVersion: 2,
    metadata: {
      id,
      version: 1,
      title,
      description: '',
      category: 'Карьера',
      difficulty: 'medium',
      duration: '5–10 минут',
      skill: 'Ведение диалога',
      context: '',
      goal: '',
      playerRole: 'Участник',
      tip: '',
    },
    settings: { allowRestart: true, collectFeedback: true },
    startNodeId: 'node_1',
    characters: [
      { id: 'character_1', name: 'Анна', initials: 'А', role: 'Собеседник', description: '' },
    ],
    stages: [{ id: 'conversation', title: 'Разговор' }],
    nodes: [
      {
        id: 'node_1',
        title: 'Начало разговора',
        text: '',
        characterId: 'character_1',
        stageId: 'conversation',
        reactions: [],
      },
    ],
    endings: [],
  };
}

export function toMakerDraft(draft: AuthoringDraft): MakerDraft {
  const definition = !draft.definition
    ? fromPreview(draft.preview)
    : isMakerDefinition(draft.definition)
      ? structuredClone(draft.definition)
      : toMakerDefinition(draft.definition);
  return { ...draft, definition, editor: structuredClone(draft.editor ?? { positions: {} }) };
}

/** Existing player and attempt history consume this projection; it is never stored beside v2. */
export function toRuntimeDefinition(def: MakerDefinition): ScenarioDefinition {
  let ungroupedId = 'maker_ungrouped';
  while (def.stages.some((s) => s.id === ungroupedId)) ungroupedId += '_';
  return {
    metadata: structuredClone(def.metadata),
    startNodeId: def.startNodeId,
    characters: structuredClone(def.characters),
    stages: [
      ...structuredClone(def.stages),
      ...(def.nodes.some((n) => !n.stageId) ? [{ id: ungroupedId, title: 'Разговор' }] : []),
    ],
    nodes: def.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      text: node.text,
      speakerId: node.characterId,
      stageId: node.stageId || ungroupedId,
      textVariants: node.textVariants?.map((v) => ({
        afterAnswerId: v.afterReactionId,
        text: v.text,
      })),
      answers: node.reactions.map((reaction) => ({
        id: reaction.id,
        text: reaction.label,
        penalty: reaction.legacy?.penalty ?? 0,
        feedback: reaction.legacy?.feedback ?? '',
        next: reaction.nextNodeId
          ? { type: 'node', nodeId: reaction.nextNodeId }
          : { type: 'ending', endingId: reaction.endingId ?? '' },
      })),
    })),
    endings: def.endings.map((e) => ({ ...e, nextStep: e.nextStep ?? '' })),
    settings: {
      allowRestart: def.settings.allowRestart,
      collectFeedback: def.settings.collectFeedback,
      failure: def.settings.legacyFailure ?? { rule: 'none' },
      navigation: 'graph',
      assessmentNote: def.settings.assessmentNote,
    },
  };
}
