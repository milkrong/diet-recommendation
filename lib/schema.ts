import { z } from "zod/v4";

export const preferenceValues = [
  "meat",
  "vegetable",
  "seafood",
  "spicy",
  "light"
] as const;

export const conditionValues = [
  "diabetes",
  "hypertension",
  "hyperlipidemia",
  "gout",
  "lactose"
] as const;

export const goalValues = [
  "fat-loss",
  "muscle-gain",
  "maintain",
  "blood-sugar",
  "high-protein",
  "low-protein",
  "low-fat",
  "low-sodium",
  "low-carb",
  "high-fiber",
  "digestive-friendly"
] as const;

export const scheduleValues = ["busy", "balanced", "serious"] as const;

export type PreferenceValue = (typeof preferenceValues)[number];
export type ConditionValue = (typeof conditionValues)[number];
export type GoalValue = (typeof goalValues)[number];
export type ScheduleValue = (typeof scheduleValues)[number];

export type PlannerProfile = {
  name: string;
  age: string;
  goals: GoalValue[];
  schedule: ScheduleValue;
  preferences: PreferenceValue[];
  conditions: ConditionValue[];
  trainingFrequency: string;
  notes: string;
};

export type OrderRecipeRequest = PlannerProfile & {
  orderImageDataUrl?: string;
  orderText?: string;
};

export const plannerProfileSchema = z.object({
  name: z.string(),
  age: z.string(),
  goals: z.array(z.enum(goalValues)).min(1),
  schedule: z.enum(scheduleValues),
  preferences: z.array(z.enum(preferenceValues)),
  conditions: z.array(z.enum(conditionValues)),
  trainingFrequency: z.string(),
  notes: z.string()
});

export const legacyPlannerProfileSchema = plannerProfileSchema
  .omit({ goals: true })
  .extend({
    goal: z.enum(goalValues)
  })
  .transform((value) => {
    const { goal, ...profile } = value;
    return {
      ...profile,
      goals: [goal]
    };
  });

const orderInputSchema = {
  orderImageDataUrl: z.string().optional(),
  orderText: z.string().optional()
};

export const orderRecipeRequestSchema = z.union([
  plannerProfileSchema.extend(orderInputSchema),
  legacyPlannerProfileSchema.and(z.object(orderInputSchema))
]).refine(
  (value) =>
    Boolean(value.orderImageDataUrl?.trim()) || Boolean(value.orderText?.trim()),
  {
    message: "请上传订单截图，或粘贴买菜订单文字。"
  }
);

export const recognizedItemSchema = z.object({
  name: z.string(),
  evidence: z.string(),
  confidence: z.string()
});

export const dietPlanResultSchema = z.object({
  planTitle: z.string(),
  positioning: z.string(),
  goalSummary: z.string(),
  nutritionFocus: z.string(),
  executionStyle: z.string(),
  recognizedItems: z.array(recognizedItemSchema),
  recipeSuggestions: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      fitReason: z.string(),
      ingredientsToUse: z.array(z.string()),
      steps: z.array(z.string())
    })
  ),
  executionTips: z.array(z.string()),
  cautions: z.array(z.string())
});

export type DietPlanResult = z.infer<typeof dietPlanResultSchema>;
export type RecognizedItem = z.infer<typeof recognizedItemSchema>;
