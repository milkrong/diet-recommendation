import { tool } from "@openrouter/sdk";
import { z } from "zod/v4";
import { plannerProfileSchema, type PlannerProfile } from "@/lib/schema";

const goalMap: Record<PlannerProfile["goals"][number], string> = {
  "fat-loss": "以减脂和饱腹感控制为主",
  "muscle-gain": "以增肌和蛋白质充足为主",
  maintain: "以均衡稳定为主",
  "blood-sugar": "以控糖和稳定血糖波动为主",
  "high-protein": "以提高蛋白质摄入和增强饱腹感为主",
  "low-protein": "以控制蛋白质负担、选择适量优质蛋白为主",
  "low-fat": "以减少油脂和高脂食材摄入为主",
  "low-sodium": "以低盐、少加工调味和清淡烹饪为主",
  "low-carb": "以减少精制碳水、提高蔬菜和蛋白比例为主",
  "high-fiber": "以提高膳食纤维、蔬菜豆类和粗粮占比为主",
  "digestive-friendly": "以温和、易消化、少刺激的烹饪方式为主"
};

const scheduleMap: Record<PlannerProfile["schedule"], string> = {
  busy: "适合低准备成本、可批量备餐的方案",
  balanced: "适合常规家常饮食安排",
  serious: "适合较认真备餐和训练配合"
};

export function buildProfileContext(profile: PlannerProfile) {
  return {
    userLabel: profile.name || "这位用户",
    objective: profile.goals.map((goal) => goalMap[goal]).join("；"),
    scheduleStyle: scheduleMap[profile.schedule],
    preferences: profile.preferences,
    conditions: profile.conditions,
    notes: profile.notes,
    trainingFrequency: profile.trainingFrequency || "未明确训练频率"
  };
}

export function buildRecipeContext(input: {
  schedule: PlannerProfile["schedule"];
  trainingFrequency?: string;
  notes?: string;
}) {
  const { schedule, trainingFrequency, notes } = input;

  return {
    cookingStyle:
      schedule === "busy"
        ? "优先一锅菜、快炒、蒸煮、空气炸锅和 20 分钟内完成的菜谱"
        : schedule === "serious"
          ? "可以接受稍复杂、需要提前腌制或备料的菜谱"
          : "以家常、稳定、容易复现的菜谱为主",
    planningPrinciples: [
      "优先使用截图里已经买到的食材",
      "允许补充少量基础调味料，但不要依赖大量额外采购",
      "菜谱要尽量可执行、像真实家常菜",
      "如果截图里食材识别不完整，要在结果中明确说明假设"
    ],
    schedulePreference:
      schedule === "busy"
        ? "推荐低处理成本和剩菜也容易继续利用的做法"
        : schedule === "serious"
          ? "可以结合训练或一周备餐安排更完整的菜谱组合"
          : "推荐家常稳定、适合工作日反复执行的折中方案",
    trainingHint: trainingFrequency || "未明确训练频率",
    notesHint: notes || "没有额外备注"
  };
}

export const profileContextTool = tool({
  name: "build_profile_context",
  description:
    "Normalize the user's goal, preferences, health constraints, and lifestyle into a concise planning context.",
  inputSchema: plannerProfileSchema,
  outputSchema: z.object({
    userLabel: z.string(),
    objective: z.string(),
    scheduleStyle: z.string(),
    preferences: z.array(z.string()),
    conditions: z.array(z.string()),
    notes: z.string(),
    trainingFrequency: z.string()
  }),
  execute: async (profile) => buildProfileContext(profile)
});

export const recipeContextTool = tool({
  name: "build_recipe_context",
  description:
    "Return practical recipe-planning constraints based on the user's daily rhythm and the fact that recipes should preferentially use ingredients already purchased in the grocery app order.",
  inputSchema: z.object({
    schedule: z.enum(["busy", "balanced", "serious"]),
    trainingFrequency: z.string().optional(),
    notes: z.string().optional()
  }),
  outputSchema: z.object({
    cookingStyle: z.string(),
    planningPrinciples: z.array(z.string()),
    schedulePreference: z.string(),
    trainingHint: z.string(),
    notesHint: z.string()
  }),
  execute: async ({ schedule, trainingFrequency, notes }) =>
    buildRecipeContext({ schedule, trainingFrequency, notes })
});

export const defaultDietTools = [
  profileContextTool,
  recipeContextTool
] as const;
