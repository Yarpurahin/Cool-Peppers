import type { Character, ScenarioMetadata } from '../../negotiation/model/types.ts';
import type { ScenarioPreview } from '../../../types/scenario.ts';

export type Penalty = 0 | 1 | 2;
export type FeedbackMode = 'immediate' | 'summary' | 'hidden';

export interface UserReaction {
  id: string;
  intent: string;
  label: string;
  examples: string[];
  nextNodeId?: string;
  endingId?: string;
  penalty: Penalty;
  feedback: string;
}

export interface DialogueNode {
  id: string;
  title: string;
  characterId: string;
  stageId?: string;
  text: string;
  reactions: UserReaction[];
  textVariants?: { afterReactionId: string; text: string }[];
}

export interface ScenarioEnding {
  id: string;
  title: string;
  description: string;
  type: 'success' | 'neutral' | 'failure';
  nextStep?: string;
}

export interface PenaltySettings {
  enabled: boolean;
  threshold: number;
  failureEndingId?: string;
}

export interface MakerDefinition {
  schemaVersion: 3;
  metadata: ScenarioMetadata;
  startNodeId: string;
  characters: Character[];
  stages: { id: string; title: string }[];
  nodes: DialogueNode[];
  endings: ScenarioEnding[];
  settings: {
    allowRestart: boolean;
    collectFeedback: boolean;
    feedbackMode: FeedbackMode;
    penalty: PenaltySettings;
  };
}

export interface ScenarioEditorState {
  positions: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

/** The stored document has exactly one authoritative graph, plus editor-only data. */
export interface AuthoringDocument {
  preview: ScenarioPreview;
  definition: MakerDefinition;
  editor?: ScenarioEditorState;
}
export interface AuthoringDraft extends AuthoringDocument {
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
  archivedAt?: string | null;
}
export interface MakerDocument {
  preview: ScenarioPreview;
  definition: MakerDefinition;
  editor: ScenarioEditorState;
}
export interface MakerDraft extends MakerDocument {
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
  archivedAt?: string | null;
}

export interface GraphIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  reactionId?: string;
}
