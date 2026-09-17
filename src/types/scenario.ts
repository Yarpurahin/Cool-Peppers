export type ScenarioArt = 'calendar' | 'conversation' | 'agreement';

export interface DialogueNode {
  title: string;
  speech: string;
  answers: { text: string; next: number }[];
}

export interface Scenario {
  id: string;
  title: string;
  category: string;
  level: 'Начальный' | 'Средний';
  duration: string;
  skill: string;
  description: string;
  context: string;
  goal: string;
  tip: string;
  role: string;
  art: ScenarioArt;
  person: { name: string; initials: string; role: string; character: string; quote: string };
  dialogue: DialogueNode[];
  example: {
    score: number;
    outcome: string;
    nextStep: string;
    observations: { title: string; text: string; quote: string }[];
  };
}
