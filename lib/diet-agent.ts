import {
  dietPlanResultSchema,
  getMealPlanTotal,
  normalizeMealPlanCounts,
  orderRecipeRequestSchema,
  recognizedItemSchema,
  type DietPlanResult,
  type MealPlanCounts,
  type OrderRecipeRequest,
  type RecognizedItem
} from "@/lib/schema";
import { captureException, logEvent } from "@/lib/observability/sentry";
import * as Sentry from "@sentry/nextjs";
import { extractJsonObject } from "@/lib/openrouter-json";
import { buildProfileContext, buildRecipeContext } from "@/lib/openrouter-tools";
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

class ModelResponseParseError extends Error {
  debugPayload?: Record<string, unknown>;

  constructor(message: string, debugPayload?: Record<string, unknown>) {
    super(message);
    this.name = "ModelResponseParseError";
    this.debugPayload = debugPayload;
  }
}

const recognizedItemsJsonSchema = {
  name: "recognized_items_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["recognizedItems"],
    properties: {
      recognizedItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "evidence", "confidence"],
          properties: {
            name: { type: "string" },
            evidence: { type: "string" },
            confidence: { type: "string" }
          }
        }
      }
    }
  }
} as const;

const dietPlanJsonSchema = {
  name: "diet_plan_result",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "planTitle",
      "positioning",
      "goalSummary",
      "nutritionFocus",
      "executionStyle",
      "recognizedItems",
      "suggestedShoppingList",
      "recipeSuggestions",
      "executionTips",
      "cautions"
    ],
    properties: {
      planTitle: { type: "string" },
      positioning: { type: "string" },
      goalSummary: { type: "string" },
      nutritionFocus: { type: "string" },
      executionStyle: { type: "string" },
      recognizedItems: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "evidence", "confidence"],
          properties: {
            name: { type: "string" },
            evidence: { type: "string" },
            confidence: { type: "string" }
          }
        }
      },
      suggestedShoppingList: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "reason"],
          properties: {
            name: { type: "string" },
            quantity: { type: "string" },
            reason: { type: "string" }
          }
        }
      },
      recipeSuggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "summary",
            "fitReason",
            "ingredientsToUse",
            "steps"
          ],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            fitReason: { type: "string" },
            ingredientsToUse: {
              type: "array",
              items: { type: "string" }
            },
            steps: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      },
      executionTips: {
        type: "array",
        items: { type: "string" }
      },
      cautions: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
} as const;

function serializeProfileForTelemetry(profile: OrderRecipeRequest) {
  const mealPlanCounts = normalizeMealPlanCounts(
    profile.mealPlanCounts,
    profile.generationScope
  );

  return {
    name: profile.name || undefined,
    age: profile.age || undefined,
    goals: profile.goals,
    schedule: profile.schedule,
    preferences: profile.preferences,
    conditions: profile.conditions,
    mealPlanCounts,
    mealPlanTotal: getMealPlanTotal(mealPlanCounts),
    trainingFrequency: profile.trainingFrequency || undefined,
    notesPreview: profile.notes ? profile.notes.slice(0, 200) : undefined,
    orderTextPreview: profile.orderText ? profile.orderText.slice(0, 300) : undefined,
    hasOrderImage: Boolean(profile.orderImageDataUrl)
  };
}

function extractUsageDetails(response: unknown) {
  const usage =
    (response as { usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      inputTokensDetails?: { cachedTokens?: number };
      outputTokensDetails?: { reasoningTokens?: number };
    } | null })?.usage;

  if (!usage) {
    return undefined;
  }

  return {
    prompt_tokens: usage.inputTokens ?? 0,
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? 0,
    cached_tokens: usage.inputTokensDetails?.cachedTokens ?? 0,
    reasoning_tokens: usage.outputTokensDetails?.reasoningTokens ?? 0
  };
}

function truncateForDebug(value: unknown, maxLength = 1500) {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }

  try {
    const json = JSON.stringify(value);
    return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
  } catch {
    return String(value);
  }
}

function stringifyTelemetryValue(value: unknown, maxLength = 1500) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return truncateForDebug(value, maxLength);
}

function setSpanAttributes(
  span: Sentry.Span,
  attributes: Record<string, unknown>
) {
  Object.entries(attributes).forEach(([key, value]) => {
    const serialized = stringifyTelemetryValue(value);

    if (serialized !== undefined) {
      span.setAttribute(key, serialized);
    }
  });
}

function summarizeModelResponse(response: unknown) {
  const typed = response as {
    id?: unknown;
    model?: unknown;
    outputText?: unknown;
    output?: unknown;
    usage?: unknown;
    choices?: Array<{ message?: { content?: unknown; refusal?: unknown; reasoning?: unknown } }>;
  };

  return {
    id: typed?.id,
    model: typed?.model,
    hasOutputText: typed?.outputText !== undefined,
    outputTextPreview:
      typeof typed?.outputText === "string"
        ? truncateForDebug(typed.outputText, 400)
        : typed?.outputText
          ? truncateForDebug(typed.outputText, 400)
          : undefined,
    hasOutput: typed?.output !== undefined,
    outputPreview: typed?.output ? truncateForDebug(typed.output, 600) : undefined,
    usage: typed?.usage,
    choicesLength: Array.isArray(typed?.choices) ? typed.choices.length : 0,
    firstChoiceContentPreview: Array.isArray(typed?.choices)
      ? truncateForDebug(typed.choices[0]?.message?.content, 600)
      : undefined,
    firstChoiceRefusal: Array.isArray(typed?.choices)
      ? typed.choices[0]?.message?.refusal
      : undefined,
    firstChoiceReasoning: Array.isArray(typed?.choices)
      ? truncateForDebug(typed.choices[0]?.message?.reasoning, 300)
      : undefined
  };
}

const recognizedItemsResultSchema = z.object({
  recognizedItems: z.array(recognizedItemSchema)
});

const dietAgentInstructions = `
你是一名中文营养规划 agent，负责根据买菜 app 订单截图、订单文字或仅有的用户画像，给出结构化、实用、能执行的菜谱建议。

你的要求：
- 推荐内容必须根据用户输入动态生成，不能复读固定模板。
- 如果提供了订单截图或订单文字，需要先识别已购食材，再考虑目标、口味偏好、疾病限制、日常节奏、训练频率和备注。
- 如果没有提供购物清单，需要直接根据用户画像生成菜谱，并补出建议采购清单。
- 对疾病相关情况给出保守提醒，不要冒充医生，不要提供诊断或药物建议。
- 如果有已购食材，菜谱应该尽量优先利用已经买到的食材；如果必须补充，只能是少量基础调味料或常见辅料。
- 如果没有已购食材，可以输出建议采购清单，但要尽量家常、精简、好买。
- 如果信息不足，可以做合理假设，但必须在 cautions 中明确说出假设。
- 只输出 JSON，不要输出 markdown，不要加解释性前言或结尾。
`.trim();

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
  const mealPlanCounts = normalizeMealPlanCounts(
    profile.mealPlanCounts,
    profile.generationScope
  );

  return JSON.stringify(
    {
      name: profile.name,
      age: profile.age,
      goals: profile.goals,
      schedule: profile.schedule,
      preferences: profile.preferences,
      conditions: profile.conditions,
      generationScope: profile.generationScope || "single-meal",
      mealPlanCounts,
      mealPlanTotal: getMealPlanTotal(mealPlanCounts),
      mealPlanSequence: buildMealPlanSequence(mealPlanCounts),
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

function hasOrderInput(profile: OrderRecipeRequest) {
  return Boolean(profile.orderImageDataUrl?.trim() || profile.orderText?.trim());
}

function buildMealPlanSequence(counts: MealPlanCounts) {
  const maxDays = Math.max(counts.breakfast, counts.lunch, counts.dinner);
  const sequence: string[] = [];

  for (let index = 0; index < maxDays; index += 1) {
    if (index < counts.breakfast) {
      sequence.push(`早餐第 ${index + 1} 顿`);
    }

    if (index < counts.lunch) {
      sequence.push(`午餐第 ${index + 1} 顿`);
    }

    if (index < counts.dinner) {
      sequence.push(`晚餐第 ${index + 1} 顿`);
    }
  }

  return sequence;
}

function describeMealPlan(counts: MealPlanCounts) {
  return [
    counts.breakfast ? `${counts.breakfast} 顿早餐` : "",
    counts.lunch ? `${counts.lunch} 顿午餐` : "",
    counts.dinner ? `${counts.dinner} 顿晚餐` : ""
  ]
    .filter(Boolean)
    .join(" + ");
}

function buildRecipePrompt(profile: OrderRecipeRequest, recognizedItems: RecognizedItem[]) {
  const profileContext = buildProfileContext(profile);
  const recipeContext = buildRecipeContext({
    schedule: profile.schedule,
    trainingFrequency: profile.trainingFrequency,
    notes: profile.notes
  });
  const mealPlanCounts = normalizeMealPlanCounts(
    profile.mealPlanCounts,
    profile.generationScope
  );
  const mealPlanSequence = buildMealPlanSequence(mealPlanCounts);
  const mealPlanTotal = getMealPlanTotal(mealPlanCounts);
  const hasRecognizedItems = recognizedItems.length > 0;
  const recipeCountRule = `recipeSuggestions 必须严格给出 ${mealPlanTotal} 道菜，顺序必须严格对应：${mealPlanSequence.join("、")}。`;
  const scopeRule = `用户这次要的是 ${describeMealPlan(mealPlanCounts)}，不要额外扩展或减少餐次。`;
  const sourceRule = hasRecognizedItems
    ? "本次已经提供了购物清单，请优先围绕现有食材做推荐。"
    : "本次没有提供购物清单，请直接生成菜谱，并同时补出建议采购清单。";
  const shoppingListRule = hasRecognizedItems
    ? "suggestedShoppingList 只允许补充少量缺失但必要的食材或基础配料；如果不需要补充，就返回空数组。"
    : "suggestedShoppingList 必须给出完成这些菜谱所需的核心采购清单，尽量控制在必要范围内。";
  const ingredientRule = hasRecognizedItems
    ? "每道菜尽量复用 recognizedItems 里的食材，不要为了凑数发明太多额外原料。"
    : "因为用户没有提供购物清单，recipeSuggestions 可以围绕 suggestedShoppingList 里的食材来设计。";

  return `
请基于用户已提供的食材信息或用户画像，为用户生成个性化菜谱建议，并严格返回 JSON 对象。

用户画像：
${buildProfileText(profile)}

归纳后的用户上下文：
${JSON.stringify(profileContext, null, 2)}

归纳后的做饭约束：
${JSON.stringify(recipeContext, null, 2)}

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
  "suggestedShoppingList": [
    {
      "name": "建议采购的食材",
      "quantity": "建议数量",
      "reason": "为什么建议买它"
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
- ${sourceRule}
- recognizedItems 必须保留上面已识别食材的核心信息。
- ${shoppingListRule}
- ${scopeRule}
- ${recipeCountRule}
- ${ingredientRule}
- 菜谱风格优先家常、好执行、符合用户多选目标。
- 每道菜的 summary 和 fitReason 中都要明确它对应 ${mealPlanSequence.join("、")} 中的哪一顿。
- 多顿计划要尽量避免菜名和主要蛋白完全重复，让菜品更丰富；可以复用部分基础食材，但烹饪方式要有变化。
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
  const outputText = (response as { outputText?: unknown })?.outputText;

  if (typeof outputText === "string") {
    return outputText;
  }

  if (outputText && typeof outputText === "object") {
    return JSON.stringify(outputText);
  }

  const content =
    (response as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
      ?.message?.content;
  const reasoning =
    (response as { choices?: Array<{ message?: { reasoning?: unknown } }> })?.choices?.[0]
      ?.message?.reasoning;

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

  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }

  if (typeof reasoning === "string" && reasoning.trim()) {
    return reasoning;
  }

  if (reasoning && typeof reasoning === "object") {
    return JSON.stringify(reasoning);
  }

  const output = (response as { output?: unknown })?.output;
  if (output && typeof output === "object") {
    return JSON.stringify(output);
  }

  throw new ModelResponseParseError("模型没有返回可解析的文本内容。", {
    responseSummary: summarizeModelResponse(response)
  });
}

function parseJsonWithSchema<T>(rawText: string, schema: z.ZodType<T>) {
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText);
  return schema.parse(parsed);
}

async function generateChatText(
  profile: OrderRecipeRequest,
  prompt: string,
  options?: {
    model?: string;
    observationName?: string;
    stage?: "recognition" | "recipe" | "repair";
    includeImage?: boolean;
    responseSchema?: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  }
) {
  const client = createOpenRouterClient();
  const orderImageDataUrl = profile.orderImageDataUrl?.trim();
  const hasOrderImage = Boolean(options?.includeImage !== false && orderImageDataUrl);
  const isRecognitionStage = (options?.stage || "recognition") === "recognition";
  const recognitionModel =
    process.env.OPENROUTER_RECOGNITION_MODEL || process.env.OPENROUTER_MODEL;
  const model =
    options?.model ||
    (isRecognitionStage
      ? hasOrderImage
        ? process.env.OPENROUTER_VISION_MODEL || recognitionModel || "openrouter/auto"
        : recognitionModel || "openrouter/auto"
      : hasOrderImage
        ? process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || "openrouter/auto"
        : process.env.OPENROUTER_MODEL || "openrouter/auto");
  const messageContent: OpenRouterChatContentPart[] = [
    {
      type: "text",
      text: prompt
    }
  ];

  if (hasOrderImage) {
    messageContent.push({
      type: "image_url",
      imageUrl: {
        url: orderImageDataUrl || "",
        detail: "high"
      }
    });
  }

  logEvent("info", "OpenRouter model call started", {
    area: "diet-agent",
    stage: options?.stage || "recognition",
    model,
    has_order_image: hasOrderImage,
    response_schema: options?.responseSchema?.name || "json_object"
  });

  return Sentry.startSpan(
    {
      name: options?.observationName || "openrouter-structured-generation",
      op: "ai.chat",
      attributes: {
        "ai.system": "openrouter",
        "ai.model": model,
        "diet.feature": "diet-recommendation",
        "diet.stage": options?.stage || "recognition",
        "diet.has_order_image": hasOrderImage,
        "diet.prompt_preview": prompt.slice(0, 600),
        "diet.order_text_preview": profile.orderText?.slice(0, 300) || ""
      }
    },
    async (span) => {
      try {
        const response = await client.chat.send({
          httpReferer: process.env.OPENROUTER_APP_URL,
          appTitle: process.env.OPENROUTER_APP_NAME || "Diet Agent Shanghai",
          chatGenerationParams: {
            model,
            messages: [
              {
                role: "user",
                content: messageContent
              }
            ],
            responseFormat: options?.responseSchema
              ? {
                  type: "json_schema",
                  jsonSchema: options.responseSchema
                }
              : {
                  type: "json_object"
                },
            plugins: [
              {
                id: "response-healing",
                enabled: true
              }
            ]
          }
        });

        const assistantText = extractAssistantText(response);
        setSpanAttributes(span, {
          "ai.response.preview": assistantText.slice(0, 600),
          "ai.usage": extractUsageDetails(response)
        });
        logEvent("info", "OpenRouter model call completed", {
          area: "diet-agent",
          stage: options?.stage || "recognition",
          model,
          response_length: assistantText.length,
          usage: extractUsageDetails(response)
        });

        return assistantText;
      } catch (error) {
        const debugPayload =
          error instanceof ModelResponseParseError ? error.debugPayload : undefined;
        const message =
          error instanceof Error ? error.message : "订单识别调用失败";

        span.setStatus({ code: 2, message });
        setSpanAttributes(span, {
          "ai.error": message,
          "ai.debug_payload": debugPayload
        });
        logEvent("error", "OpenRouter model call failed", {
          area: "diet-agent",
          stage: options?.stage || "recognition",
          model,
          error_name: error instanceof Error ? error.name : "UnknownError",
          error_message: message,
          has_debug_payload: Boolean(debugPayload)
        });

        if (debugPayload) {
          console.error("[diet-agent] unparseable model response", {
            stage: options?.stage || "recognition",
            observationName: options?.observationName || "openrouter-structured-generation",
            debugPayload
          });
        }

        throw error;
      }
    }
  );
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
  logEvent("warn", "JSON repair started", {
    area: "diet-agent",
    stage: "repair",
    error_name: error instanceof Error ? error.name : "UnknownError",
    error_message: error instanceof Error ? error.message : String(error),
    raw_text_length: rawText.length
  });

  return Sentry.startSpan(
    {
      name: "repair-invalid-json",
      op: "ai.repair",
      attributes: {
        "diet.stage": "repair",
        "diet.raw_text_preview": rawText.slice(0, 600),
        "diet.parse_error": error instanceof Error ? error.message : String(error)
      }
    },
    async (span) => {
      try {
        const repairedText = await generateChatText(
          {
            name: "",
            age: "",
            goals: ["maintain"],
            schedule: "balanced",
            preferences: [],
            conditions: [],
            trainingFrequency: "",
            notes: "",
            orderText: "",
            orderImageDataUrl: ""
          },
          buildRepairPrompt(rawText, error),
          {
            observationName: "repair-invalid-json-model-call",
            stage: "repair",
            includeImage: false,
            responseSchema: {
              name: "json_repair_result",
              strict: true,
              schema: {
                type: "object"
              }
            }
          }
        );
        const repaired = parseJsonWithSchema(repairedText, schema);

        span.setAttribute("diet.repaired", true);
        logEvent("info", "JSON repair completed", {
          area: "diet-agent",
          stage: "repair",
          repaired_text_length: repairedText.length
        });
        return repaired;
      } catch (repairError) {
        const message =
          repairError instanceof Error ? repairError.message : "JSON 修复失败";

        span.setStatus({ code: 2, message });
        span.setAttribute("diet.repaired", false);
        span.setAttribute("diet.error", message);
        logEvent("error", "JSON repair failed", {
          area: "diet-agent",
          stage: "repair",
          error_name: repairError instanceof Error ? repairError.name : "UnknownError",
          error_message: message
        });
        throw repairError;
      }
    }
  );
}

async function recognizeItems(profile: OrderRecipeRequest, options?: DietAgentOptions) {
  options?.onProgress?.({
    stage: "recognition_started",
    message: profile.orderImageDataUrl
      ? "正在识别订单截图中的食材。"
      : "正在解析订单文字中的食材。"
  });
  logEvent("info", "Ingredient recognition started", {
    area: "diet-agent",
    stage: "recognition",
    has_order_image: Boolean(profile.orderImageDataUrl),
    has_order_text: Boolean(profile.orderText?.trim())
  });

  const rawText = await generateChatText(profile, buildRecognitionPrompt(profile), {
    observationName: "order-ingredient-recognition-model-call",
    stage: "recognition",
    includeImage: true,
    responseSchema: recognizedItemsJsonSchema
  });

  try {
    const recognizedItems =
      parseJsonWithSchema(rawText, recognizedItemsResultSchema).recognizedItems;

    logEvent("info", "Ingredient recognition completed", {
      area: "diet-agent",
      stage: "recognition",
      recognized_count: recognizedItems.length
    });

    return recognizedItems;
  } catch (error) {
    const recognizedItems = (
      await repairJson(rawText, error, recognizedItemsResultSchema, options)
    ).recognizedItems;

    logEvent("info", "Ingredient recognition completed after repair", {
      area: "diet-agent",
      stage: "recognition",
      recognized_count: recognizedItems.length
    });

    return recognizedItems;
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
  logEvent("info", "Recipe generation started", {
    area: "diet-agent",
    stage: "recipe",
    recognized_count: recognizedItems.length,
    meal_plan_total: getMealPlanTotal(
      normalizeMealPlanCounts(profile.mealPlanCounts, profile.generationScope)
    )
  });

  return Sentry.startSpan(
    {
      name: "generate-recipe-plan",
      op: "ai.workflow",
      attributes: {
        "ai.model": process.env.OPENROUTER_MODEL || "openrouter/auto",
        "diet.stage": "recipe",
        "diet.profile": truncateForDebug(serializeProfileForTelemetry(profile)),
        "diet.recognized_count": recognizedItems.length,
        "diet.recognized_items": truncateForDebug(recognizedItems)
      }
    },
    async (span) => {
      let rawText = "";

      try {
        rawText = await generateChatText(profile, buildRecipePrompt(profile, recognizedItems), {
          observationName: "generate-recipe-plan-model-call",
          stage: "recipe",
          includeImage: false,
          responseSchema: dietPlanJsonSchema
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "菜谱生成失败";

        span.setStatus({ code: 2, message });
        span.setAttribute("diet.error", message);
        throw error;
      }

      try {
        const parsed = parseJsonWithSchema(rawText, dietPlanResultSchema);
        setSpanAttributes(span, {
          "diet.plan_title": parsed.planTitle,
          "diet.recipe_count": parsed.recipeSuggestions.length,
          "diet.repaired": false
        });
        logEvent("info", "Recipe generation completed", {
          area: "diet-agent",
          stage: "recipe",
          recipe_count: parsed.recipeSuggestions.length,
          repaired: false
        });
        return parsed;
      } catch (error) {
        const repaired = await repairJson(rawText, error, dietPlanResultSchema, options);
        setSpanAttributes(span, {
          "diet.plan_title": repaired.planTitle,
          "diet.recipe_count": repaired.recipeSuggestions.length,
          "diet.repaired": true
        });
        logEvent("info", "Recipe generation completed after repair", {
          area: "diet-agent",
          stage: "recipe",
          recipe_count: repaired.recipeSuggestions.length,
          repaired: true
        });
        return repaired;
      }
    }
  );
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
  logEvent("info", "Diet planner run started", {
    area: "diet-agent",
    stage: "started",
    has_order_input: hasOrderInput(profile),
    goals_count: profile.goals.length,
    preferences_count: profile.preferences.length,
    conditions_count: profile.conditions.length,
    meal_plan_total: getMealPlanTotal(
      normalizeMealPlanCounts(profile.mealPlanCounts, profile.generationScope)
    )
  });

  return Sentry.withScope((scope) => {
    scope.setTag("area", "diet-agent");
    scope.setTag("feature", "diet-recommendation");
    scope.setTag("agent", "recipe-recommendation");

    if (profile.name) {
      scope.setUser({ id: profile.name });
    }

    return Sentry.startSpan(
      {
        name: "diet-planner-run",
        op: "ai.workflow",
        attributes: {
          "diet.feature": "diet-recommendation",
          "diet.profile": truncateForDebug(serializeProfileForTelemetry(profile))
        }
      },
      async (span) => {
        try {
          const recognizedItems = hasOrderInput(profile)
            ? await recognizeItems(profile, options)
            : [];

          if (hasOrderInput(profile)) {
            options?.onProgress?.({
              stage: "recognition_completed",
              message: `已识别 ${recognizedItems.length} 个食材，开始生成菜谱。`,
              detail: {
                recognizedItems
              }
            });
          } else {
            options?.onProgress?.({
              stage: "recognition_completed",
              message: "未提供购物清单，正在直接生成菜谱和建议采购清单。"
            });
          }

          const plan = await generateRecipes(profile, recognizedItems, options);

          options?.onProgress?.({
            stage: "recipe_completed",
            message: `已生成 ${plan.recipeSuggestions.length} 道菜谱，正在整理结果。`
          });

          options?.onProgress?.({
            stage: "completed",
            message: "菜谱推荐已完成。"
          });

          setSpanAttributes(span, {
            "diet.recognized_count": recognizedItems.length,
            "diet.recipe_count": plan.recipeSuggestions.length,
            "diet.plan_title": plan.planTitle
          });
          logEvent("info", "Diet planner run completed", {
            area: "diet-agent",
            stage: "completed",
            recognized_count: recognizedItems.length,
            recipe_count: plan.recipeSuggestions.length
          });

          return plan;
        } catch (error) {
          const normalizedError =
            error instanceof Error ? error : new Error(String(error));
          const debugPayload =
            error instanceof ModelResponseParseError ? error.debugPayload : undefined;

          span.setStatus({ code: 2, message: normalizedError.message });
          setSpanAttributes(span, {
            "diet.error": normalizedError.message,
            "diet.debug_payload": debugPayload
          });
          logEvent("error", "Diet planner run failed", {
            area: "diet-agent",
            stage: "failed",
            error_name: normalizedError.name,
            error_message: normalizedError.message,
            has_debug_payload: Boolean(debugPayload)
          });

          captureException(normalizedError, {
            tags: {
              area: "diet-agent"
            },
            extra: {
              profile: serializeProfileForTelemetry(profile),
              debugPayload
            }
          });

          throw new Error(
            `推荐生成失败。系统已经尝试自动修复 JSON。原始原因：${normalizedError.message}`
          );
        }
      }
    );
  });
}
