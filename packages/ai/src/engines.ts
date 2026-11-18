import type { DayFacts, WeekFacts } from '@hud/shared';
import { z } from 'zod';
import { extractJson } from './json';
import type { LlmClient } from './llm/client';
import {
  DAY_SYSTEM_PROMPT,
  MEAL_SYSTEM_PROMPT,
  WEEK_SYSTEM_PROMPT,
  dayUserPrompt,
  mealUserPrompt,
  weekUserPrompt,
} from './prompts';
import { parseMealText } from './quantity';
import { templateDaySummary, templateWeeklyReport } from './templates';
import type { AiEngine, DaySummaryText, EngineResult, ParsedItem, WeeklyReportText } from './types';

/** Движок без ИИ: правила разбора и шаблонные тексты. */
export class LocalEngine implements AiEngine {
  readonly name = 'local';

  async parseMeal(text: string): Promise<EngineResult<ParsedItem[]>> {
    return { value: parseMealText(text), model: null };
  }

  async writeDaySummary(facts: DayFacts): Promise<EngineResult<DaySummaryText>> {
    return { value: templateDaySummary(facts), model: null };
  }

  async writeWeeklyReport(facts: WeekFacts): Promise<EngineResult<WeeklyReportText>> {
    return { value: templateWeeklyReport(facts), model: null };
  }
}

const num = z.coerce.number().min(0);

const llmMealSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        grams: num.max(5000).nullable().optional(),
        grams_estimated: z.boolean().optional(),
        quantity: z.string().max(60).nullable().optional(),
        per100: z
          .object({ kcal: num.max(950), protein: num.max(100), fat: num.max(100), carbs: num.max(100) })
          .nullable()
          .optional(),
      }),
    )
    .max(40),
});

const llmDaySchema = z.object({
  text: z.string().trim().min(1),
  question: z.string().trim().nullable().optional(),
});

const strList = z.array(z.string().trim().min(1)).default([]);
const llmWeekSchema = z.object({
  summary: z.string().trim().min(1),
  positives: strList,
  observations: strList,
  patterns: strList,
  questions: strList,
});

/** Движок на языковой модели (GigaChat, YandexGPT или другой LlmClient). */
export class LlmEngine implements AiEngine {
  constructor(private readonly client: LlmClient) {}

  get name(): string {
    return this.client.provider;
  }

  async parseMeal(text: string): Promise<EngineResult<ParsedItem[]>> {
    const r = await this.client.complete({
      system: MEAL_SYSTEM_PROMPT,
      user: mealUserPrompt(text),
      maxTokens: 1500,
      temperature: 0.1,
    });
    const data = llmMealSchema.parse(extractJson(r.text));
    const value: ParsedItem[] = data.items.map((i) => ({
      name: i.name,
      query: i.name,
      grams: i.grams ?? null,
      gramsEstimated: i.grams_estimated ?? true,
      count: null,
      unit: null,
      quantityText: i.quantity ?? null,
      estimatedPer100: i.per100 ?? null,
    }));
    return { value, model: r.model, inputTokens: r.inputTokens ?? undefined, outputTokens: r.outputTokens ?? undefined };
  }

  async writeDaySummary(facts: DayFacts): Promise<EngineResult<DaySummaryText>> {
    const r = await this.client.complete({
      system: DAY_SYSTEM_PROMPT,
      user: dayUserPrompt(facts),
      maxTokens: 600,
      temperature: 0.3,
    });
    const data = llmDaySchema.parse(extractJson(r.text));
    return {
      value: { text: data.text, question: data.question || null },
      model: r.model,
      inputTokens: r.inputTokens ?? undefined,
      outputTokens: r.outputTokens ?? undefined,
    };
  }

  async writeWeeklyReport(facts: WeekFacts): Promise<EngineResult<WeeklyReportText>> {
    const r = await this.client.complete({
      system: WEEK_SYSTEM_PROMPT,
      user: weekUserPrompt(facts),
      maxTokens: 1500,
      temperature: 0.3,
    });
    const value = llmWeekSchema.parse(extractJson(r.text));
    return { value, model: r.model, inputTokens: r.inputTokens ?? undefined, outputTokens: r.outputTokens ?? undefined };
  }
}
