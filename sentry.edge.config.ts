import * as Sentry from "@sentry/nextjs";
import {
  getSentryDsn,
  getObservabilityEnvironment
} from "@/lib/observability/config";

const dsn = getSentryDsn();

if (dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnvironment(),
    release:
      process.env.SENTRY_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version,
    sampleRate: Number(process.env.SENTRY_SAMPLE_RATE || "1"),
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
    enableLogs: true,
    sendDefaultPii: false
  });
}
