import {
  dietPlanResultSchema,
  orderRecipeRequestSchema,
  recognizedItemSchema,
  type DietPlanResult,
  type OrderRecipeRequest,
  type RecognizedItem
} from "@/lib/schema";
import { createAgent } from "@/lib/openrouter-agent";
import { extractJsonObject } from "@/lib/openrouter-json";
import { defaultDietTools } from "@/lib/openrouter-tools";
import { OpenRouter } from "@openrouter/sdk";
import { z } from "zod/v4";

type OpenRouterChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: { url: string; detail?: "auto" | "low" | "high" } };

export type DietAgentProgressStage =
  | "started"
  | "recognition_started"
  | "recognition_completed"
  | "recipe_started"
  | "repair_started"
  | "recipe_completed"
  | "completed";

export type DietAgentProgressEvent = {
  stage: DietAgentProgressStage;
  message: string;
  detail?: unknown;
};

type DietAgentOptions = {
  onProgress?: (event: DietAgentProgressEvent) => void;
};

const recognizedItemsResultSchema = z.object({
  recognizedItems: z.array(recognizedItemSchema)
});

const dietAgentInstructions = `
你是一名中文营养规划 agent，负责根据买菜 app 订单截图或订单文字识别用户已经购买的食材，并给出结构化、实用、能执行的菜谱建议。

你的要求：
- 推荐内容必须根据用户输入动态生成，不能复读固定模板。
- 在形成最终结果前，先调用 build_profile_context 和 build_recipe_context 两个工具补全上下文。
- 需要先从订单截图或订单文字里识别已购食材，再考虑目标、口味偏好、疾病限制、日常节奏、训练频率和备注。
- 对疾病相关情况给出保守提醒，不要冒充医生，不要提供诊断或药物建议。
- 不再参考山姆、会员店或商品目录，不要输出采购清单。
- 菜谱应该尽量优先利用已经买到的食材；如果必须补充，只能是少量基础调味料或常见辅料。
- 如果信息不足，可以做合理假设，但必须在 cautions 中明确说出假设。
- 只输出 JSON，不要输出 markdown，不要加解释性前言或结尾。
`.trim();

function createDietAgent() {
  return createAgent({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    instructions: dietAgentInstructions,
    tools: [...defaultDietTools],
    maxSteps: 5,
    appUrl: process.env.OPENROUTER_APP_URL,
    appName: process.env.OPENROUTER_APP_NAME || "Diet Agent Shanghai"
  });
}

function createOpenRouterClient() {
  return new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    ...(process.env.OPENROUTER_APP_URL
      ? { httpReferer: process.env.OPENROUTER_APP_URL }
      : {}),
    ...(process.env.OPENROUTER_APP_NAME
      ? { appTitle: process.env.OPENROUTER_APP_NAME }
      : {})
  });
}

function buildProfileText(profile: OrderRecipeRequest) {
  return JSON.stringify(
    {
      name: profile.name,
      age: profile.age,
      goals: profile.goals,
      schedule: profile.schedule,
      preferences: profile.preferences,
      conditions: profile.conditions,
      trainingFrequency: profile.trainingFrequency,
      notes: profile.notes
    },
    null,
    2
  );
}

function buildRecognitionPrompt(profile: OrderRecipeRequest) {
  const orderSource = profile.orderImageDataUrl ? "订单截图" : "订单文字";

  return `
请根据用户提供的${orderSource}识别已经购买的食材，只返回 JSON 对象。

用户画像：
${buildProfileText(profile)}

订单文字：
${profile.orderText?.trim() || "未提供订单文字；如果有截图，请从图片中识别。"}

JSON 结构：
{
  "recognizedItems": [
    {
      "name": "识别到的食材",
      "evidence": "从截图或文字哪里判断出来的",
      "confidence": "高/中/低"
    }
  ]
}

要求：
- 优先识别可用于做菜的真实食材，不要把配送费、优惠券、包装费当食材。
- 尽量识别至少 5 个食材；如果信息不够，就列出可识别部分并标低置信度。
- 所有内容使用简体中文。
  `.trim();
}

function buildRecipePrompt(profile: OrderRecipeRequest, recognizedItems: RecognizedItem[]) {
  return `
请基于已经识别出的买菜订单食材，为用户生成个性化菜谱建议，并严格返回 JSON 对象。

用户画像：
${buildProfileText(profile)}

已识别食材：
${JSON.stringify(recognizedItems, null, 2)}

JSON 必须符合下面的结构要求：
{
  "planTitle": "string",
  "positioning": "string",
  "goalSummary": "string",
  "nutritionFocus": "string",
  "executionStyle": "string",
  "recognizedItems": [
    {
      "name": "识别到的食材",
      "evidence": "从截图或文字哪里判断出来的",
      "confidence": "高/中/低"
    }
  ],
  "recipeSuggestions": [
    {
      "title": "菜谱名",
      "summary": "这道菜怎么做、风格如何",
      "fitReason": "为什么适合这个用户和这批食材",
      "ingredientsToUse": ["这道菜会用到的已购食材"],
      "steps": ["步骤1", "步骤2", "步骤3"]
    }
  ],
  "executionTips": ["执行建议 1", "执行建议 2"],
  "cautions": ["风险提示 1", "风险提示 2"]
}

补充要求：
- recognizedItems 必须保留上面已识别食材的核心信息。
- recipeSuggestions 给出 3 到 5 道菜。
- 每道菜尽量复用 recognizedItems 里的食材，不要为了凑数发明太多额外原料。
- 菜谱风格优先家常、好执行、符合用户多选目标。
- 所有内容使用简体中文。
  `.trim();
}

function buildRepairPrompt(rawText: string, error: unknown) {
  const errorMessage =
    error instanceof Error ? error.message : "未知格式错误";

  return `
你现在是一个 JSON 修复器。下面是上一个模型返回的内容，它本来应该符合 schema，但解析失败了。

请你做两件事：
1. 保留原有语义，修复为一个合法 JSON 对象
2. 只输出 JSON，不要加解释

解析错误：
${errorMessage}

原始内容：
${rawText}
  `.trim();
}

function extractAssistantText(response: unknown) {
  const content =
    (response as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
      ?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part && "text" in part
          ? String((part as { text?: string }).text ?? "")
          : ""
      )
      .join("");
  }

  throw new Error("模型没有返回可解析的文本内容。");
}

function parseJsonWithSchema<T>(rawText: string, schema: z.ZodType<T>) {
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText);
  return schema.parse(parsed);
}

async function generateChatText(profile: OrderRecipeRequest, prompt: string) {
  const client = createOpenRouterClient();
  const messageContent: OpenRouterChatContentPart[] = [
    {
      type: "text",
      text: prompt
    }
  ];

  if (profile.orderImageDataUrl) {
    messageContent.push({
      type: "image_url",
      imageUrl: {
        url: profile.orderImageDataUrl,
        detail: "high"
      }
    });
  }

  const response = await client.chat.send({
    httpReferer: process.env.OPENROUTER_APP_URL,
    appTitle: process.env.OPENROUTER_APP_NAME || "Diet Agent Shanghai",
    chatGenerationParams: {
      model: profile.orderImageDataUrl
        ? process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || "openrouter/auto"
        : process.env.OPENROUTER_MODEL || "openrouter/auto",
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      responseFormat: {
        type: "json_object"
      }
    }
  });

  return extractAssistantText(response);
}

async function repairJson<T>(
  rawText: string,
  error: unknown,
  schema: z.ZodType<T>,
  options?: DietAgentOptions
) {
  options?.onProgress?.({
    stage: "repair_started",
    message: "模型返回格式不稳定，正在自动修复 JSON。"
  });

  const repairAgent = createDietAgent();
  const repairedText = await repairAgent.sendSync(buildRepairPrompt(rawText, error));
  return parseJsonWithSchema(repairedText, schema);
}

async function recognizeItems(profile: OrderRecipeRequest, options?: DietAgentOptions) {
  options?.onProgress?.({
    stage: "recognition_started",
    message: profile.orderImageDataUrl
      ? "正在识别订单截图中的食材。"
      : "正在解析订单文字中的食材。"
  });

  const rawText = await generateChatText(profile, buildRecognitionPrompt(profile));

  try {
    return parseJsonWithSchema(rawText, recognizedItemsResultSchema).recognizedItems;
  } catch (error) {
    return (
      await repairJson(rawText, error, recognizedItemsResultSchema, options)
    ).recognizedItems;
  }
}

async function generateRecipes(
  profile: OrderRecipeRequest,
  recognizedItems: RecognizedItem[],
  options?: DietAgentOptions
) {
  options?.onProgress?.({
    stage: "recipe_started",
    message: "食材识别完成，正在匹配目标并生成菜谱。",
    detail: {
      recognizedCount: recognizedItems.length
    }
  });

  const agent = createDietAgent();
  const rawText = await agent.sendSync(buildRecipePrompt(profile, recognizedItems));

  try {
    return parseJsonWithSchema(rawText, dietPlanResultSchema);
  } catch (error) {
    return repairJson(rawText, error, dietPlanResultSchema, options);
  }
}

export async function runDietPlannerAgent(
  rawProfile: OrderRecipeRequest,
  options?: DietAgentOptions
): Promise<DietPlanResult> {
  const profile = orderRecipeRequestSchema.parse(rawProfile);

  options?.onProgress?.({
    stage: "started",
    message: "已收到订单和用户画像，开始生成。"
  });

  try {
    const recognizedItems = await recognizeItems(profile, options);

    options?.onProgress?.({
      stage: "recognition_completed",
      message: `已识别 ${recognizedItems.length} 个食材，开始生成菜谱。`,
      detail: {
        recognizedItems
      }
    });

    const plan = await generateRecipes(profile, recognizedItems, options);

    options?.onProgress?.({
      stage: "recipe_completed",
      message: `已生成 ${plan.recipeSuggestions.length} 道菜谱，正在整理结果。`
    });

    options?.onProgress?.({
      stage: "completed",
      message: "菜谱推荐已完成。"
    });

    return plan;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "模型输出无法稳定解析";

    throw new Error(
      `推荐生成失败。系统已经尝试自动修复 JSON。原始原因：${message}`
    );
  }
}
