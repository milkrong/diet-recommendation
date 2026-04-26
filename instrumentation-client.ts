import * as Sentry from "@sentry/nextjs";
import {
  getClientSentryDsn,
  getObservabilityEnvironment
} from "@/lib/observability/config";

const dsn = getClientSentryDsn();

if (dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnvironment(),
    release:
      process.env.NEXT_PUBLIC_SENTRY_RELEASE ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    sampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE || "1"),
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || "0"
    ),
    enableLogs: true,
    sendDefaultPii: false
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
