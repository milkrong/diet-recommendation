import * as Sentry from "@sentry/nextjs";
import {
  getGlitchTipDsn,
  getObservabilityEnvironment
} from "@/lib/observability/config";

const dsn = getGlitchTipDsn();

if (dsn) {
  Sentry.init({
    dsn,
    environment: getObservabilityEnvironment(),
    release:
      process.env.GLITCHTIP_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version,
    sampleRate: Number(process.env.GLITCHTIP_SAMPLE_RATE || "1"),
    tracesSampleRate: Number(process.env.GLITCHTIP_TRACES_SAMPLE_RATE || "0"),
    sendDefaultPii: false
  });
}
