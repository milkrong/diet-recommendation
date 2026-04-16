export function isLangfuseEnabled() {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

export function getObservabilityEnvironment() {
  return (
    process.env.GLITCHTIP_ENVIRONMENT ||
    process.env.LANGFUSE_TRACING_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

export function getGlitchTipDsn() {
  return process.env.GLITCHTIP_DSN || process.env.NEXT_PUBLIC_GLITCHTIP_DSN;
}

export function getClientGlitchTipDsn() {
  return process.env.NEXT_PUBLIC_GLITCHTIP_DSN;
}
