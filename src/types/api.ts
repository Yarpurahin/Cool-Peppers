import type {
  Feedback,
  ScenarioAttempt,
  ScenarioDefinition,
} from '../features/negotiation/model/types.ts';
import type { ScenarioPreview } from './scenario.ts';

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
  avatar: string | null;
  createdAt: string;
}
export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  scenarioCount: number;
}
export interface ScenarioDocument {
  preview: ScenarioPreview;
  definition: ScenarioDefinition | null;
}
export interface ScenarioDraft extends ScenarioDocument {
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
}
export interface AdminScenarioSummary {
  id: string;
  title: string;
  revision: number;
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
  archivedAt: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface AttemptDetail {
  attempt: ScenarioAttempt;
  definition: ScenarioDefinition;
  feedback?: Feedback;
  isCurrent: boolean;
  abandonedAt: string | null;
}
export interface HistoryRow {
  id: string;
  scenarioId: string;
  scenarioVersion: number;
  title: string;
  status: 'in-progress' | 'completed';
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  penalties: number;
  answers: number;
  outcome: string | null;
}
