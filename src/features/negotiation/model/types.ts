// Semantic aliases, not branded IDs. Stable strings are suitable for JSON/API data.
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

export type Transition = { type: 'node'; nodeId: NodeId } | { type: 'ending'; endingId: EndingId };

export interface AnswerOption {
  id: AnswerId;
  text: string;
  penalty: number;
  feedback: string;
  next: Transition;
}

export interface DialogueNode {
  id: NodeId;
  stageId: string;
  title: string;
  speakerId: CharacterId;
  text: string;
  /** Context changes wording, but does not add another question to the graph. */
  textVariants?: readonly { afterAnswerId: AnswerId; text: string }[];
  answers: readonly AnswerOption[];
}

export interface Ending {
  id: EndingId;
  type: 'success' | 'neutral' | 'failure';
  title: string;
  description: string;
  nextStep: string;
}

export interface ScenarioDefinition {
  metadata: ScenarioMetadata;
  settings: {
    allowRestart: boolean;
    collectFeedback: boolean;
    failure: { rule: 'half-all-questions'; endingId: EndingId } | { rule: 'none' };
    navigation?: 'graph';
    assessmentNote?: string;
  };
  startNodeId: NodeId;
  characters: readonly Character[];
  stages: readonly { id: string; title: string }[];
  nodes: readonly DialogueNode[];
  endings: readonly Ending[];
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
