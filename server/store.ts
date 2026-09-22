import type { Pool } from 'pg';
import type { ScenarioAttempt } from '../src/features/negotiation/model/types.ts';
import type { AttemptDetail } from '../src/types/api.ts';
import type { AuthoringDocument } from '../src/features/maker/model/types.ts';
import { compileScenario } from '../src/features/negotiation/model/engine.ts';

export type Database = Pick<Pool, 'query'>;
export interface AttemptRow {
  id: string;
  user_id: string;
  scenario_id: string;
  scenario_version: number;
  status: 'in-progress' | 'completed';
  current_node_id: string | null;
  ending_id: string | null;
  penalties: number;
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  abandoned_at: Date | null;
  is_current: boolean;
}
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export async function getVersion(
  db: Database,
  id: string,
  version: number,
): Promise<AuthoringDocument> {
  const result = await db.query(
    'SELECT preview, definition FROM scenario_versions WHERE scenario_id = $1 AND version = $2',
    [id, version],
  );
  if (!result.rowCount) throw new ApiError(404, 'Версия сценария не найдена');
  return result.rows[0];
}
export async function readAttempt(db: Database, row: AttemptRow): Promise<ScenarioAttempt> {
  const answers = await db.query<{ node_id: string; answer_id: string; answered_at: Date }>(
    'SELECT node_id, answer_id, answered_at FROM attempt_answers WHERE attempt_id = $1 ORDER BY sequence',
    [row.id],
  );
  const base = {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioVersion: row.scenario_version,
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    penalties: row.penalties,
    history: answers.rows.map((a) => ({
      nodeId: a.node_id,
      answerId: a.answer_id,
      answeredAt: a.answered_at.toISOString(),
    })),
  };
  return row.status === 'completed'
    ? {
        ...base,
        status: 'completed',
        endingId: row.ending_id!,
        completedAt: row.completed_at!.toISOString(),
      }
    : { ...base, status: 'in-progress', currentNodeId: row.current_node_id! };
}
export async function detail(db: Database, row: AttemptRow): Promise<AttemptDetail> {
  const document = await getVersion(db, row.scenario_id, row.scenario_version);
  if (!document.definition)
    throw new ApiError(409, 'Демонстрационный сценарий не содержит попыток');
  const feedback = await db.query(
    'SELECT helpful, comment, created_at FROM feedback WHERE attempt_id = $1',
    [row.id],
  );
  return {
    attempt: await readAttempt(db, row),
    definition: compileScenario(document.definition).definition,
    isCurrent: row.is_current,
    abandonedAt: row.abandoned_at?.toISOString() ?? null,
    feedback: feedback.rowCount
      ? {
          attemptId: row.id,
          helpful: feedback.rows[0].helpful,
          comment: feedback.rows[0].comment,
          createdAt: feedback.rows[0].created_at.toISOString(),
        }
      : undefined,
  };
}
export async function ownedAttempt(
  db: Database,
  id: string,
  userId: string,
  lock = false,
): Promise<AttemptRow> {
  const result = await db.query<AttemptRow>(
    `SELECT * FROM attempts WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [id, userId],
  );
  if (!result.rowCount) throw new ApiError(404, 'Попытка не найдена');
  return result.rows[0];
}
