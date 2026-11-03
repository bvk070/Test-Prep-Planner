import { z } from "zod/v4";
import { openai } from "@workspace/integrations-openai-ai-server";

export const extractedSyllabusSchema = z.object({
  testDate: z.string().nullable().refine(
    (value) => value === null || isValidDateOnly(value),
    "The extracted test date must be a real calendar date.",
  ),
  subjects: z.array(
    z.object({
      subject: z.string().trim().min(1),
      topics: z.array(z.string().trim().min(1)).min(1),
    }),
  ).min(1),
});

const questionSetSchema = z.object({
  items: z.array(
    z.object({
      subject: z.string().trim().min(1),
      topic: z.string().trim().min(1),
      questions: z.array(
        z.object({
          question: z.string().trim().min(1),
          answer: z.string().trim().min(1),
        }),
      ).length(2),
    }),
  ),
});

export type ExtractedSyllabus = z.infer<typeof extractedSyllabusSchema>;
export type PlannedTopic = {
  subject: string;
  topic: string;
  date: string;
  questions: Array<{ question: string; answer: string }>;
};

export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateJson<T = unknown>(
  prompt: string,
  validate: (value: unknown) => T = (value) => value as T,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await openai.chat.completions.create(
        {
          model: "gpt-5.6-luna",
          max_completion_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Return only a valid JSON object. Do not include markdown, comments, or text outside the JSON.",
            },
            { role: "user", content: prompt },
          ],
        },
        { timeout: 25000, maxRetries: 0 },
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("The AI response did not contain JSON.");
      return validate(JSON.parse(content) as unknown);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed.");
}

export async function extractSyllabus(sourceText: string): Promise<ExtractedSyllabus> {
  return generateJson(
    `Read this school test syllabus. Return exactly this JSON shape: {"testDate":"YYYY-MM-DD or null","subjects":[{"subject":"short subject name","topics":["one topic"]}]}. Extract an explicit test date only; if none is present, use null. If the year is omitted but a month and day are explicit, use the nearest upcoming occurrence. Separate mixed subjects and make each topic concise. Do not invent topics.\\n\\nSyllabus:\\n${sourceText}`,
    (value) => extractedSyllabusSchema.parse(value),
  );
}

export function parseDateFromText(sourceText: string): string | null {
  const iso = sourceText.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if (iso && isValidDateOnly(iso[0])) return iso[0];

  const monthNames =
    "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
  const monthDay = new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?\\b`, "i");
  const match = sourceText.match(monthDay);
  if (match) {
    const monthNumber: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = monthNumber[match[1].slice(0, 3).toLowerCase()];
    const day = Number(match[2]);
    let year = Number(match[3] ?? new Date().getUTCFullYear());
    let parsed = new Date(Date.UTC(year, month, day));
    const isExactDate = (value: Date) =>
      value.getUTCFullYear() === year &&
      value.getUTCMonth() === month &&
      value.getUTCDate() === day;
    if (isExactDate(parsed)) {
      if (!match[3] && parsed.getTime() < startOfTodayUtc()) {
        year += 1;
        parsed = new Date(Date.UTC(year, month, day));
      }
      const dateOnly = parsed.toISOString().slice(0, 10);
      if (isValidDateOnly(dateOnly)) return dateOnly;
    }
  }

  const numeric = sourceText.match(/\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?:[/-](20\d{2}))?\b/);
  if (numeric) {
    const year = Number(numeric[3] ?? new Date().getUTCFullYear());
    const parsed = new Date(Date.UTC(year, Number(numeric[1]) - 1, Number(numeric[2])));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === Number(numeric[1]) - 1 &&
      parsed.getUTCDate() === Number(numeric[2])
    ) {
      if (!numeric[3] && parsed.getTime() < startOfTodayUtc()) {
        parsed.setUTCFullYear(parsed.getUTCFullYear() + 1);
      }
      const dateOnly = parsed.toISOString().slice(0, 10);
      if (isValidDateOnly(dateOnly)) return dateOnly;
    }
  }
  return null;
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function fallbackParseSyllabus(sourceText: string): ExtractedSyllabus {
  const subjects: ExtractedSyllabus["subjects"] = [];
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*+\-\d.)]+/, "").trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/\b(test|exam|assessment)\b/i.test(line) && parseDateFromText(line)) continue;
    const separator = line.indexOf(":");
    if (separator > 0) {
      const subject = line.slice(0, separator).trim();
      const topics = line
        .slice(separator + 1)
        .split(/[,;|•]+/)
        .map((topic) => topic.trim().replace(/\b(?:test|exam)\s+(?:on|date)\b.*$/i, "").trim())
        .filter((topic) => topic.length > 1);
      if (subject && topics.length) subjects.push({ subject, topics });
    } else if (!/\b(test|exam|assessment|syllabus)\b/i.test(line) && line.length > 2) {
      subjects.push({ subject: "General", topics: [line] });
    }
  }
  return {
    testDate: parseDateFromText(sourceText),
    subjects: subjects.length ? subjects : [{ subject: "General", topics: [] }],
  };
}

export async function generatePracticeQuestions(
  topics: Array<{ subject: string; topic: string }>,
): Promise<Map<string, Array<{ question: string; answer: string }>>> {
  const parsed = await generateJson(
    `Write exactly two very short practice questions for every listed topic, suitable for a Grade 1 child. Keep the language simple, use concrete examples, and provide a short correct answer. Return JSON with this shape: {"items":[{"subject":"exact subject","topic":"exact topic","questions":[{"question":"...","answer":"..."},{"question":"...","answer":"..."}]}]}. Include every input topic exactly once and do not add any other topics.\\n\\nTopics:\\n${JSON.stringify(topics)}`,
    (value) => questionSetSchema.parse(value),
  );
  const result = new Map<string, Array<{ question: string; answer: string }>>();
  for (const item of parsed.items) {
    result.set(topicKey(item.subject, item.topic), item.questions);
  }
  for (const topic of topics) {
    if (!result.has(topicKey(topic.subject, topic.topic))) {
      throw new Error(`Questions were missing for ${topic.topic}.`);
    }
  }
  return result;
}

export function topicKey(subject: string, topic: string): string {
  return `${subject.trim().toLocaleLowerCase()}\u0000${topic.trim().toLocaleLowerCase()}`;
}

export function dateIsBeforeToday(value: string): boolean {
  return value < new Date().toISOString().slice(0, 10);
}

export function buildSchedule(
  subjects: ExtractedSyllabus["subjects"],
  testDate: string,
): PlannedTopic[] {
  if (!isValidDateOnly(testDate)) throw new Error("Choose a valid test date to continue.");
  const topics = subjects.flatMap((group) =>
    group.topics.map((topic) => ({
      subject: group.subject.trim(),
      topic: topic.trim(),
      questions: [] as Array<{ question: string; answer: string }>,
    })),
  );
  if (!topics.length) throw new Error("No study topics were found. Add a subject and at least one topic.");

  const today = new Date().toISOString().slice(0, 10);
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${testDate}T00:00:00Z`);
  const availableDays = Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
  return topics.map((topic, index) => {
    const dayOffset = Math.floor((index * availableDays) / topics.length);
    const scheduled = new Date(start + dayOffset * 86_400_000).toISOString().slice(0, 10);
    return { ...topic, date: scheduled };
  });
}
