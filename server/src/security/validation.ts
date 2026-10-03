import { ServiceError } from './errors.js';

/** Share strict schema validation across HTTP and realtime boundaries. */
export function validate<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ServiceError(
      'INVALID_REQUEST',
      'Please check your request and try again.',
    );
  return parsed.data;
}
