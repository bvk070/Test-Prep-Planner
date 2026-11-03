import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type PracticeQuestion = { question: string; answer: string };

export const studyRunsTable = pgTable(
  "study_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    sourceText: text("source_text").notNull(),
    status: text("status").notNull().default("processing"),
    extraction: jsonb("extraction"),
    planId: uuid("plan_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_runs_user_created_idx").on(table.userId, table.createdAt)],
);

export const studyPlansTable = pgTable(
  "study_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => studyRunsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    testDate: date("test_date", { mode: "string" }).notNull(),
    sourceText: text("source_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("study_plans_run_id_idx").on(table.runId),
    index("study_plans_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const planDaysTable = pgTable(
  "plan_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => studyPlansTable.id, { onDelete: "cascade" }),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  },
  (table) => [index("plan_days_plan_date_idx").on(table.planId, table.scheduledDate)],
);

export const checklistItemsTable = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => planDaysTable.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    topic: text("topic").notNull(),
    questions: jsonb("questions").$type<PracticeQuestion[]>().notNull().default(sql`'[]'::jsonb`),
    checked: boolean("checked").notNull().default(false),
  },
  (table) => [index("checklist_items_day_idx").on(table.dayId)],
);

export const runEventsTable = pgTable(
  "study_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => studyRunsTable.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    stepName: text("step_name").notNull(),
    status: text("status").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    detail: text("detail").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_run_events_run_created_idx").on(table.runId, table.createdAt)],
);

export type StudyRun = typeof studyRunsTable.$inferSelect;
export type StudyPlan = typeof studyPlansTable.$inferSelect;
export type PlanDay = typeof planDaysTable.$inferSelect;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
export type RunEvent = typeof runEventsTable.$inferSelect;
