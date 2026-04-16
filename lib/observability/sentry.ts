import * as Sentry from "@sentry/nextjs";

type CaptureExceptionContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

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

    Sentry.captureException(normalizedError);
  });

  return normalizedError;
}
