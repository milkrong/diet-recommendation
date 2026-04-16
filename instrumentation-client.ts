import * as Sentry from "@sentry/nextjs";
import {
  getClientGlitchTipDsn,
  getObservabilityEnvironment
} from "@/lib/observability/config";

const dsn = getClientGlitchTipDsn();

if (dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnvironment(),
    release:
      process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    sampleRate: Number(process.env.NEXT_PUBLIC_GLITCHTIP_SAMPLE_RATE || "1"),
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_GLITCHTIP_TRACES_SAMPLE_RATE || "0"
    ),
    sendDefaultPii: false
  });
}
