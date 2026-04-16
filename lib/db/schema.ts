import {
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";
import type {
  ConditionValue,
  GoalValue,
  PreferenceValue,
  ScheduleValue
} from "@/lib/schema";

export const userProfiles = pgTable("user_profiles", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  name: text("name").notNull().default(""),
  age: text("age").notNull().default(""),
  goals: jsonb("goals").$type<GoalValue[]>().notNull(),
  schedule: text("schedule").$type<ScheduleValue>().notNull(),
  preferences: jsonb("preferences").$type<PreferenceValue[]>().notNull(),
  conditions: jsonb("conditions").$type<ConditionValue[]>().notNull(),
  trainingFrequency: text("training_frequency").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
});
