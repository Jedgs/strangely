import { z } from 'zod';

function configuredSecret(value: string): boolean {
  return (
    value.length >= 32 && !/REPLACE_|YOUR_|CHANGE[_-]?ME|^<.*>$/i.test(value)
  );
}

function validUrl(value: string, predicate: (url: URL) => boolean): boolean {
  try {
    return predicate(new URL(value));
  } catch {
    return false;
  }
}

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(2000).default(500),
    HOST: z.string().default('127.0.0.1'),
    CLIENT_URL: z
      .url()
      .refine(
        (value) =>
          validUrl(
            value,
            (url) =>
              ['http:', 'https:'].includes(url.protocol) &&
              !url.username &&
              !url.password &&
              url.pathname === '/' &&
              !url.search &&
              !url.hash,
          ),
        'Use an HTTP(S) origin without a path or credentials',
      )
      .default('http://127.0.0.1:5173'),
    DATABASE_URL: z
      .url()
      .refine(
        (value) =>
          validUrl(value, (url) =>
            ['postgres:', 'postgresql:'].includes(url.protocol),
          ),
        'Use a PostgreSQL connection URL',
      ),
    REDIS_URL: z
      .url()
      .refine(
        (value) =>
          validUrl(value, (url) =>
            ['redis:', 'rediss:'].includes(url.protocol),
          ),
        'Use a Redis connection URL',
      ),
    SESSION_SECRET: z
      .string()
      .min(32)
      .refine(configuredSecret, 'Generate a random session secret'),
    ADMIN_PASSWORD_HASH: z
      .string()
      .regex(/^$|^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/)
      .default(''),
    ADMIN_TOTP_SECRET: z
      .string()
      .regex(/^$|^[A-Z2-7]{32,64}$/)
      .default(''),
    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    AGE_MODE: z.enum(['development', 'provider']).default('development'),
    AGE_VERIFICATION_URL: z.string().default(''),
    AGE_WEBHOOK_SECRET: z.string().default(''),
    TRUST_EDGE_COUNTRY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    EDGE_GEO_SECRET: z.string().default(''),
    STUN_SERVER_URL: z
      .string()
      .regex(/^stuns?:/)
      .default('stun:stun.l.google.com:19302'),
    TURN_SERVER_URL: z.string().default(''),
    TURN_SHARED_SECRET: z.string().default(''),
    TURN_CREDENTIAL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86400)
      .default(3600),
    ICE_TRANSPORT_POLICY: z.enum(['all', 'relay']).default('all'),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86400)
      .default(7200),
    REPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    FACE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(10000)
      .default(1500),
    FACE_WARNING_MS: z.coerce.number().int().min(5000).default(10000),
    FACE_PAUSE_MS: z.coerce.number().int().min(10000).default(30000),
    FACE_DISCONNECT_MS: z.coerce.number().int().min(20000).default(60000),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    COOKIE_SAMESITE: z.enum(['strict', 'none']).default('strict'),
  })
  .superRefine((value, ctx) => {
    if (value.TRUST_EDGE_COUNTRY && !configuredSecret(value.EDGE_GEO_SECRET))
      ctx.addIssue({
        code: 'custom',
        message:
          'Country metadata requires a strong server-only trusted edge secret',
      });
    if (
      value.AGE_MODE === 'provider' &&
      (!validUrl(
        value.AGE_VERIFICATION_URL,
        (url) =>
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          !url.hash,
      ) ||
        !configuredSecret(value.AGE_WEBHOOK_SECRET))
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Provider age checks require an HTTPS verification gateway and a strong webhook secret',
      });
    if (
      value.NODE_ENV === 'production' &&
      (value.AGE_MODE !== 'provider' ||
        !value.ADMIN_PASSWORD_HASH ||
        !value.ADMIN_TOTP_SECRET)
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Public launch is blocked: configure provider age verification and administrator password plus MFA',
      });
    if (
      value.FACE_WARNING_MS >= value.FACE_PAUSE_MS ||
      value.FACE_PAUSE_MS >= value.FACE_DISCONNECT_MS
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Face warning, pause and disconnect thresholds must increase',
      });
    }
    if (
      value.TURN_SERVER_URL &&
      (!/^turns?:/.test(value.TURN_SERVER_URL) ||
        !configuredSecret(value.TURN_SHARED_SECRET))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_SHARED_SECRET'],
        message: 'TURN requires a valid URL and a strong shared secret',
      });
    }
    if (value.ICE_TRANSPORT_POLICY === 'relay' && !value.TURN_SERVER_URL) {
      ctx.addIssue({ code: 'custom', message: 'Relay policy requires TURN' });
    }
    if (
      value.NODE_ENV === 'production' &&
      (!value.CLIENT_URL.startsWith('https://') || !value.TURN_SERVER_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Production requires HTTPS and TURN fallback',
      });
    }
  });

export type Config = z.infer<typeof schema>;
export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    // Do not include the input object or connection URLs in errors.
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}
