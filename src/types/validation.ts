import { z } from 'zod';
import { compileScenario } from '../features/negotiation/model/engine.ts';
import type { AuthoringDocument } from '../features/maker/model/types.ts';
import { makerDefinitionSchema, editorStateSchema } from '../features/maker/model/schema.ts';

const text = (max = 10000) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes('\u0000'), 'Недопустимый символ');
const required = (max = 10000) =>
  text(max).refine((s) => s.trim().length > 0, 'Поле не должно быть пустым');
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const uuidSchema = z.string().uuid();
export const profileSchema = z
  .object({
    name: required(100).transform((s) => s.trim()),
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();
const password = z.string().min(8).max(128);
export const registerSchema = profileSchema.extend({ password });
export const loginSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254), password })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: password, newPassword: password })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Новый пароль должен отличаться от текущего',
    path: ['newPassword'],
  });
const answer = z
  .object({
    id: idSchema,
    text: required(),
    penalty: z.number().int().min(0).max(10000),
    feedback: text(),
    next: z.discriminatedUnion('type', [
      z.object({ type: z.literal('node'), nodeId: idSchema }).strict(),
      z.object({ type: z.literal('ending'), endingId: idSchema }).strict(),
    ]),
  })
  .strict();
const definitionSchema = z
  .object({
    metadata: z
      .object({
        id: idSchema,
        version: z.number().int().positive(),
        title: required(200),
        description: required(),
        category: required(100),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        duration: required(100),
        skill: required(200),
        context: required(),
        goal: required(),
        playerRole: required(200),
        tip: required(),
      })
      .strict(),
    settings: z
      .object({
        allowRestart: z.boolean(),
        collectFeedback: z.boolean(),
        failure: z.union([
          z.object({ rule: z.literal('half-all-questions'), endingId: idSchema }).strict(),
          z.object({ rule: z.literal('none') }).strict(),
        ]),
        navigation: z.literal('graph').optional(),
        assessmentNote: text().optional(),
      })
      .strict(),
    startNodeId: idSchema,
    characters: z
      .array(
        z
          .object({
            id: idSchema,
            name: required(100),
            initials: required(8),
            role: required(200),
            description: required(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    stages: z
      .array(z.object({ id: idSchema, title: required(200) }).strict())
      .min(1)
      .max(100),
    nodes: z
      .array(
        z
          .object({
            id: idSchema,
            stageId: idSchema,
            title: required(200),
            speakerId: idSchema,
            text: required(),
            textVariants: z
              .array(z.object({ afterAnswerId: idSchema, text: required() }).strict())
              .max(1000)
              .optional(),
            answers: z.array(answer).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    endings: z
      .array(
        z
          .object({
            id: idSchema,
            type: z.enum(['success', 'neutral', 'failure']),
            title: required(200),
            description: required(),
            nextStep: required(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const previewSchema = z
  .object({
    id: idSchema,
    title: required(200),
    category: required(100),
    level: z.enum(['Начальный', 'Средний', 'Продвинутый']),
    duration: required(100),
    skill: required(200),
    description: required(),
    context: required(),
    goal: required(),
    tip: required(),
    role: required(200),
    art: z.enum(['calendar', 'conversation', 'agreement']),
    coverImage: z
      .object({
        src: z
          .string()
          .max(710000)
          .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
        alt: text(250),
      })
      .strict()
      .optional(),
    person: z
      .object({
        name: required(100),
        initials: required(8),
        role: required(200),
        character: required(),
        quote: required(),
      })
      .strict(),
    dialogue: z
      .array(
        z
          .object({
            title: required(200),
            speech: required(),
            answers: z
              .array(z.object({ text: required(), next: z.number().int().min(-1) }).strict())
              .min(1)
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    example: z
      .object({
        score: z.number().min(0).max(100),
        outcome: required(200),
        nextStep: required(),
        observations: z
          .array(z.object({ title: required(200), text: required(), quote: required() }).strict())
          .max(500),
      })
      .strict(),
  })
  .strict();
export const documentSchema = z
  .object({
    preview: previewSchema,
    definition: z.union([makerDefinitionSchema, definitionSchema]).nullable(),
    editor: editorStateSchema.optional(),
  })
  .strict();
export const saveDraftSchema = documentSchema.extend({ revision: z.number().int().positive() });
export const publishSchema = z.object({ revision: z.number().int().positive() }).strict();
export const answerSchema = z
  .object({
    nodeId: idSchema,
    answerId: idSchema,
    expectedAnswers: z.number().int().min(0).max(500),
  })
  .strict();
export const startSchema = z
  .object({ restart: z.boolean().default(false), expectedAttemptId: uuidSchema.optional() })
  .strict();
export const feedbackSchema = z
  .object({ helpful: z.boolean(), comment: text(2000).transform((s) => s.trim()) })
  .strict();

/** Definition is authoritative; catalogue data for executable scenarios is a projection. */
export function normalizeDocument(input: AuthoringDocument): AuthoringDocument {
  const { definition, preview } = input;
  if (!definition) {
    for (const node of preview.dialogue)
      for (const option of node.answers)
        if (option.next >= preview.dialogue.length)
          throw new Error('Неизвестный переход в демонстрационном сценарии');
    return input;
  }
  const def = compileScenario(definition).definition;
  const first = def.nodes.find((n) => n.id === def.startNodeId)!;
  const person = def.characters.find((c) => c.id === first.speakerId)!;
  const m = def.metadata;
  return {
    ...input,
    preview: {
      ...preview,
      id: m.id,
      title: m.title,
      category: m.category || 'Другое',
      level:
        m.difficulty === 'easy' ? 'Начальный' : m.difficulty === 'hard' ? 'Продвинутый' : 'Средний',
      duration: m.duration || 'Без ограничения',
      skill: m.skill || 'Ведение диалога',
      description: m.description,
      context: m.context || m.description,
      goal: m.goal || 'Пройдите разговор до финала.',
      tip: m.tip || 'Выбирайте реакцию, которая отражает ваш подход.',
      role: m.playerRole || 'Участник',
      person: {
        name: person.name,
        initials: person.initials || person.name.slice(0, 1),
        role: person.role || 'Собеседник',
        character: person.description || 'Участник переговоров',
        quote: first.text,
      },
      dialogue: def.nodes.map((node, index) => ({
        title: node.title || `Реплика ${index + 1}`,
        speech: node.text,
        answers: node.answers.map((a) => ({
          text: a.text,
          next:
            a.next.type === 'ending'
              ? -1
              : def.nodes.findIndex((n) => a.next.type === 'node' && n.id === a.next.nodeId),
        })),
      })),
    },
  };
}
