import { z } from 'zod';
import type { ScenarioPreview } from '../../../types/scenario.ts';
import { documentSchema } from '../../../types/validation.ts';
import { toMakerDraft } from './adapter.ts';
import { layoutGraph } from './commands.ts';
import { editorStateSchema, makerDefinitionSchema } from './schema.ts';
import { legacyMakerDefinitionSchema } from './legacySchema.ts';
import type { AuthoringDraft, MakerDocument, MakerDraft } from './types.ts';

const coverImageSchema = z
  .object({
    src: z
      .string()
      .max(710000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
    alt: z.string().max(250),
  })
  .strict();

export const scenarioFileSchema = z
  .object({
    format: z.literal('arena-scenario'),
    formatVersion: z.literal(1),
    definition: makerDefinitionSchema,
    editor: editorStateSchema.optional(),
    coverImage: coverImageSchema.nullable().optional(),
  })
  .strict();

export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

export interface ParsedScenarioFile {
  document: MakerDocument;
  source: 'arena-scenario' | 'exported-draft' | 'definition';
}

function nonEmpty(value: string, fallback: string) {
  return value.trim() ? value : fallback;
}

function syncPreview(
  base: ScenarioPreview,
  definition: MakerDocument['definition'],
  coverImage: ScenarioFile['coverImage'] | undefined,
): ScenarioPreview {
  const metadata = definition.metadata;
  const start = definition.nodes.find((node) => node.id === definition.startNodeId);
  const character = definition.characters.find((item) => item.id === start?.characterId);
  const preview = structuredClone(base);

  preview.id = metadata.id;
  preview.title = nonEmpty(metadata.title, preview.title || 'Без названия');
  preview.category = nonEmpty(metadata.category, preview.category || 'Другое');
  preview.level =
    metadata.difficulty === 'easy'
      ? 'Начальный'
      : metadata.difficulty === 'hard'
        ? 'Продвинутый'
        : 'Средний';
  preview.duration = nonEmpty(metadata.duration, preview.duration || 'Без ограничения');
  preview.skill = nonEmpty(metadata.skill, preview.skill || 'Ведение диалога');
  preview.description = nonEmpty(metadata.description, preview.description || 'Описание сценария');
  preview.context = nonEmpty(metadata.context, preview.context || preview.description);
  preview.goal = nonEmpty(metadata.goal, preview.goal || 'Пройдите разговор до финала.');
  preview.tip = nonEmpty(
    metadata.tip,
    preview.tip || 'Выбирайте реакцию, которая отражает ваш подход.',
  );
  preview.role = nonEmpty(metadata.playerRole, preview.role || 'Участник');

  if (character) {
    preview.person = {
      name: nonEmpty(character.name, preview.person.name || 'Собеседник'),
      initials: nonEmpty(character.initials, preview.person.initials || character.name.slice(0, 1)),
      role: nonEmpty(character.role, preview.person.role || 'Собеседник'),
      character: nonEmpty(
        character.description,
        preview.person.character || 'Участник переговоров',
      ),
      quote: nonEmpty(start?.text ?? '', preview.person.quote || 'Начало разговора'),
    };
  }

  if (coverImage === null) delete preview.coverImage;
  else if (coverImage) preview.coverImage = structuredClone(coverImage);

  return preview;
}

function normalizedEditor(
  definition: MakerDocument['definition'],
  editor: MakerDocument['editor'],
): MakerDocument['editor'] {
  const blockIds = new Set([
    ...definition.nodes.map((node) => node.id),
    ...definition.endings.map((ending) => ending.id),
  ]);
  const provided = Object.fromEntries(
    Object.entries(editor.positions).filter(([id]) => blockIds.has(id)),
  );
  return {
    ...editor,
    positions: { ...layoutGraph(definition), ...provided },
  };
}

function withCurrentIdentity(document: MakerDocument, current: MakerDraft): MakerDocument {
  const next = structuredClone(document);
  next.definition.metadata.id = current.definition.metadata.id;
  next.definition.metadata.version = current.definition.metadata.version;
  next.preview = syncPreview(
    { ...next.preview, id: current.preview.id },
    next.definition,
    next.preview.coverImage,
  );
  next.preview.id = current.preview.id;
  next.editor = normalizedEditor(next.definition, next.editor);
  return next;
}

function fromPortable(file: ScenarioFile, current: MakerDraft): MakerDocument {
  const definition = structuredClone(file.definition);
  definition.metadata.id = current.definition.metadata.id;
  definition.metadata.version = current.definition.metadata.version;
  const preview = syncPreview(current.preview, definition, file.coverImage);
  return {
    preview,
    definition,
    editor: normalizedEditor(definition, file.editor ?? { positions: {} }),
  };
}

function zodMessage(error: z.ZodError) {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'JSON'}: ${issue.message}`)
    .join('\n');
}

/**
 * Accepts the current portable Arena format, the previous full-draft export,
 * and a raw schemaVersion=2 definition. The database scenario identity is
 * intentionally preserved so an import cannot overwrite another scenario.
 */
export function parseScenarioFile(input: unknown, current: MakerDraft): ParsedScenarioFile {
  const portable = scenarioFileSchema.safeParse(input);
  if (portable.success)
    return { document: fromPortable(portable.data, current), source: 'arena-scenario' };

  const exported = documentSchema.safeParse(input);
  if (exported.success) {
    const importedDraft: AuthoringDraft = {
      ...exported.data,
      revision: current.revision,
      publishedVersion: current.publishedVersion,
      hasUnpublishedChanges: true,
      archivedAt: current.archivedAt,
    };
    const maker = toMakerDraft(importedDraft);
    return { document: withCurrentIdentity(maker, current), source: 'exported-draft' };
  }

  const rawDefinition = makerDefinitionSchema.safeParse(input);
  const oldMakerDefinition = rawDefinition.success ? null : legacyMakerDefinitionSchema.safeParse(input);
  const parsedDefinition = rawDefinition.success
    ? rawDefinition.data
    : oldMakerDefinition?.success
      ? oldMakerDefinition.data
      : null;
  if (parsedDefinition) {
    const file: ScenarioFile = {
      format: 'arena-scenario',
      formatVersion: 1,
      definition: parsedDefinition,
    };
    return { document: fromPortable(file, current), source: 'definition' };
  }

  const object = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  const detail =
    object?.format === 'arena-scenario'
      ? zodMessage(portable.error)
      : object?.schemaVersion === 2
        ? zodMessage(rawDefinition.success ? portable.error : rawDefinition.error)
        : object && ('preview' in object || 'definition' in object)
          ? zodMessage(exported.error)
          : zodMessage(portable.error);
  throw new Error(`Файл не соответствует формату сценария Arena.\n${detail}`);
}

export function createScenarioFile(document: MakerDocument): ScenarioFile {
  return {
    format: 'arena-scenario',
    formatVersion: 1,
    definition: structuredClone(document.definition),
    editor: structuredClone(document.editor),
    coverImage: document.preview.coverImage ? structuredClone(document.preview.coverImage) : null,
  };
}
