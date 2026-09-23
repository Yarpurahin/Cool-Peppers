import { z } from 'zod';
import { previewSchema } from '../../../types/validation.ts';
import { editorStateSchema, makerDefinitionSchema } from './schema.ts';
import type { MakerDocument, MakerDraft } from './types.ts';

const stableJSON = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
export const fingerprint = (doc: MakerDocument) =>
  stableJSON({ preview: doc.preview, definition: doc.definition, editor: doc.editor });
export const contentFingerprint = (doc: MakerDocument) =>
  stableJSON({ preview: doc.preview, definition: doc.definition });

const recoverySchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().positive(),
    base: z.string(),
    document: z
      .object({
        preview: previewSchema,
        definition: makerDefinitionSchema,
        editor: editorStateSchema,
      })
      .strict(),
  })
  .strict();

export function serializeRecovery(draft: MakerDraft, base: string) {
  return JSON.stringify({
    version: 1,
    revision: draft.revision,
    base,
    document: { preview: draft.preview, definition: draft.definition, editor: draft.editor },
  });
}

/** Preserve the original revision on conflict so a save cannot overwrite another tab. */
export function recoverDraft(raw: string | null, server: MakerDraft) {
  if (!raw) return { draft: server, restored: false, conflict: false };
  const saved = recoverySchema.parse(JSON.parse(raw));
  if (
    saved.document.preview.id !== server.preview.id ||
    saved.document.definition.metadata.id !== server.definition.metadata.id
  )
    throw new Error('Восстановленный черновик относится к другому сценарию.');
  const local = fingerprint(saved.document);
  if (local === saved.base || local === fingerprint(server))
    return { draft: server, restored: false, conflict: false };
  return {
    draft: { ...server, ...saved.document, revision: saved.revision },
    restored: true,
    conflict: saved.revision !== server.revision,
  };
}
