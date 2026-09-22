import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import type { AdminScenarioSummary } from '../types/api.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

function statusOf(row: AdminScenarioSummary): Exclude<StatusFilter, 'all'> {
  if (row.archivedAt) return 'archived';
  if (row.publishedVersion) return 'published';
  return 'draft';
}

function statusLabel(row: AdminScenarioSummary) {
  if (row.archivedAt) return 'Архив';
  if (row.publishedVersion) return `Опубликован · v${row.publishedVersion}`;
  return 'Черновик';
}

function statusClass(row: AdminScenarioSummary) {
  const status = statusOf(row);
  if (status === 'published') return 'badge badge--green';
  if (status === 'draft') return 'badge badge--orange';
  return 'badge badge--outline';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function EditorListPage() {
  const { scenarios, refreshCatalog } = useCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const adminMode = location.pathname.startsWith('/admin');
  const routeBase = adminMode ? '/admin/scenarios' : '/editor';
  const [rows, setRows] = useState<AdminScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceId, setSourceId] = useState('terms');
  const [newTitle, setNewTitle] = useState('Новый сценарий');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = async () => {
    setRows(await api<AdminScenarioSummary[]>('/editor'));
  };

  useEffect(() => {
    void load()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);

  const filteredRows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('ru-RU');
    return rows.filter((row) => {
      const matchesStatus = status === 'all' || statusOf(row) === status;
      const matchesQuery = !search || row.title.toLocaleLowerCase('ru-RU').includes(search);
      return matchesStatus && matchesQuery;
    });
  }, [query, rows, status]);

  return (
    <div
      className={adminMode ? 'admin-page admin-scenarios-page' : 'container page editor-list-page'}
    >
      <div className={adminMode ? 'admin-page-heading' : 'section-heading'}>
        <div>
          <p className="eyebrow">
            {adminMode && <span className="accent-dot" />}
            {adminMode ? 'Управление контентом' : 'Редактор сценариев'}
          </p>
          <h1>{adminMode ? 'Сценарии' : 'Мои сценарии'}</h1>
          <p>
            {adminMode
              ? 'Создавайте черновики, публикуйте новые версии и отправляйте сценарии в архив.'
              : 'Сохраняйте черновики и публикуйте новые версии.'}
          </p>
        </div>
      </div>

      <section className="panel admin-create-panel description-editor">
        <div className="admin-create-copy">
          <span className="icon-tile">
            <Icon name="plus" />
          </span>
          <div>
            <h2>Новый сценарий</h2>
            <p>Начните с пустого полотна или возьмите готовый сценарий за основу.</p>
          </div>
        </div>
        <div className="admin-create-controls">
          <label className="field">
            Основа сценария
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Пустой сценарий</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </select>
          </label>
          {!sourceId && (
            <label className="field">
              Название сценария
              <input
                value={newTitle}
                maxLength={200}
                onChange={(event) => setNewTitle(event.target.value)}
              />
            </label>
          )}
          <Button
            disabled={busy || (!sourceId && !newTitle.trim())}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await api<{ id: string }>('/editor', {
                  method: 'POST',
                  body: sourceId ? { sourceId } : { title: newTitle.trim() },
                });
                navigate(`${routeBase}/${result.id}`);
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="plus" />
            {sourceId ? 'Создать копию' : 'Создать и открыть maker'}
          </Button>
        </div>
      </section>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <section className="admin-scenario-tools" aria-label="Фильтры сценариев">
        <label className="admin-search-field">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск сценариев"
          />
        </label>
        <div className="admin-status-filters">
          {(
            [
              ['all', 'Все'],
              ['draft', 'Черновики'],
              ['published', 'Опубликованные'],
              ['archived', 'Архив'],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={status === value ? 'is-active' : ''}
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
            >
              {label}
              <span>
                {value === 'all'
                  ? rows.length
                  : rows.filter((row) => statusOf(row) === value).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      {loading && <p role="status">Загружаем черновики…</p>}
      {!loading && !rows.length && (
        <div className="panel admin-empty-state">
          <Icon name="book" size={28} />
          <h2>Сценариев пока нет</h2>
          <p>Выберите основу выше и создайте первый сценарий.</p>
        </div>
      )}
      {!loading && rows.length > 0 && !filteredRows.length && (
        <div className="panel admin-empty-state">
          <Icon name="search" size={28} />
          <h2>Ничего не найдено</h2>
          <p>Измените строку поиска или выбранный фильтр.</p>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <section className="panel editor-list admin-scenario-list">
          <div className="admin-scenario-list-head" aria-hidden="true">
            <span>Сценарий</span>
            <span>Вопросы</span>
            <span>Обновлён</span>
            <span>Статус</span>
            <span />
          </div>
          {filteredRows.map((row) => (
            <article className="admin-scenario-row" key={row.id}>
              <div className="editor-list-title">
                <span className="icon-tile">
                  <Icon name="book" />
                </span>
                <div>
                  <h2>{row.title}</h2>
                  <p>Редакция черновика: {row.revision}</p>
                </div>
              </div>
              <span className="question-count">{row.questionCount}</span>
              <span className="admin-scenario-date">{formatDate(row.updatedAt)}</span>
              <span className={statusClass(row)}>{statusLabel(row)}</span>
              <div className="admin-scenario-actions">
                <ButtonLink to={`${routeBase}/${row.id}`} variant="outline">
                  Открыть
                </ButtonLink>
                {row.publishedVersion && !row.archivedAt && (
                  <Button
                    disabled={busy}
                    variant="ghost"
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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
