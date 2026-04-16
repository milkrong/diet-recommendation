export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { initLangfuseTracing } = await import(
      "@/lib/observability/langfuse.server"
    );
    await initLangfuseTracing();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
