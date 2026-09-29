import { previewFromDefinition } from '../../maker/model/adapter.ts';
import { employmentScenario } from './employment.ts';

export const employmentPreview = previewFromDefinition(employmentScenario, { art: 'agreement' });
