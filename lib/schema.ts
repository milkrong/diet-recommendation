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
export const generationScopeValues = ["single-meal", "full-day"] as const;

export type PreferenceValue = (typeof preferenceValues)[number];
export type ConditionValue = (typeof conditionValues)[number];
export type GoalValue = (typeof goalValues)[number];
export type ScheduleValue = (typeof scheduleValues)[number];
export type GenerationScopeValue = (typeof generationScopeValues)[number];
export type MealPlanCounts = {
  breakfast: number;
  lunch: number;
  dinner: number;
};

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
  generationScope?: GenerationScopeValue;
  mealPlanCounts?: MealPlanCounts;
};

export const defaultMealPlanCounts: MealPlanCounts = {
  breakfast: 0,
  lunch: 0,
  dinner: 1
};

export function getMealPlanTotal(counts: MealPlanCounts) {
  return counts.breakfast + counts.lunch + counts.dinner;
}

export function normalizeMealPlanCounts(
  mealPlanCounts?: Partial<MealPlanCounts>,
  generationScope?: GenerationScopeValue
): MealPlanCounts {
  const counts = {
    breakfast: Math.max(0, Math.min(4, Math.trunc(Number(mealPlanCounts?.breakfast ?? 0)))),
    lunch: Math.max(0, Math.min(4, Math.trunc(Number(mealPlanCounts?.lunch ?? 0)))),
    dinner: Math.max(0, Math.min(4, Math.trunc(Number(mealPlanCounts?.dinner ?? 0))))
  };

  if (getMealPlanTotal(counts) > 0) {
    return counts;
  }

  return generationScope === "full-day"
    ? { breakfast: 1, lunch: 1, dinner: 1 }
    : defaultMealPlanCounts;
}

export const mealPlanCountsSchema = z
  .object({
    breakfast: z.coerce.number().int().min(0).max(4),
    lunch: z.coerce.number().int().min(0).max(4),
    dinner: z.coerce.number().int().min(0).max(4)
  })
  .refine((counts) => getMealPlanTotal(counts) >= 1, {
    message: "至少需要选择 1 顿饭"
  })
  .refine((counts) => getMealPlanTotal(counts) <= 12, {
    message: "一次最多生成 12 顿饭"
  });

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
  orderText: z.string().optional(),
  generationScope: z.enum(generationScopeValues).optional(),
  mealPlanCounts: mealPlanCountsSchema.optional()
};

export const orderRecipeRequestSchema = z.union([
  plannerProfileSchema.extend(orderInputSchema),
  legacyPlannerProfileSchema.and(z.object(orderInputSchema))
]);

export const recognizedItemSchema = z.object({
  name: z.string(),
  evidence: z.string(),
  confidence: z.string()
});

export const suggestedShoppingItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  reason: z.string()
});

export const dietPlanResultSchema = z.object({
  planTitle: z.string(),
  positioning: z.string(),
  goalSummary: z.string(),
  nutritionFocus: z.string(),
  executionStyle: z.string(),
  recognizedItems: z.array(recognizedItemSchema),
  suggestedShoppingList: z.array(suggestedShoppingItemSchema),
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
export type SuggestedShoppingItem = z.infer<typeof suggestedShoppingItemSchema>;
