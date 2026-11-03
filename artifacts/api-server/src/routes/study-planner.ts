import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type RequestHandler, type Response } from "express";
import {
  CreateRunBody,
  ContinueRunBody,
  ContinueRunParams,
  GetPlanParams,
  GetPlanResponse,
  GetRunParams,
  GetRunResponse,
  ListPlansResponse,
  ListRunsResponse,
  MarkChecklistShownParams,
  RetryRunQuestionsParams,
  UpdatePlanItemBody,
  UpdatePlanItemParams,
  UpdatePlanItemResponse,
} from "@workspace/api-zod";
import {
  checklistItemsTable,
  db,
  planDaysTable,
  runEventsTable,
  studyPlansTable,
  studyRunsTable,
} from "@workspace/db";
import {
  buildSchedule,
  dateIsBeforeToday,
  extractSyllabus,
  extractedSyllabusSchema,
  fallbackParseSyllabus,
  generatePracticeQuestions,
  topicKey,
} from "../lib/studyPlanner";

const router: IRouter = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.locals.userId = userId;
  next();
};

router.use(requireAuth);

function userId(res: Response): string {
  return res.locals.userId as string;
}

function setEventStreamHeaders(res: Response, runId: string): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Run-Id", runId);
  res.flushHeaders();
}

function sendSse(res: Response, payload: unknown): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

async function persistRunEvent(
  runId: string,
  stepId: string,
  stepName: string,
  status: "started" | "finished" | "failed" | "skipped",
  durationMs: number,
  detail: string,
): Promise<{
  id: string;
  stepId: string;
  stepName: string;
  status: "started" | "finished" | "failed" | "skipped";
  durationMs: number;
  detail: string;
  createdAt: string;
}> {
  const [saved] = await db
    .insert(runEventsTable)
    .values({ runId, stepId, stepName, status, durationMs, detail })
    .returning();
  return {
    ...saved,
    status,
    createdAt: saved.createdAt.toISOString(),
  };
}

async function sendEvent(
  res: Response,
  runId: string,
  stepId: string,
  stepName: string,
  status: "started" | "finished" | "failed" | "skipped",
  durationMs: number,
  detail: string,
): Promise<void> {
  const event = await persistRunEvent(runId, stepId, stepName, status, durationMs, detail);
  sendSse(res, { event, runId });
}

async function measuredStep<T>(
  res: Response,
  runId: string,
  stepId: string,
  stepName: string,
  startDetail: string,
  action: () => Promise<T>,
  successDetail: (value: T) => string,
): Promise<T> {
  await sendEvent(res, runId, stepId, stepName, "started", 0, startDetail);
  const startedAt = performance.now();
  try {
    const value = await action();
    await sendEvent(
      res,
      runId,
      stepId,
      stepName,
      "finished",
      Math.max(0, Math.round(performance.now() - startedAt)),
      successDetail(value),
    );
    return value;
  } catch (error) {
    await sendEvent(
      res,
      runId,
      stepId,
      stepName,
      "failed",
      Math.max(0, Math.round(performance.now() - startedAt)),
      error instanceof Error ? error.message : "The step could not finish.",
    );
    throw error;
  }
}

function endStream(res: Response, extra?: Record<string, unknown>): void {
  if (!res.writableEnded) {
    if (extra) sendSse(res, extra);
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function markRunFailed(res: Response, runId: string, detail: string): Promise<void> {
  await db.update(studyRunsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(studyRunsTable.id, runId));
  sendSse(res, { type: "error", runId, detail });
  endStream(res);
}

async function createPlanRows(
  run: typeof studyRunsTable.$inferSelect,
  schedule: ReturnType<typeof buildSchedule>,
  testDate: string,
  questions: Map<string, Array<{ question: string; answer: string }>>,
): Promise<string> {
  const titleSubjects = [...new Set(schedule.map((item) => item.subject.trim()).filter(Boolean))];
  const title = `${titleSubjects.slice(0, 2).join(" & ") || "Study"} test prep`;
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(studyPlansTable)
      .values({
        runId: run.id,
        userId: run.userId,
        title,
        testDate,
        sourceText: run.sourceText,
      })
      .returning();

    const grouped = new Map<string, typeof schedule>();
    for (const topic of schedule) {
      const group = grouped.get(topic.date) ?? [];
      group.push(topic);
      grouped.set(topic.date, group);
    }
    for (const [scheduledDate, items] of grouped) {
      const [day] = await tx
        .insert(planDaysTable)
        .values({ planId: plan.id, scheduledDate })
        .returning();
      await tx.insert(checklistItemsTable).values(
        items.map((item) => ({
          dayId: day.id,
          subject: item.subject,
          topic: item.topic,
          questions: questions.get(topicKey(item.subject, item.topic)) ?? [],
        })),
      );
    }
    await tx
      .update(studyRunsTable)
      .set({ planId: plan.id, status: "complete", updatedAt: new Date() })
      .where(eq(studyRunsTable.id, run.id));
    return plan.id;
  });
}

async function finishPlan(
  res: Response,
  run: typeof studyRunsTable.$inferSelect,
  subjects: Array<{ subject: string; topics: string[] }>,
  testDate: string,
  usedFallback: boolean,
): Promise<void> {
  const schedule = await measuredStep(
    res,
    run.id,
    "06",
    "Plan built",
    "Spacing the topics across the days before the test.",
    async () => buildSchedule(subjects, testDate),
    (items) => `Placed ${items.length} topics across ${new Set(items.map((item) => item.date)).size} practice days.`,
  );

  let questions = new Map<string, Array<{ question: string; answer: string }>>();
  let questionsAvailable = true;
  try {
    questions = await measuredStep(
      res,
      run.id,
      "07",
      "AI questions",
      "Writing two short practice questions for each topic.",
      () =>
        generatePracticeQuestions(
          schedule.map(({ subject, topic }) => ({ subject, topic })),
        ),
      (result) => `Created two questions for ${result.size} topics.`,
    );
  } catch {
    questionsAvailable = false;
    await sendEvent(
      res,
      run.id,
      "07",
      "AI questions",
      "skipped",
      0,
      "Question generation did not finish. The plan will be saved without questions so you can retry.",
    );
  }

  const planId = await measuredStep(
    res,
    run.id,
    "08",
    "Plan saved",
    "Saving the schedule, questions, and checklist progress.",
    () => createPlanRows(run, schedule, testDate, questions),
    () => "Saved the study plan and checklist to your account.",
  );

  const finalStatus = questionsAvailable && !usedFallback ? "complete" : "partial";
  await db
    .update(studyRunsTable)
    .set({ status: finalStatus, planId, updatedAt: new Date() })
    .where(eq(studyRunsTable.id, run.id));

  await persistRunEvent(
    run.id,
    "09",
    "Checklist shown",
    "started",
    0,
    "The saved checklist is ready to display. Open the checklist to complete this step.",
  );
  endStream(res, { type: "plan", runId: run.id, planId });
}

async function requestTestDate(res: Response, runId: string, reason: string): Promise<void> {
  await db
    .update(studyRunsTable)
    .set({ status: "needs_date", updatedAt: new Date() })
    .where(eq(studyRunsTable.id, runId));
  endStream(res, { type: "needs_date", runId, detail: reason });
}

router.get("/plans", async (_req, res): Promise<void> => {
  const plans = await db
    .select()
    .from(studyPlansTable)
    .where(eq(studyPlansTable.userId, userId(res)))
    .orderBy(desc(studyPlansTable.createdAt));
  const counts = new Map<string, { completedCount: number; totalCount: number }>();
  if (plans.length) {
    const rows = await db
      .select({ planId: planDaysTable.planId, checked: checklistItemsTable.checked })
      .from(planDaysTable)
      .innerJoin(checklistItemsTable, eq(checklistItemsTable.dayId, planDaysTable.id))
      .where(inArray(planDaysTable.planId, plans.map((plan) => plan.id)));
    for (const row of rows) {
      const count = counts.get(row.planId) ?? { completedCount: 0, totalCount: 0 };
      count.totalCount += 1;
      if (row.checked) count.completedCount += 1;
      counts.set(row.planId, count);
    }
  }
  res.json(
    ListPlansResponse.parse(
      plans.map((plan) => ({
        id: plan.id,
        title: plan.title,
        testDate: plan.testDate,
        createdAt: plan.createdAt.toISOString(),
        runId: plan.runId,
        ...(counts.get(plan.id) ?? { completedCount: 0, totalCount: 0 }),
      })),
    ),
  );
});

router.get("/plans/:planId", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [plan] = await db
    .select()
    .from(studyPlansTable)
    .where(and(eq(studyPlansTable.id, params.data.planId), eq(studyPlansTable.userId, userId(res))));
  if (!plan) {
    res.status(404).json({ error: "Plan not found." });
    return;
  }
  const days = await db
    .select()
    .from(planDaysTable)
    .where(eq(planDaysTable.planId, plan.id))
    .orderBy(asc(planDaysTable.scheduledDate));
  const items = days.length
    ? await db
        .select()
        .from(checklistItemsTable)
        .where(inArray(checklistItemsTable.dayId, days.map((day) => day.id)))
    : [];
  const itemsByDay = new Map<string, typeof items>();
  for (const item of items) {
    const group = itemsByDay.get(item.dayId) ?? [];
    group.push(item);
    itemsByDay.set(item.dayId, group);
  }
  res.json(
    GetPlanResponse.parse({
      id: plan.id,
      title: plan.title,
      testDate: plan.testDate,
      createdAt: plan.createdAt.toISOString(),
      sourceText: plan.sourceText,
      runId: plan.runId,
      days: days.map((day) => ({
        id: day.id,
        date: day.scheduledDate,
        items: (itemsByDay.get(day.id) ?? []).map((item) => ({
          id: item.id,
          subject: item.subject,
          topic: item.topic,
          checked: item.checked,
          questions: item.questions,
        })),
      })),
    }),
  );
});

router.patch("/plans/:planId/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdatePlanItemParams.safeParse(req.params);
  const body = UpdatePlanItemBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const ownedItem = await db
    .select({ id: checklistItemsTable.id })
    .from(checklistItemsTable)
    .innerJoin(planDaysTable, eq(planDaysTable.id, checklistItemsTable.dayId))
    .innerJoin(studyPlansTable, eq(studyPlansTable.id, planDaysTable.planId))
    .where(
      and(
        eq(checklistItemsTable.id, params.data.itemId),
        eq(studyPlansTable.id, params.data.planId),
        eq(studyPlansTable.userId, userId(res)),
      ),
    );
  if (!ownedItem.length) {
    res.status(404).json({ error: "Checklist item not found." });
    return;
  }
  const [updated] = await db
    .update(checklistItemsTable)
    .set({ checked: body.data.checked })
    .where(eq(checklistItemsTable.id, params.data.itemId))
    .returning();
  res.json(
    UpdatePlanItemResponse.parse({
      id: updated.id,
      subject: updated.subject,
      topic: updated.topic,
      checked: updated.checked,
      questions: updated.questions,
    }),
  );
});

router.post("/runs", async (req, res): Promise<void> => {
  const body = CreateRunBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [run] = await db
    .insert(studyRunsTable)
    .values({ userId: userId(res), sourceText: body.data.sourceText, status: "processing" })
    .returning();
  setEventStreamHeaders(res, run.id);
  sendSse(res, { type: "run", id: run.id, runId: run.id });

  try {
    await measuredStep(
      res,
      run.id,
      "01",
      "Note received",
      "Receiving the pasted school note.",
      async () => body.data.sourceText.length,
      (length) => `Received ${length.toLocaleString()} characters.`,
    );
    await measuredStep(
      res,
      run.id,
      "02",
      "Draft saved to DB",
      "Saving the original note before any AI call.",
      async () => run.id,
      () => "Saved the original syllabus and run record before starting AI.",
    );

    try {
      await measuredStep(
        res,
        run.id,
        "03",
        "Input checked",
        "Checking that the school note contains readable text.",
        async () => {
          if (body.data.sourceText.trim().length < 4 || !/[a-z]/i.test(body.data.sourceText)) {
            throw new Error("Add a few words about the subjects or topics in the test.");
          }
          return body.data.sourceText.trim().length;
        },
        (length) => `Input is readable (${length.toLocaleString()} non-space characters).`,
      );
    } catch (error) {
      await markRunFailed(res, run.id, error instanceof Error ? error.message : "The note could not be read.");
      return;
    }

    let extracted: ReturnType<typeof extractedSyllabusSchema.parse>;
    let usedFallback = false;
    await sendEvent(res, run.id, "04", "AI extraction", "started", 0, "Finding the test date, subjects, and topics.");
    const extractionStartedAt = performance.now();
    try {
      extracted = await extractSyllabus(body.data.sourceText);
      await sendEvent(
        res,
        run.id,
        "04",
        "AI extraction",
        "finished",
        Math.max(0, Math.round(performance.now() - extractionStartedAt)),
        `Found ${extracted.subjects.length} subjects and ${extracted.subjects.reduce((total, subject) => total + subject.topics.length, 0)} topics.`,
      );
    } catch (error) {
      usedFallback = true;
      await sendEvent(
        res,
        run.id,
        "04",
        "AI extraction",
        "failed",
        Math.max(0, Math.round(performance.now() - extractionStartedAt)),
        `${error instanceof Error ? error.message : "AI extraction failed."} Retrying once, then using the rule-based parser.`,
      );
      extracted = fallbackParseSyllabus(body.data.sourceText);
      await sendEvent(
        res,
        run.id,
        "04",
        "AI extraction",
        "finished",
        0,
        `Fallback used: found ${extracted.subjects.length} subject lines and ${extracted.subjects.reduce((total, subject) => total + subject.topics.length, 0)} topics.`,
      );
    }

    try {
      await measuredStep(
        res,
        run.id,
        "05",
        "Extraction validated",
        "Checking the extracted syllabus fields before planning.",
        async () => {
          const checked = extractedSyllabusSchema.parse(extracted);
          if (!checked.subjects.some((subject) => subject.topics.length)) {
            throw new Error("No topics were found. Add a subject and at least one topic.");
          }
          return checked;
        },
        (value) => `Validated ${value.subjects.length} subjects and ${value.subjects.reduce((total, subject) => total + subject.topics.length, 0)} topics.`,
      );
    } catch (error) {
      await markRunFailed(res, run.id, error instanceof Error ? error.message : "The extracted topics were invalid.");
      return;
    }

    await db
      .update(studyRunsTable)
      .set({ extraction: extracted, updatedAt: new Date() })
      .where(eq(studyRunsTable.id, run.id));
    if (!extracted.testDate) {
      await requestTestDate(res, run.id, "No test date was found. Choose the date to continue; the note is saved.");
      return;
    }
    if (dateIsBeforeToday(extracted.testDate)) {
      await requestTestDate(res, run.id, "The extracted test date has passed. Choose a future date to continue.");
      return;
    }
    await finishPlan(res, run, extracted.subjects, extracted.testDate, usedFallback);
  } catch (error) {
    await markRunFailed(res, run.id, error instanceof Error ? error.message : "The plan could not be created.");
  }
});

router.post("/runs/:runId/continue", async (req, res): Promise<void> => {
  const params = ContinueRunParams.safeParse(req.params);
  const body = ContinueRunBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const testDate = body.data.testDate instanceof Date
    ? body.data.testDate.toISOString().slice(0, 10)
    : body.data.testDate;
  if (dateIsBeforeToday(testDate)) {
    res.status(400).json({ error: "Choose today or a future date." });
    return;
  }
  const [run] = await db
    .select()
    .from(studyRunsTable)
    .where(and(eq(studyRunsTable.id, params.data.runId), eq(studyRunsTable.userId, userId(res))));
  const parsed = extractedSyllabusSchema.safeParse(run?.extraction);
  if (!run || !parsed.success || run.status !== "needs_date") {
    res.status(404).json({ error: "This saved run is not waiting for a date." });
    return;
  }
  const extraction = { ...parsed.data, testDate };
  await db
    .update(studyRunsTable)
    .set({ extraction, status: "processing", updatedAt: new Date() })
    .where(eq(studyRunsTable.id, run.id));
  setEventStreamHeaders(res, run.id);
  sendSse(res, { type: "run", id: run.id, runId: run.id });
  try {
    const fallbackEvents = await db
      .select()
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, run.id), eq(runEventsTable.stepId, "04"), eq(runEventsTable.status, "finished")));
    const usedFallback = fallbackEvents.some((event) => event.detail.startsWith("Fallback used:"));
    await finishPlan(res, run, extraction.subjects, testDate, usedFallback);
  } catch (error) {
    await markRunFailed(res, run.id, error instanceof Error ? error.message : "The plan could not be created.");
  }
});

router.post("/runs/:runId/retry-questions", async (req, res): Promise<void> => {
  const params = RetryRunQuestionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db
    .select()
    .from(studyRunsTable)
    .where(and(eq(studyRunsTable.id, params.data.runId), eq(studyRunsTable.userId, userId(res))));
  if (!run?.planId) {
    res.status(404).json({ error: "A saved plan for this run was not found." });
    return;
  }
  const [plan] = await db
    .select()
    .from(studyPlansTable)
    .where(and(eq(studyPlansTable.id, run.planId), eq(studyPlansTable.userId, userId(res))));
  if (!plan) {
    res.status(404).json({ error: "A saved plan for this run was not found." });
    return;
  }
  const items = await db
    .select()
    .from(planDaysTable)
    .innerJoin(checklistItemsTable, eq(checklistItemsTable.dayId, planDaysTable.id))
    .where(eq(planDaysTable.planId, plan.id));
  setEventStreamHeaders(res, run.id);
  try {
    const topics = items.map(({ checklist_items: item }) => ({ subject: item.subject, topic: item.topic }));
    const questions = await measuredStep(
      res,
      run.id,
      "07",
      "AI questions",
      "Retrying questions for the saved plan.",
      () => generatePracticeQuestions(topics),
      (result) => `Created two questions for ${result.size} topics.`,
    );
    await measuredStep(
      res,
      run.id,
      "08",
      "Plan saved",
      "Saving the new questions to the existing checklist.",
      async () => {
        for (const { checklist_items: item } of items) {
          await db
            .update(checklistItemsTable)
            .set({ questions: questions.get(topicKey(item.subject, item.topic)) ?? [] })
            .where(eq(checklistItemsTable.id, item.id));
        }
        await db.update(studyRunsTable).set({ status: "complete", updatedAt: new Date() }).where(eq(studyRunsTable.id, run.id));
        return items.length;
      },
      (count) => `Saved new questions for ${count} checklist topics.`,
    );
    const extractionEvents = await db
      .select()
      .from(runEventsTable)
      .where(and(eq(runEventsTable.runId, run.id), eq(runEventsTable.stepId, "04"), eq(runEventsTable.status, "finished")));
    const usedFallback = extractionEvents.some((event) => event.detail.startsWith("Fallback used:"));
    await db
      .update(studyRunsTable)
      .set({ status: usedFallback ? "partial" : "complete", updatedAt: new Date() })
      .where(eq(studyRunsTable.id, run.id));
    endStream(res, { type: "plan", runId: run.id, planId: plan.id });
  } catch (error) {
    await db.update(studyRunsTable).set({ status: "partial", updatedAt: new Date() }).where(eq(studyRunsTable.id, run.id));
    sendSse(res, { type: "error", runId: run.id, detail: error instanceof Error ? error.message : "Question generation could not finish." });
    endStream(res);
  }
});

router.post("/runs/:runId/checklist-shown", async (req, res): Promise<void> => {
  const params = MarkChecklistShownParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db
    .select()
    .from(studyRunsTable)
    .where(and(eq(studyRunsTable.id, params.data.runId), eq(studyRunsTable.userId, userId(res))));
  if (!run?.planId) {
    res.status(404).json({ error: "The saved checklist was not found." });
    return;
  }
  const prior = await db
    .select()
    .from(runEventsTable)
    .where(and(eq(runEventsTable.runId, run.id), eq(runEventsTable.stepId, "09"), eq(runEventsTable.status, "finished")));
  if (prior.length) {
    res.sendStatus(204);
    return;
  }
  const [started] = await db
    .select()
    .from(runEventsTable)
    .where(and(eq(runEventsTable.runId, run.id), eq(runEventsTable.stepId, "09"), eq(runEventsTable.status, "started")))
    .orderBy(desc(runEventsTable.createdAt))
    .limit(1);
  const durationMs = started ? Math.max(0, Date.now() - started.createdAt.getTime()) : 0;
  await sendEvent(
    res,
    run.id,
    "09",
    "Checklist shown",
    "finished",
    durationMs,
    "The saved checklist opened in the browser.",
  );
  res.sendStatus(204);
});

router.get("/runs", async (_req, res): Promise<void> => {
  const runs = await db
    .select()
    .from(studyRunsTable)
    .where(eq(studyRunsTable.userId, userId(res)))
    .orderBy(desc(studyRunsTable.createdAt))
    .limit(20);
  res.json(ListRunsResponse.parse(runs.map((run) => ({
    id: run.id,
    status: run.status,
    sourceText: run.sourceText,
    planId: run.planId,
    createdAt: run.createdAt.toISOString(),
  }))));
});

router.get("/runs/:runId", async (req, res): Promise<void> => {
  const params = GetRunParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [run] = await db
    .select()
    .from(studyRunsTable)
    .where(and(eq(studyRunsTable.id, params.data.runId), eq(studyRunsTable.userId, userId(res))));
  if (!run) {
    res.status(404).json({ error: "Run not found." });
    return;
  }
  const events = await db
    .select()
    .from(runEventsTable)
    .where(eq(runEventsTable.runId, run.id))
    .orderBy(asc(runEventsTable.createdAt));
  res.json(
    GetRunResponse.parse({
      id: run.id,
      status: run.status,
      sourceText: run.sourceText,
      planId: run.planId,
      createdAt: run.createdAt.toISOString(),
      events: events.map((event) => ({
        id: event.id,
        stepId: event.stepId,
        stepName: event.stepName,
        status: event.status,
        durationMs: event.durationMs,
        detail: event.detail,
        createdAt: event.createdAt.toISOString(),
      })),
    }),
  );
});

export default router;
