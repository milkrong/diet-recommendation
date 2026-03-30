import { tool } from "@openrouter/sdk";
import { z } from "zod/v4";
import { plannerProfileSchema, type PlannerProfile } from "@/lib/schema";

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
  execute: async (profile) => {
    const goalMap: Record<PlannerProfile["goal"], string> = {
      "fat-loss": "以减脂和饱腹感控制为主",
      "muscle-gain": "以增肌和蛋白质充足为主",
      maintain: "以均衡稳定为主",
      "blood-sugar": "以控糖和稳定血糖波动为主"
    };

    const scheduleMap: Record<PlannerProfile["schedule"], string> = {
      busy: "适合低准备成本、可批量备餐的方案",
      balanced: "适合常规家常饮食安排",
      serious: "适合较认真备餐和训练配合"
    };

    return {
      userLabel: profile.name || "这位用户",
      objective: goalMap[profile.goal],
      scheduleStyle: scheduleMap[profile.schedule],
      preferences: profile.preferences,
      conditions: profile.conditions,
      notes: profile.notes,
      trainingFrequency: profile.trainingFrequency || "未明确训练频率"
    };
  }
});

export const samsContextTool = tool({
  name: "build_sams_context",
  description:
    "Return planning constraints for building a Shanghai Sam's Club shopping list focused on bulk packs, freezer-friendly staples, and practical weekly execution.",
  inputSchema: z.object({
    schedule: z.enum(["busy", "balanced", "serious"]),
    householdHint: z.string().optional()
  }),
  outputSchema: z.object({
    city: z.string(),
    storeType: z.string(),
    shoppingPrinciples: z.array(z.string()),
    schedulePreference: z.string(),
    householdHint: z.string()
  }),
  execute: async ({ schedule, householdHint }) => {
    return {
      city: "上海",
      storeType: "山姆会员店",
      shoppingPrinciples: [
        "优先适合一周内消耗或可冷冻分装的大包装食材",
        "避免给单人用户推荐明显难以消耗的大量易坏品",
        "优先高复购率、适合工作日执行的基础食材",
        "购物清单需要说明每类食材的用途，而不是只列名字"
      ],
      schedulePreference:
        schedule === "busy"
          ? "推荐低处理成本、可直接组合的食材"
          : schedule === "serious"
            ? "可以推荐需要提前备餐但更高质量的食材"
            : "推荐家常稳定、易执行的折中方案",
      householdHint: householdHint || "默认按 1 到 2 人的日常采购思路规划"
    };
  }
});

export const defaultDietTools = [profileContextTool, samsContextTool] as const;
