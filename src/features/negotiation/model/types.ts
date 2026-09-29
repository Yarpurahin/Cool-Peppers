// Shared scenario metadata plus attempt state. The executable graph itself is the maker model.
export type ScenarioId = string;
export type NodeId = string;
export type AnswerId = string;
export type CharacterId = string;
export type EndingId = string;
export type AttemptId = string;

export interface Character {
  id: CharacterId;
  name: string;
  initials: string;
  role: string;
  description: string;
}

export interface ScenarioMetadata {
  id: ScenarioId;
  version: number;
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duration: string;
  skill: string;
  context: string;
  goal: string;
  playerRole: string;
  tip: string;
}

export interface AnswerHistoryItem {
  nodeId: NodeId;
  answerId: AnswerId;
  answeredAt: string;
}

interface AttemptBase {
  id: AttemptId;
  scenarioId: ScenarioId;
  scenarioVersion: number;
  startedAt: string;
  updatedAt: string;
  penalties: number;
  history: readonly AnswerHistoryItem[];
}

export type ScenarioAttempt = AttemptBase &
  (
    | { status: 'in-progress'; currentNodeId: NodeId }
    | { status: 'completed'; endingId: EndingId; completedAt: string }
  );

export interface Feedback {
  attemptId: AttemptId;
  helpful: boolean;
  comment: string;
  createdAt: string;
}
