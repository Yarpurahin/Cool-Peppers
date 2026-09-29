import { RequestFailure } from '../components/ui/RequestFailure.tsx';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, actionErrorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import type { AdminScenarioSummary } from '../types/api.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Select } from '../components/ui/Select.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { statusOf, statusLabel, statusClass } from '../features/maker/model/publication.ts';

type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function EditorListPage() {
  const { catalogStatus } = useCatalog();
  if (catalogStatus === 'loading')
    return (
      <div className="container page" role="status">
        Загружаем сценарии…
      </div>
    );
  return <EditorListContent />;
}
function EditorListContent() {
  const { scenarios, refreshCatalog, user } = useCatalog();
  const navigate = useNavigate();
  const location = useLocation();
  const adminMode = location.pathname.startsWith('/admin');
  const routeBase = adminMode ? '/admin/scenarios' : '/editor';
  const [rows, setRows] = useState<AdminScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const creationKey = `arena:scenario-create:${user!.id}`;
  const [creation, setCreation] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(creationKey) ?? 'null');
      if (typeof saved?.sourceId === 'string' && typeof saved?.title === 'string')
        return saved as { sourceId: string; title: string };
    } catch {
      /* The form still works if browser storage is unavailable. */
    }
    return {
      sourceId: scenarios.find((s) => s.id === 'terms')?.id ?? scenarios[0]?.id ?? '',
      title: 'Новый сценарий',
    };
  });
  const sourceId = scenarios.some((s) => s.id === creation.sourceId) ? creation.sourceId : '';
  const newTitle = creation.title;
  const updateCreation = (value: typeof creation) => {
    setCreation(value);
    try {
      sessionStorage.setItem(creationKey, JSON.stringify(value));
    } catch {
      /* Optional form recovery. */
    }
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const load = async () => {
    setRows(await api<AdminScenarioSummary[]>('/editor'));
  };

  useEffect(() => {
    void load()
      .catch(setLoadError)
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

  if (loadError && !rows.length) return <RequestFailure error={loadError} />;
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

      <section className="panel admin-create-panel" aria-labelledby="create-scenario-title">
        <div className="admin-create-copy">
          <span className="icon-tile">
            <Icon name="edit" />
          </span>
          <div>
            <h2 id="create-scenario-title">Новый сценарий</h2>
            <p>Начните с пустого полотна или возьмите готовый сценарий за основу.</p>
          </div>
        </div>
        <div className={`admin-create-controls ${!sourceId ? 'admin-create-controls--blank' : ''}`}>
          <label className="field">
            Основа сценария
            <Select
              value={sourceId}
              onValueChange={(value) => updateCreation({ ...creation, sourceId: value })}
            >
              <option value="">Пустой сценарий</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.title}
                </option>
              ))}
            </Select>
          </label>
          {!sourceId && (
            <label className="field">
              Название сценария
              <input
                value={newTitle}
                maxLength={200}
                onChange={(event) => updateCreation({ ...creation, title: event.target.value })}
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
                setError(actionErrorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <span>{sourceId ? 'Создать' : 'Создать сценарий'}</span>
            <Icon name="arrow" />
          </Button>
        </div>
      </section>

      <p className="sr-only" role="status">
        {notice}
      </p>
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
                        setError(actionErrorMessage(cause));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    В архив
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="button--danger"
                  disabled={busy}
                  aria-label={`Удалить сценарий «${row.title}»`}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Удалить сценарий «${row.title}»? Он исчезнет из каталога и списка сценариев. История прохождений сохранится.`,
                      )
                    )
                      return;
                    setBusy(true);
                    setError('');
                    try {
                      await api(`/editor/${row.id}`, { method: 'DELETE' });
                      setRows((value) => value.filter((item) => item.id !== row.id));
                      setNotice(`Сценарий «${row.title}» удалён.`);
                      try {
                        sessionStorage.removeItem(`arena:maker:${user!.id}:${row.id}`);
                      } catch {
                        /* Optional cache. */
                      }
                      await refreshCatalog();
                    } catch (cause) {
                      setError(actionErrorMessage(cause));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Icon name="trash" size={16} />
                  Удалить
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
