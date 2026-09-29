import type { ScenarioPreview } from '../types/scenario.ts';
import { employmentPreview } from '../features/negotiation/data/employmentPreview.ts';
import { deadlinePreview } from '../features/negotiation/data/deadlinePreview.ts';

export const scenarios: ScenarioPreview[] = [employmentPreview, deadlinePreview];
export const findScenario = (id: string | undefined) => scenarios.find((scenario) => scenario.id === id);
