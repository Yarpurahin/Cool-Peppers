import { z } from 'zod';
import type { MakerDefinition } from './types.ts';

const text = (max = 10000) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes('\u0000'), 'Недопустимый символ');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const reference = z.union([id, z.literal('')]);

export const editorStateSchema = z
  .object({
    positions: z.record(
      id,
      z
        .object({
          x: z.number().finite().min(-1000000).max(1000000),
          y: z.number().finite().min(-1000000).max(1000000),
        })
        .strict(),
    ),
    viewport: z
      .object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(0.05).max(4) })
      .strict()
      .optional(),
  })
  .strict();

/** Current canonical Arena graph. Compatibility formats are parsed elsewhere. */
export const makerDefinitionSchema: z.ZodType<MakerDefinition> = z
  .object({
    schemaVersion: z.literal(2),
    metadata: z
      .object({
        id,
        version: z.number().int().positive(),
        title: text(200),
        description: text(),
        category: text(100),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        duration: text(100),
        skill: text(200),
        context: text(),
        goal: text(),
        playerRole: text(200),
        tip: text(),
      })
      .strict(),
    startNodeId: reference,
    characters: z
      .array(
        z
          .object({ id, name: text(100), initials: text(8), role: text(200), description: text() })
          .strict(),
      )
      .max(100),
    stages: z.array(z.object({ id, title: text(200) }).strict()).max(100),
    nodes: z
      .array(
        z
          .object({
            id,
            title: text(200),
            characterId: reference,
            stageId: reference.optional(),
            text: text(),
            textVariants: z
              .array(z.object({ afterReactionId: id, text: text() }).strict())
              .max(1000)
              .optional(),
            reactions: z
              .array(
                z
                  .object({
                    id,
                    intent: text(100),
                    label: text(),
                    examples: z.array(text()).max(100),
                    nextNodeId: reference.optional(),
                    endingId: reference.optional(),
                    evaluation: z
                      .object({
                        grade: z.enum(['strong', 'acceptable', 'weak', 'critical']),
                        penalty: z.number().int().min(0).max(10000),
                        feedback: text(),
                      })
                      .strict(),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(500),
    endings: z
      .array(
        z
          .object({
            id,
            title: text(200),
            description: text(),
            type: z.enum(['success', 'neutral', 'failure']),
            nextStep: text().optional(),
          })
          .strict(),
      )
      .max(100),
    settings: z
      .object({
        allowRestart: z.boolean(),
        collectFeedback: z.boolean(),
        feedbackMode: z.enum(['immediate', 'summary', 'hidden']),
        assessmentNote: text().optional(),
        failureRule: z
          .object({ rule: z.literal('half-all-questions'), endingId: id })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
