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
  "blood-sugar"
] as const;

export const scheduleValues = ["busy", "balanced", "serious"] as const;

export type PreferenceValue = (typeof preferenceValues)[number];
export type ConditionValue = (typeof conditionValues)[number];
export type GoalValue = (typeof goalValues)[number];
export type ScheduleValue = (typeof scheduleValues)[number];

export type PlannerProfile = {
  name: string;
  age: string;
  goal: GoalValue;
  schedule: ScheduleValue;
  preferences: PreferenceValue[];
  conditions: ConditionValue[];
  trainingFrequency: string;
  notes: string;
};

export const plannerProfileSchema = z.object({
  name: z.string(),
  age: z.string(),
  goal: z.enum(goalValues),
  schedule: z.enum(scheduleValues),
  preferences: z.array(z.enum(preferenceValues)),
  conditions: z.array(z.enum(conditionValues)),
  trainingFrequency: z.string(),
  notes: z.string()
});

export const dietPlanResultSchema = z.object({
  planTitle: z.string(),
  planMode: z.string(),
  positioning: z.string(),
  goalSummary: z.string(),
  nutritionFocus: z.string(),
  executionStyle: z.string(),
  meals: z.array(
    z.object({
      name: z.string(),
      strategy: z.string(),
      example: z.string()
    })
  ),
  shoppingCategories: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          name: z.string(),
          reason: z.string()
        })
      )
    })
  ),
  executionTips: z.array(z.string()),
  cautions: z.array(z.string())
});

export type DietPlanResult = z.infer<typeof dietPlanResultSchema>;
