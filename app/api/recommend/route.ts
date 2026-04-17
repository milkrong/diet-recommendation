import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runDietPlannerAgent } from "@/lib/diet-agent";
import { forceFlushLangfuse } from "@/lib/observability/langfuse.server";
import { captureException } from "@/lib/observability/sentry";
import type { OrderRecipeRequest } from "@/lib/schema";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const profile = (await request.json()) as OrderRecipeRequest;

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          error: "缺少 OPENROUTER_API_KEY，请先在 .env.local 中配置 OpenRouter 密钥。"
        },
        { status: 500 }
      );
    }

    const result = await runDietPlannerAgent(profile);
    after(async () => {
      await forceFlushLangfuse();
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "推荐生成失败，请稍后重试。";

    after(async () => {
      await forceFlushLangfuse();
    });

    captureException(error, {
      tags: {
        area: "api",
        route: "/api/recommend"
      }
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
