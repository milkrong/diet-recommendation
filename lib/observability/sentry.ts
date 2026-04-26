import * as Sentry from "@sentry/nextjs";

type CaptureExceptionContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type LogAttributes = Record<string, unknown>;

export function logEvent(
  level: LogLevel,
  message: string,
  attributes?: LogAttributes
) {
  Sentry.logger[level](message, {
    service: "diet-recommendation",
    ...attributes
  });
}

export function captureException(
  error: unknown,
  context?: CaptureExceptionContext
) {
  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    Object.entries(context?.tags || {}).forEach(([key, value]) => {
      scope.setTag(key, value);
    });

    Object.entries(context?.extra || {}).forEach(([key, value]) => {
      scope.setExtra(key, value);
    });

    logEvent("error", normalizedError.message, {
      area: context?.tags?.area,
      route: context?.tags?.route,
      action: context?.tags?.action,
      error_name: normalizedError.name
    });

    Sentry.captureException(normalizedError);
  });

  return normalizedError;
}

export async function forceFlushSentry() {
  try {
    await Sentry.flush(2000);
  } catch (error) {
    console.error("[sentry] forceFlush failed", error);
  }
}
