import { previewFromDefinition } from '../../maker/model/adapter.ts';
import { deadlineScenario } from './deadline.ts';

export const deadlinePreview = previewFromDefinition(deadlineScenario, { art: 'calendar' });
