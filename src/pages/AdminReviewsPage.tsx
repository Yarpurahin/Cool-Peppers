import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Select } from '../components/ui/Select.tsx';
import { REVIEW_PAGE_SIZE, type ScenarioReviewInbox } from '../types/reviews.ts';
import '../styles/reviews.css';

const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const empty: ScenarioReviewInbox = {
  reviews: [],
  scenarios: [],
  hasMore: false,
  total: 0,
  helpfulCount: 0,
};

export function AdminReviewsPage() {
  const { user } = useCatalog();
  const [inbox, setInbox] = useState(empty);
  const [filters, setFilters] = useState({ scenarioId: '', helpful: '', offset: 0 });
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ offset: String(filters.offset) });
    if (filters.scenarioId) query.set('scenarioId', filters.scenarioId);
    if (filters.helpful) query.set('helpful', filters.helpful);
    setLoading(true);
    setError('');
    api<ScenarioReviewInbox>(`/admin/reviews?${query}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setInbox(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, reload]);
  const filter = (key: 'scenarioId' | 'helpful', value: string) =>
    setFilters((current) => ({ ...current, [key]: value, offset: 0 }));
  return (
    <div className="admin-page review-page">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">
            <span className="accent-dot" /> Впечатления участников
          </p>
          <h1>Отзывы о сценариях</h1>
          <p>
            {user?.isSuperAdmin ? 'Отзывы обо всех сценариях.' : 'Отзывы о ваших сценариях.'} Новые
            — сверху.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          <Icon name="reset" size={17} /> Обновить
        </Button>
      </div>
      <div className="panel review-filters">
        <label className="field">
          Сценарий
          <Select value={filters.scenarioId} onValueChange={(value) => filter('scenarioId', value)}>
            <option value="">Все сценарии</option>
            {filters.scenarioId &&
              !inbox.scenarios.some((scenario) => scenario.id === filters.scenarioId) && (
                <option value={filters.scenarioId}>Сценарий недоступен</option>
              )}
            {inbox.scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          Оценка практики
          <Select value={filters.helpful} onValueChange={(value) => filter('helpful', value)}>
            <option value="">Все оценки</option>
            <option value="yes">Полезно</option>
            <option value="no">Не совсем</option>
          </Select>
        </label>
        <Button
          variant="outline"
          disabled={!filters.scenarioId && !filters.helpful}
          onClick={() => setFilters({ scenarioId: '', helpful: '', offset: 0 })}
        >
          Сбросить
        </Button>
      </div>
      {loading && (
        <p role="status" className="review-state">
          Загружаем отзывы…
        </p>
      )}
      {error && (
        <p role="alert" className="field-error review-state">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <p className="review-summary" role="status">
            Найдено отзывов: <strong>{inbox.total}</strong>
            <span aria-hidden="true">·</span> Полезно: <strong>{inbox.helpfulCount}</strong>
            <span aria-hidden="true">·</span> Не совсем:{' '}
            <strong>{inbox.total - inbox.helpfulCount}</strong>
          </p>
          {!inbox.reviews.length && (
            <div className="panel review-empty">
              <span className="review-empty-icon">
                <Icon name="message" size={26} />
              </span>
              <h2>
                {filters.scenarioId || filters.helpful
                  ? 'Таких отзывов пока нет'
                  : 'Здесь появятся отзывы'}
              </h2>
              <p>
                {filters.scenarioId || filters.helpful
                  ? 'Попробуйте изменить фильтры.'
                  : 'Участники смогут поделиться впечатлениями после завершения практики.'}
              </p>
            </div>
          )}
          <div className="review-inbox">
            {inbox.reviews.map((review) => (
              <article className="panel review-card" key={review.attemptId}>
                <div className="review-card-heading">
                  <div>
                    <p className="eyebrow">
                      Версия {review.scenarioVersion}
                      {review.deleted ? ' · Сценарий удалён' : review.archived ? ' · В архиве' : ''}
                    </p>
                    <h2>{review.scenarioTitle}</h2>
                  </div>
                  <span
                    className={`review-rating ${review.helpful ? 'is-helpful' : 'is-unhelpful'}`}
                  >
                    <Icon name={review.helpful ? 'check' : 'message'} size={16} />
                    {review.helpful ? 'Полезно' : 'Не совсем'}
                  </span>
                </div>
                {review.comment ? (
                  <p className="review-comment">{review.comment}</p>
                ) : (
                  <p className="review-no-comment">Участник оставил только оценку.</p>
                )}
                <div className="review-card-footer">
                  <span className="review-author">
                    <Icon name="user" size={16} />
                    {review.authorName}
                  </span>
                  <time dateTime={review.createdAt}>{date.format(new Date(review.createdAt))}</time>
                  {review.updatedAt !== review.createdAt && (
                    <span className="review-edited">
                      Изменён {date.format(new Date(review.updatedAt))}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {(filters.offset > 0 || (!loading && !error && inbox.hasMore)) && (
        <nav className="contact-pagination" aria-label="Страницы отзывов">
          <Button
            variant="outline"
            disabled={loading || filters.offset === 0}
            onClick={() =>
              setFilters((value) => ({
                ...value,
                offset: Math.max(0, value.offset - REVIEW_PAGE_SIZE),
              }))
            }
          >
            <Icon name="back" size={16} /> Назад
          </Button>
          <span className="contact-page-number" aria-current="page">
            Страница {Math.floor(filters.offset / REVIEW_PAGE_SIZE) + 1}
          </span>
          <Button
            variant="outline"
            disabled={loading || !!error || !inbox.hasMore}
            onClick={() =>
              setFilters((value) => ({ ...value, offset: value.offset + REVIEW_PAGE_SIZE }))
            }
          >
            Далее <Icon name="arrow" size={16} />
          </Button>
        </nav>
      )}
    </div>
  );
}
