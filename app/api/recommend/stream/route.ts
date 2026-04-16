import { runDietPlannerAgent } from "@/lib/diet-agent";
import type { OrderRecipeRequest } from "@/lib/schema";

function formatSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSse(event, data)));
      };

      try {
        send("progress", {
          stage: "request_received",
          message: "服务端已收到请求，正在准备 agent。"
        });

        const result = await runDietPlannerAgent(profile, {
          onProgress: (event) => send("progress", event)
        });

        send("complete", result);
      } catch (error) {
        send("error", {
          message:
            error instanceof Error ? error.message : "推荐生成失败，请稍后重试。"
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
