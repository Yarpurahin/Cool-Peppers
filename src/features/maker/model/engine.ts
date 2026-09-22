import { answerQuestion, compileScenario, startAttempt } from '../../negotiation/model/engine.ts';
import type { CompiledScenario } from '../../negotiation/model/engine.ts';
import type { ScenarioAttempt } from '../../negotiation/model/types.ts';
import type { MakerDefinition } from './types.ts';

export interface MakerEngine {
  definition: MakerDefinition;
  runtime: CompiledScenario;
}
export function compileMaker(definition: MakerDefinition): MakerEngine {
  const snapshot = structuredClone(definition);
  return { definition: snapshot, runtime: compileScenario(snapshot) };
}
export function startMaker(engine: MakerEngine, id: string, now: string) {
  return startAttempt(engine.runtime, id, now);
}
/** Buttons and a future classifier both submit stable intent scoped to the current node. */
export function submitIntent(
  engine: MakerEngine,
  attempt: ScenarioAttempt,
  expectedNodeId: string,
  intent: string,
  now: string,
) {
  const matches =
    engine.definition.nodes
      .find((n) => n.id === expectedNodeId)
      ?.reactions.filter((r) => r.intent === intent) ?? [];
  if (matches.length !== 1)
    throw new Error('Не удалось однозначно определить реакцию. Выберите другой ответ.');
  return answerQuestion(engine.runtime, attempt, expectedNodeId, matches[0].id, now);
}
