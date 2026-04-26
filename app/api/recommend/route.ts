import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { runDietPlannerAgent } from "@/lib/diet-agent";
import { captureException, forceFlushSentry, logEvent } from "@/lib/observability/sentry";
import type { OrderRecipeRequest } from "@/lib/schema";

export async function POST(request: Request) {
  try {
    logEvent("info", "Recommend request received", {
      area: "api",
      route: "/api/recommend",
      method: "POST"
    });
    const { userId } = await auth();

    if (!userId) {
      logEvent("warn", "Recommend request rejected without auth", {
        area: "api",
        route: "/api/recommend",
        method: "POST",
        status_code: 401
      });
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const profile = (await request.json()) as OrderRecipeRequest;
    logEvent("info", "Recommend request parsed", {
      area: "api",
      route: "/api/recommend",
      method: "POST",
      has_order_image: Boolean(profile.orderImageDataUrl),
      has_order_text: Boolean(profile.orderText?.trim()),
      goals_count: profile.goals?.length ?? 0,
      conditions_count: profile.conditions?.length ?? 0
    });

    if (!process.env.OPENROUTER_API_KEY) {
      logEvent("error", "Recommend request missing OpenRouter API key", {
        area: "api",
        route: "/api/recommend",
        method: "POST",
        status_code: 500
      });
      return NextResponse.json(
        {
          error: "缺少 OPENROUTER_API_KEY，请先在 .env.local 中配置 OpenRouter 密钥。"
        },
        { status: 500 }
      );
    }

    const result = await runDietPlannerAgent(profile);
    logEvent("info", "Recommend request completed", {
      area: "api",
      route: "/api/recommend",
      method: "POST",
      status_code: 200,
      recipe_count: result.recipeSuggestions.length,
      recognized_count: result.recognizedItems.length
    });
    after(async () => {
      await forceFlushSentry();
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "推荐生成失败，请稍后重试。";

    after(async () => {
      await forceFlushSentry();
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
