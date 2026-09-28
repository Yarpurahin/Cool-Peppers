/** Presentation contracts: no graph, persistence or scoring dependencies. */
export interface PlayViewModel {
  scenarioId: string;
  title: string;
  goal: string;
  role: string;
  tip: string;
  character: { name: string; initials: string; role: string };
  question: { id: string; title: string; text: string };
  answers: readonly { id: string; text: string }[];
  step: number;
  stages: readonly { id: string; title: string; state: 'past' | 'current' | 'future' }[];
  history: readonly { id: string; question: string; answer: string }[];
  evaluation?: {
    grade: 'strong' | 'acceptable' | 'weak' | 'critical';
    title: string;
    text: string;
    penalty: number;
  };
}

export interface ResultViewModel {
  scenarioId: string;
  title: string;
  outcome: string;
  outcomeType: 'success' | 'neutral' | 'failure';
  subtitle: string;
  nextStep: string;
  metric: { value: number; label: string; percent: number };
  note?: string;
  reviews: readonly {
    id: string;
    title: string;
    text: string;
    quote: string;
    question?: string;
    penalty: number;
    grade?: 'strong' | 'acceptable' | 'weak' | 'critical';
  }[];
}

export interface FeedbackInput {
  helpful: boolean;
  comment: string;
}
