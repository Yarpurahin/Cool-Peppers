import type { ScenarioPreview } from '../types/scenario.ts';
import { employmentPreview } from '../features/negotiation/data/employmentPreview.ts';

export const scenarios: ScenarioPreview[] = [employmentPreview];
export const findScenario = (id: string | undefined) =>
  scenarios.find((scenario) => scenario.id === id);
