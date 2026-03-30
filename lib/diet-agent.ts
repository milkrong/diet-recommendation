import {
  dietPlanResultSchema,
  plannerProfileSchema,
  type DietPlanResult,
  type PlannerProfile
} from "@/lib/schema";
import { createAgent } from "@/lib/openrouter-agent";
import { extractJsonObject } from "@/lib/openrouter-json";
import { defaultDietTools } from "@/lib/openrouter-tools";

const dietAgentInstructions = `
你是一名中文营养规划 agent，负责把用户画像转换成结构化、实用、克制、能执行的饮食计划。

你的要求：
- 推荐内容必须根据用户输入动态生成，不能复读固定模板。
- 在形成最终结果前，先调用 build_profile_context 和 build_sams_context 两个工具补全上下文。
- 需要考虑目标、口味偏好、疾病限制、日常节奏、训练频率和备注。
- 对疾病相关情况给出保守提醒，不要冒充医生，不要提供诊断或药物建议。
- 上海山姆购物清单要贴近真实采购习惯，强调大包装、囤货、复购、冷冻友好和家庭执行性。
- 如果信息不足，可以做合理假设，但必须在 cautions 中明确说出假设。
- 只输出 JSON，不要输出 markdown，不要加解释性前言或结尾。
`.trim();

function buildDietPrompt(profile: PlannerProfile) {
  return `
请根据以下用户画像生成一份个性化饮食计划，并严格返回 JSON 对象。

用户画像：
${JSON.stringify(profile, null, 2)}

JSON 必须符合下面的结构要求：
{
  "planTitle": "string",
  "planMode": "string",
  "positioning": "string",
  "goalSummary": "string",
  "nutritionFocus": "string",
  "executionStyle": "string",
  "meals": [
    {
      "name": "早餐/午餐/晚餐/加餐",
      "strategy": "为什么这样安排",
      "example": "真实可吃的一餐示例"
    }
  ],
  "shoppingCategories": [
    {
      "category": "分类名称",
      "items": [
        {
          "name": "商品或食材名称",
          "reason": "推荐原因"
        }
      ]
    }
  ],
  "executionTips": ["执行建议 1", "执行建议 2"],
  "cautions": ["风险提示 1", "风险提示 2"]
}

补充要求：
- meals 至少包含早餐、午餐、晚餐，必要时增加加餐。
- shoppingCategories 至少包含优质蛋白、蔬菜水果、主食粗粮、补充型食材四类。
- 每个分类至少给出 3 个 items。
- 所有内容使用简体中文。
  `.trim();
}

export async function runDietPlannerAgent(
  rawProfile: PlannerProfile
): Promise<DietPlanResult> {
  const profile = plannerProfileSchema.parse(rawProfile);

  const agent = createAgent({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: process.env.OPENROUTER_MODEL || "openrouter/auto",
    instructions: dietAgentInstructions,
    tools: [...defaultDietTools],
    maxSteps: 5,
    appUrl: process.env.OPENROUTER_APP_URL,
    appName: process.env.OPENROUTER_APP_NAME || "Diet Agent Shanghai"
  });

  const rawText = await agent.sendSync(buildDietPrompt(profile));
  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText);

  return dietPlanResultSchema.parse(parsed);
}
