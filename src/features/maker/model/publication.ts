type Publication = {
  publishedVersion: number | null;
  hasUnpublishedChanges?: boolean;
  archivedAt?: string | null;
};

export function statusOf(row: Publication): 'archived' | 'draft' | 'published' {
  if (row.archivedAt) return 'archived';
  return row.publishedVersion && !row.hasUnpublishedChanges ? 'published' : 'draft';
}

export function statusLabel(row: Publication) {
  if (row.archivedAt) return 'Архив';
  if (!row.publishedVersion) return 'Черновик';
  if (row.hasUnpublishedChanges)
    return `Черновик v${row.publishedVersion + 1} · опубликовано v${row.publishedVersion}`;
  return `Опубликовано · v${row.publishedVersion}`;
}

export function statusClass(row: Publication) {
  return `badge badge--${{ published: 'green', draft: 'orange', archived: 'outline' }[statusOf(row)]}`;
}
