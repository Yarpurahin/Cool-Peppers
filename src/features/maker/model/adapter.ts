import type { ScenarioPreview } from '../../../types/scenario.ts';
import type { AuthoringDraft, MakerDefinition, MakerDraft } from './types.ts';

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
    settings: { allowRestart: true, collectFeedback: true, feedbackMode: 'summary' },
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

export function previewFromDefinition(
  definition: MakerDefinition,
  base?: Partial<ScenarioPreview>,
): ScenarioPreview {
  const metadata = definition.metadata;
  const start = definition.nodes.find((node) => node.id === definition.startNodeId);
  const character = definition.characters.find((item) => item.id === start?.characterId);
  const previousPerson = base?.person;
  const art = base?.art ?? 'conversation';
  return {
    id: metadata.id,
    title: metadata.title,
    category: metadata.category || 'Другое',
    level:
      metadata.difficulty === 'easy'
        ? 'Начальный'
        : metadata.difficulty === 'hard'
          ? 'Продвинутый'
          : 'Средний',
    duration: metadata.duration || 'Без ограничения',
    skill: metadata.skill || 'Ведение диалога',
    description: metadata.description,
    context: metadata.context || metadata.description,
    goal: metadata.goal || 'Пройдите разговор до финала.',
    tip: metadata.tip || 'Выбирайте реакцию, которая отражает ваш подход.',
    role: metadata.playerRole || 'Участник',
    art,
    ...(base?.coverImage ? { coverImage: structuredClone(base.coverImage) } : {}),
    person: {
      name: character?.name || previousPerson?.name || 'Собеседник',
      initials:
        character?.initials ||
        previousPerson?.initials ||
        character?.name.slice(0, 1) ||
        'С',
      role: character?.role || previousPerson?.role || 'Собеседник',
      character:
        character?.description || previousPerson?.character || 'Участник переговоров',
      quote: start?.text || previousPerson?.quote || 'Начало разговора',
    },
  };
}

export function toMakerDraft(draft: AuthoringDraft): MakerDraft {
  return {
    ...draft,
    preview: structuredClone(draft.preview),
    definition: structuredClone(draft.definition),
    editor: structuredClone(draft.editor ?? { positions: {} }),
  };
}
