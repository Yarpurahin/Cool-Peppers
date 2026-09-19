import type { ScenarioPreview } from '../../../types/scenario.ts';
import { employmentScenario } from './employment.ts';

const { metadata, characters, nodes, endings } = employmentScenario;
const first = nodes[0];
const person = characters[0];
/** A projection for existing cards and the demo editor, never a second graph. */
export const employmentPreview: ScenarioPreview = {
  id: metadata.id,
  title: metadata.title,
  category: metadata.category,
  level: 'Средний',
  duration: metadata.duration,
  skill: metadata.skill,
  description: metadata.description,
  context: metadata.context,
  goal: metadata.goal,
  tip: metadata.tip,
  role: metadata.playerRole,
  art: 'agreement',
  person: {
    name: person.name,
    initials: person.initials,
    role: person.role,
    character: person.description,
    quote: first.text,
  },
  dialogue: nodes.map((node) => ({
    title: node.title,
    speech: node.text,
    answers: node.answers.map((answer) => {
      const target = answer.next;
      return {
        text: answer.text,
        next: target.type === 'node' ? nodes.findIndex((item) => item.id === target.nodeId) : -1,
      };
    }),
  })),
  example: { score: 0, outcome: endings[1].title, nextStep: endings[1].nextStep, observations: [] },
};
