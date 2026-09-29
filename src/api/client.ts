import { reportServiceProblem } from './serviceStatus.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const isServiceError = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || error.status >= 500);
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие';
// Action forms already have a global notification for service failures.
export const actionErrorMessage = (error: unknown) =>
  isServiceError(error) ? '' : errorMessage(error);

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  try {
    const method = options.method ?? 'GET';
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        signal: options.signal,
        headers:
          method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Arena-Request': '1' },
        body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError(0, 'Нет связи с сервером.');
    }
    if (response.status === 204) return undefined as T;
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status >= 500)
        throw new ApiError(response.status, 'Сервис временно недоступен.');
      const data = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
      const details = Array.isArray(data.details)
        ? data.details
            .flatMap((item: unknown) => {
              if (
                !item ||
                typeof item !== 'object' ||
                !('message' in item) ||
                typeof item.message !== 'string'
              )
                return [];
              const field = 'field' in item && typeof item.field === 'string' ? item.field : '';
              return [`${field ? `${field}: ` : ''}${item.message}`];
            })
            .join('; ')
        : '';
      throw new ApiError(
        response.status,
        (typeof data.error === 'string' ? data.error : 'Не удалось выполнить запрос') +
          (details ? ` (${details})` : ''),
      );
    }
    if (
      !response.headers.get('content-type')?.includes('application/json') ||
      (json === null && path !== '/auth/me')
    )
      throw new ApiError(0, 'Нет связи с сервером.');
    return json as T;
  } catch (error) {
    if (!options.signal?.aborted && isServiceError(error))
      reportServiceProblem(
        error instanceof ApiError && error.status === 500 ? 'server' : 'connection',
      );
    throw error;
  }
}
