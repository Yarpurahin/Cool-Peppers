import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

interface Row {
  id: string;
  title: string;
  revision: number;
  publishedVersion: number | null;
  archivedAt: string | null;
}
export function EditorListPage() {
  const { scenarios, refreshCatalog } = useCatalog();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('terms');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setRows(await api<Row[]>('/editor'));
  };
  useEffect(() => {
    void load()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="container page editor-list-page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Редактор сценариев</p>
          <h1>Мои сценарии</h1>
          <p>Сохраняйте черновики и публикуйте новые версии.</p>
        </div>
      </div>
      <section className="panel description-editor">
        <div className="two-fields">
          <label className="field">
            Основа нового сценария
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy || !sourceId}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await api<{ id: string }>('/editor', {
                  method: 'POST',
                  body: { sourceId },
                });
                navigate(`/editor/${result.id}`);
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="plus" />
            Создать копию
          </Button>
        </div>
      </section>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Загружаем черновики…</p>}
      {!loading && !rows.length && (
        <p>Ваших сценариев пока нет. Выберите основу и создайте свою копию.</p>
      )}
      <section className="panel editor-list">
        {rows.map((row) => (
          <div className="editor-list-row" key={row.id}>
            <div className="editor-list-title">
              <Icon name="book" />
              <div>
                <h2>{row.title}</h2>
                <p>Редакция черновика: {row.revision}</p>
              </div>
            </div>
            <span className="badge">
              {row.archivedAt
                ? 'Архив'
                : row.publishedVersion
                  ? `Опубликован · v${row.publishedVersion}`
                  : 'Черновик'}
            </span>
            <ButtonLink to={`/editor/${row.id}`} variant="outline">
              Открыть
            </ButtonLink>
            {row.publishedVersion && !row.archivedAt && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api(`/editor/${row.id}/archive`, { method: 'POST' });
                    await load();
                    await refreshCatalog();
                  } catch (cause) {
                    setError(errorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                В архив
              </Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
