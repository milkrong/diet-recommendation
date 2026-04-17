import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  getObservabilityEnvironment,
  isLangfuseEnabled
} from "@/lib/observability/config";

declare global {
  var __dietAgentLangfuseSdk: NodeSDK | undefined;
  var __dietAgentLangfuseSpanProcessor: LangfuseSpanProcessor | undefined;
  var __dietAgentLangfuseInitialized: boolean | undefined;
}

export async function initLangfuseTracing() {
  if (!isLangfuseEnabled() || globalThis.__dietAgentLangfuseInitialized) {
    return;
  }

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    environment: getObservabilityEnvironment(),
    release:
      process.env.GLITCHTIP_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version,
    exportMode: "immediate"
  });

  const sdk = new NodeSDK({
    spanProcessors: [spanProcessor]
  });

  await sdk.start();
  globalThis.__dietAgentLangfuseSdk = sdk;
  globalThis.__dietAgentLangfuseSpanProcessor = spanProcessor;
  globalThis.__dietAgentLangfuseInitialized = true;
}

export async function forceFlushLangfuse() {
  if (!globalThis.__dietAgentLangfuseSpanProcessor) {
    return;
  }

  try {
    await globalThis.__dietAgentLangfuseSpanProcessor.forceFlush();
  } catch (error) {
    console.error("[langfuse] forceFlush failed", error);
  }
}
