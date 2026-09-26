export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
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
    throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение и повторите действие.');
  }
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const issues = Array.isArray(json?.details)
      ? json.details
          .map(
            (item: { field?: string; message: string }) =>
              `${item.field ? `${item.field}: ` : ''}${item.message}`,
          )
          .join('; ')
      : '';
    throw new ApiError(
      response.status,
      (json?.error ?? 'Не удалось выполнить запрос') + (issues ? ` (${issues})` : ''),
    );
  }
  if (json === null && response.headers.get('content-type')?.includes('application/json') !== true)
    throw new ApiError(0, 'API недоступен. Запустите сервер командой npm run dev.');
  return json as T;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие';
