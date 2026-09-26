import { ApiError } from '../../api/client.ts';
import { ErrorPage } from '../../pages/ErrorPage.tsx';
import { ButtonLink } from './Button.tsx';
export function RequestFailure({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 404) return <ErrorPage />;
  if (error instanceof ApiError && error.status === 500) return <ErrorPage code={500} />;
  return (
    <div className="container page negotiation-empty">
      <h1>Не удалось загрузить данные</h1>
      <p>Вернитесь к странице, когда связь восстановится.</p>
      <ButtonLink to="/" replace>
        На главную
      </ButtonLink>
    </div>
  );
}
