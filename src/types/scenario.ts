// Catalogue presentation and legacy editor/demo fixtures; executable types live in features/negotiation/model/types.ts.
export type ScenarioArt = 'calendar' | 'conversation' | 'agreement';

export interface DemoDialogueNode {
  title: string;
  speech: string;
  answers: { text: string; next: number }[];
}

export interface ScenarioPreview {
  id: string;
  title: string;
  category: string;
  level: 'Начальный' | 'Средний' | 'Продвинутый';
  duration: string;
  skill: string;
  description: string;
  context: string;
  goal: string;
  tip: string;
  role: string;
  art: ScenarioArt;
  person: { name: string; initials: string; role: string; character: string; quote: string };
  dialogue: DemoDialogueNode[];
  example: {
    score: number;
    outcome: string;
    nextStep: string;
    observations: { title: string; text: string; quote: string }[];
  };
}
