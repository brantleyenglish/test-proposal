export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ApiRequestParams = {
  path: string;
  userId: string;
  method?: 'GET' | 'POST';
  body?: unknown;
};

export const apiRequest = async <Result>({ path, userId, method = 'GET', body }: ApiRequestParams) => {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-demo-user-id': userId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(payload.error ?? `Request failed with status ${response.status}`, response.status);
  }
  return payload as Result;
};

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.';
