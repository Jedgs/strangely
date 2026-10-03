export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export function unavailable(): ServiceError {
  return new ServiceError(
    'UNAVAILABLE',
    'The service is temporarily unavailable. Please try again.',
    503,
  );
}
