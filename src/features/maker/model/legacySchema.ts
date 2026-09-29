import { z } from 'zod';
import { analyzePenalty } from './penaltyAnalysis.ts';
import type { MakerDefinition, Penalty } from './types.ts';

const text = (max = 10000) =>
  z.string().max(max).refine((s) => !s.includes('\u0000'), 'Недопустимый символ');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const reference = z.union([id, z.literal('')]);

const evaluation = z
  .object({
    grade: z.enum(['strong', 'acceptable', 'weak', 'critical']),
    penalty: z.number().int().min(0).max(10000),
    feedback: text(),
  })
  .strict();

function clampPenalty(value: number): Penalty {
  if (value >= 2) return 2;
  if (value === 1) return 1;
  return 0;
}

function enableRecommendedPenalty(definition: MakerDefinition, endingId?: string) {
  if (!endingId) return;
  definition.settings.penalty.failureEndingId = endingId;
  const analysis = analyzePenalty(definition);
  definition.settings.penalty.threshold = analysis.recommendations?.recommended ?? 1;
  definition.settings.penalty.enabled = true;
}

/**
 * Compatibility parser for canonical v2 and transitional v3 scenario files.
 * New code always emits schemaVersion=3 with reaction.penalty/feedback and settings.penalty.
 */
export const legacyMakerDefinitionSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(3)]),
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
      .array(z.object({ id, name: text(100), initials: text(8), role: text(200), description: text() }).strict())
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
            textVariants: z.array(z.object({ afterReactionId: id, text: text() }).strict()).max(1000).optional(),
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
                    evaluation: evaluation.optional(),
                    penalty: z.number().int().min(0).max(10000).optional(),
                    feedback: text().optional(),
                    legacy: z.object({ penalty: z.number().int().min(0).max(10000), feedback: text() }).strict().optional(),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(500),
    endings: z
      .array(z.object({ id, title: text(200), description: text(), type: z.enum(['success', 'neutral', 'failure']), nextStep: text().optional() }).strict())
      .max(100),
    settings: z
      .object({
        allowRestart: z.boolean(),
        collectFeedback: z.boolean(),
        feedbackMode: z.enum(['immediate', 'summary', 'hidden']).optional(),
        assessmentNote: text().optional(),
        failureRule: z.object({ rule: z.literal('half-all-questions'), endingId: id }).strict().optional(),
        legacyFailure: z.object({ rule: z.literal('half-all-questions'), endingId: id }).strict().optional(),
        penaltyRule: z.object({ mode: z.string().optional(), endingId: id }).strict().optional(),
        penalty: z
          .object({ enabled: z.boolean(), threshold: z.number().int().min(1).max(10000), failureEndingId: id.optional() })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .transform((value): MakerDefinition => {
    const definition: MakerDefinition = {
      schemaVersion: 3,
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
          const sourcePenalty = reaction.penalty ?? reaction.evaluation?.penalty ?? reaction.legacy?.penalty ?? 0;
          const feedback = reaction.feedback ?? reaction.evaluation?.feedback ?? reaction.legacy?.feedback ?? '';
          return {
            id: reaction.id,
            intent: reaction.intent,
            label: reaction.label,
            examples: reaction.examples,
            ...(reaction.nextNodeId !== undefined ? { nextNodeId: reaction.nextNodeId } : {}),
            ...(reaction.endingId !== undefined ? { endingId: reaction.endingId } : {}),
            penalty: clampPenalty(sourcePenalty),
            feedback,
          };
        }),
      })),
      endings: value.endings,
      settings: {
        allowRestart: value.settings.allowRestart,
        collectFeedback: value.settings.collectFeedback,
        feedbackMode: value.settings.feedbackMode ?? 'summary',
        penalty: value.settings.penalty ?? { enabled: false, threshold: 1 },
      },
    };
    const legacyEnding =
      value.settings.penaltyRule?.endingId ??
      value.settings.failureRule?.endingId ??
      value.settings.legacyFailure?.endingId;
    if (!value.settings.penalty && legacyEnding) enableRecommendedPenalty(definition, legacyEnding);
    return definition;
  });
