export function getObservabilityEnvironment() {
  return (
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function getSentryDsn() {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function getClientSentryDsn() {
  return process.env.NEXT_PUBLIC_SENTRY_DSN;
}
