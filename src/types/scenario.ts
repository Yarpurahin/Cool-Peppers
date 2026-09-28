export type ScenarioArt = 'calendar' | 'conversation' | 'agreement';

/** Catalogue projection. Executable dialogue exists only in MakerDefinition. */
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
  coverImage?: { src: string; alt: string };
  person: { name: string; initials: string; role: string; character: string; quote: string };
}
