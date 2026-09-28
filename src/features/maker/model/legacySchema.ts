/** Parser for Arena schemaVersion=2 files created before evaluation became canonical. */
import { z } from 'zod';
import type { MakerDefinition, ReactionGrade } from './types.ts';

const text = (max = 10000) =>
  z
    .string()
    .max(max)
    .refine((s) => !s.includes('\u0000'), 'Недопустимый символ');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const reference = z.union([id, z.literal('')]);

function gradeFromPenalty(penalty: number): ReactionGrade {
  if (penalty >= 2) return 'critical';
  if (penalty === 1) return 'weak';
  return 'acceptable';
}

const evaluation = z
  .object({
    grade: z.enum(['strong', 'acceptable', 'weak', 'critical']),
    penalty: z.number().int().min(0).max(10000),
    feedback: text(),
  })
  .strict();
const oldEvaluation = z
  .object({ penalty: z.number().int().min(0).max(10000), feedback: text() })
  .strict();

export const legacyMakerDefinitionSchema = z
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
                    examples: z.array(text()).max(100).default([]),
                    nextNodeId: reference.optional(),
                    endingId: reference.optional(),
                    evaluation: evaluation.optional(),
                    legacy: oldEvaluation.optional(),
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
        feedbackMode: z.enum(['immediate', 'summary', 'hidden']).optional(),
        assessmentNote: text().optional(),
        failureRule: z
          .object({ rule: z.literal('half-all-questions'), endingId: id })
          .strict()
          .optional(),
        legacyFailure: z
          .object({ rule: z.literal('half-all-questions'), endingId: id })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .transform((value): MakerDefinition => {
    const failureRule = value.settings.failureRule ?? value.settings.legacyFailure;
    return {
      schemaVersion: 2,
      metadata: value.metadata,
      startNodeId: value.startNodeId,
      characters: value.characters,
      stages: value.stages,
      nodes: value.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        characterId: node.characterId,
        ...(node.stageId !== undefined ? { stageId: node.stageId } : {}),
        text: node.text,
        ...(node.textVariants ? { textVariants: node.textVariants } : {}),
        reactions: node.reactions.map((reaction) => {
          const normalizedEvaluation = reaction.evaluation ?? {
            grade: gradeFromPenalty(reaction.legacy?.penalty ?? 0),
            penalty: reaction.legacy?.penalty ?? 0,
            feedback: reaction.legacy?.feedback ?? '',
          };
          return {
            id: reaction.id,
            intent: reaction.intent,
            label: reaction.label,
            examples: reaction.examples,
            ...(reaction.nextNodeId !== undefined ? { nextNodeId: reaction.nextNodeId } : {}),
            ...(reaction.endingId !== undefined ? { endingId: reaction.endingId } : {}),
            evaluation: normalizedEvaluation,
          };
        }),
      })),
      endings: value.endings,
      settings: {
        allowRestart: value.settings.allowRestart,
        collectFeedback: value.settings.collectFeedback,
        feedbackMode: value.settings.feedbackMode ?? 'summary',
        ...(failureRule ? { failureRule } : {}),
        ...(value.settings.assessmentNote !== undefined
          ? { assessmentNote: value.settings.assessmentNote }
          : {}),
      },
    };
  });
