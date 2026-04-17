import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runDietPlannerAgent } from "@/lib/diet-agent";
import { forceFlushLangfuse } from "@/lib/observability/langfuse.server";
import { captureException } from "@/lib/observability/sentry";
import type { OrderRecipeRequest } from "@/lib/schema";

function formatSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { userId } = await auth();

  if (!userId) {
    return new Response(
      formatSse("error", {
        message: "请先登录。"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        }
      }
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response(
      formatSse("error", {
        message: "缺少 OPENROUTER_API_KEY，请先在 .env.local 中配置 OpenRouter 密钥。"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive"
        }
      }
    );
  }

  const profile = (await request.json()) as OrderRecipeRequest;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  let closed = false;

  const close = async () => {
    if (closed) {
      return;
    }

    closed = true;

    try {
      await writer.close();
    } catch {
      // Ignore writer-close races caused by disconnects or duplicate close attempts.
    }
  };

  const send = async (event: string, data: unknown) => {
    if (closed) {
      return false;
    }

    try {
      await writer.write(encoder.encode(formatSse(event, data)));
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  const abortHandler = () => {
    void close();
  };

  request.signal.addEventListener("abort", abortHandler, { once: true });
  after(async () => {
    await forceFlushLangfuse();
  });

  void (async () => {
    try {
      await send("progress", {
        stage: "request_received",
        message: "服务端已收到请求，正在准备 agent。"
      });

      const result = await runDietPlannerAgent(profile, {
        onProgress: (event) => {
          void send("progress", event);
        }
      });

      await send("complete", result);
    } catch (error) {
      captureException(error, {
        tags: {
          area: "api",
          route: "/api/recommend/stream"
        }
      });

      if (!closed) {
        await send("error", {
          message:
            error instanceof Error ? error.message : "推荐生成失败，请稍后重试。"
        });
      }
    } finally {
      request.signal.removeEventListener("abort", abortHandler);
      await close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
