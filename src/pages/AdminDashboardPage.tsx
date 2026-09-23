import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import type { AdminScenarioSummary } from '../types/api.ts';
import { ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { statusOf, statusLabel, statusClass } from '../features/maker/model/publication.ts';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function AdminDashboardPage() {
  const [rows, setRows] = useState<AdminScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api<AdminScenarioSummary[]>('/editor', { signal: controller.signal })
      .then(setRows)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const stats = useMemo(
    () => ({
      total: rows.length,
      draft: rows.filter((row) => statusOf(row) === 'draft').length,
      published: rows.filter((row) => statusOf(row) === 'published').length,
      archived: rows.filter((row) => statusOf(row) === 'archived').length,
    }),
    [rows],
  );

  return (
    <div className="admin-page admin-dashboard-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" /> Управление проектом
          </p>
          <h1>Обзор</h1>
          <p>Создавайте, публикуйте и поддерживайте учебные сценарии переговоров.</p>
        </div>
        <ButtonLink to="/admin/scenarios" className="admin-heading-action">
          <Icon name="plus" size={18} />
          Управлять сценариями
        </ButtonLink>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <section className="admin-stat-grid" aria-label="Статистика сценариев">
        <article className="admin-stat-card">
          <span className="admin-stat-icon">
            <Icon name="book" />
          </span>
          <div>
            <span>Всего сценариев</span>
            <strong>{loading ? '—' : stats.total}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--orange">
            <Icon name="edit" />
          </span>
          <div>
            <span>Черновики</span>
            <strong>{loading ? '—' : stats.draft}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--green">
            <Icon name="check" />
          </span>
          <div>
            <span>Опубликованы</span>
            <strong>{loading ? '—' : stats.published}</strong>
          </div>
        </article>
        <article className="admin-stat-card">
          <span className="admin-stat-icon admin-stat-icon--muted">
            <Icon name="flag" />
          </span>
          <div>
            <span>В архиве</span>
            <strong>{loading ? '—' : stats.archived}</strong>
          </div>
        </article>
      </section>

      <div className="admin-dashboard-grid">
        <section className="panel admin-recent-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Последние изменения</p>
              <h2>Сценарии</h2>
            </div>
            <ButtonLink to="/admin/scenarios" variant="ghost">
              Все сценарии <Icon name="arrow" size={16} />
            </ButtonLink>
          </div>

          {loading && <p role="status">Загружаем сценарии…</p>}
          {!loading && !rows.length && (
            <div className="admin-empty-state">
              <Icon name="book" size={26} />
              <h3>Сценариев пока нет</h3>
              <p>Создайте первый сценарий на основе одного из опубликованных шаблонов.</p>
              <ButtonLink to="/admin/scenarios">Создать сценарий</ButtonLink>
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div className="admin-recent-list">
              {rows.slice(0, 5).map((row) => (
                <article className="admin-recent-row" key={row.id}>
                  <span className="icon-tile">
                    <Icon name="message" size={19} />
                  </span>
                  <div className="admin-recent-main">
                    <h3>{row.title}</h3>
                    <p>
                      {row.questionCount} вопросов · редакция {row.revision} ·{' '}
                      {formatDate(row.updatedAt)}
                    </p>
                  </div>
                  <span className={statusClass(row)}>{statusLabel(row)}</span>
                  <ButtonLink to={`/admin/scenarios/${row.id}`} variant="outline">
                    Открыть
                  </ButtonLink>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="panel admin-roadmap-panel">
          <p className="eyebrow">Следующий этап</p>
          <h2>Конструктор сценариев</h2>
          <p>
            Базовая работа с черновиками уже есть. Дальше редактор будет разбит на понятные шаги
            вместо одной большой формы.
          </p>
          <div className="admin-roadmap-list">
            <div>
              <span>1</span>
              <p>
                <strong>Основное</strong>
                Название, цель и сложность
              </p>
            </div>
            <div>
              <span>2</span>
              <p>
                <strong>Персонажи и этапы</strong>
                Участники и структура переговоров
              </p>
            </div>
            <div>
              <span>3</span>
              <p>
                <strong>Диалог</strong>
                Реплики, ответы и переходы
              </p>
            </div>
            <div>
              <span>4</span>
              <p>
                <strong>Проверка и публикация</strong>
                Валидация графа перед запуском
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
