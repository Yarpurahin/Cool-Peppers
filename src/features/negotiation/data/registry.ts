import { compileScenario } from '../model/engine.ts';
import { employmentScenario } from './employment.ts';

// Register another validated definition here; UI and engine need no scenario-specific changes.
export const negotiationScenarios = [compileScenario(employmentScenario)];
export const findNegotiation = (id: string | undefined) =>
  negotiationScenarios.find((item) => item.definition.metadata.id === id);
