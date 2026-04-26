import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { runDietPlannerAgent } from "@/lib/diet-agent";
import { captureException, forceFlushSentry, logEvent } from "@/lib/observability/sentry";
import type { OrderRecipeRequest } from "@/lib/schema";

function formatSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  logEvent("info", "Streaming recommend request received", {
    area: "api",
    route: "/api/recommend/stream",
    method: "POST"
  });
  const { userId } = await auth();

  if (!userId) {
    logEvent("warn", "Streaming recommend request rejected without auth", {
      area: "api",
      route: "/api/recommend/stream",
      method: "POST",
      status_code: 401
    });
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
    logEvent("error", "Streaming recommend request missing OpenRouter API key", {
      area: "api",
      route: "/api/recommend/stream",
      method: "POST",
      status_code: 500
    });
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
  logEvent("info", "Streaming recommend request parsed", {
    area: "api",
    route: "/api/recommend/stream",
    method: "POST",
    has_order_image: Boolean(profile.orderImageDataUrl),
    has_order_text: Boolean(profile.orderText?.trim()),
    goals_count: profile.goals?.length ?? 0,
    conditions_count: profile.conditions?.length ?? 0
  });
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
    logEvent("warn", "Streaming recommend request aborted", {
      area: "api",
      route: "/api/recommend/stream",
      method: "POST"
    });
    void close();
  };

  request.signal.addEventListener("abort", abortHandler, { once: true });
  after(async () => {
    await forceFlushSentry();
  });

  void (async () => {
    try {
      await send("progress", {
        stage: "request_received",
        message: "服务端已收到请求，正在准备 agent。"
      });

      const result = await runDietPlannerAgent(profile, {
        onProgress: (event) => {
          logEvent("info", "Streaming recommend progress", {
            area: "api",
            route: "/api/recommend/stream",
            method: "POST",
            stage: event.stage
          });
          void send("progress", event);
        }
      });

      await send("complete", result);
      logEvent("info", "Streaming recommend request completed", {
        area: "api",
        route: "/api/recommend/stream",
        method: "POST",
        status_code: 200,
        recipe_count: result.recipeSuggestions.length,
        recognized_count: result.recognizedItems.length
      });
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
