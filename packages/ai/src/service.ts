import type { DayFacts, WeekFacts } from '@hud/shared';
import { LocalEngine } from './engines';
import { checkDaySummary, checkWeeklyReport } from './guardrails';
import { PROMPT_VERSIONS } from './prompts';
import { resolveItems } from './resolve';
import type {
  AiCallMeta,
  AiEngine,
  DaySummaryText,
  DraftItem,
  EngineResult,
  FoodRecord,
  WeeklyReportText,
} from './types';

export interface AiOptions {
  /** false — у ученицы нет согласия на ИИ-анализ: используем только правила и шаблоны. */
  allowLlm: boolean;
}

export interface AiService {
  readonly llmEnabled: boolean;
  parseMeal(text: string, foods: FoodRecord[], opts: AiOptions): Promise<{ items: DraftItem[]; meta: AiCallMeta }>;
  daySummary(facts: DayFacts, opts: AiOptions): Promise<{ value: DaySummaryText; meta: AiCallMeta }>;
  weeklyReport(facts: WeekFacts, opts: AiOptions): Promise<{ value: WeeklyReportText; meta: AiCallMeta }>;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/**
 * Сервис ИИ с защитой: проверка ответа модели, повтор при нарушениях и запасной путь
 * через локальный движок. Ни один сбой ИИ не ломает дневник.
 */
export function createAiService(opts: { llm: AiEngine | null; maxAttempts?: number }): AiService {
  const local = new LocalEngine();
  const llm = opts.llm;
  const maxAttempts = opts.maxAttempts ?? 2;

  function meta(
    feature: AiCallMeta['feature'],
    engine: string,
    started: number,
    r: Partial<EngineResult<unknown>>,
    extra: Partial<AiCallMeta> = {},
  ): AiCallMeta {
    const promptVersion =
      feature === 'parse_meal'
        ? PROMPT_VERSIONS.parseMeal
        : feature === 'day_summary'
          ? PROMPT_VERSIONS.daySummary
          : PROMPT_VERSIONS.weeklyReport;
    return {
      feature,
      engine,
      model: r.model ?? null,
      promptVersion: engine === 'local' ? 'local-v1' : promptVersion,
      inputTokens: r.inputTokens ?? null,
      outputTokens: r.outputTokens ?? null,
      latencyMs: Date.now() - started,
      success: true,
      fallbackUsed: false,
      error: null,
      ...extra,
    };
  }

  async function withGuard<T, F>(
    feature: AiCallMeta['feature'],
    facts: F,
    useLlm: boolean,
    run: (e: AiEngine) => Promise<EngineResult<T>>,
    check: (value: T, facts: F) => string[],
  ): Promise<{ value: T; meta: AiCallMeta }> {
    const started = Date.now();
    let lastError: string | null = null;
    if (llm && useLlm) {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const r = await run(llm);
          const violations = check(r.value, facts);
          if (violations.length === 0) return { value: r.value, meta: meta(feature, llm.name, started, r) };
          lastError = `guardrails: ${violations.join(', ')}`;
        } catch (e) {
          lastError = errorText(e);
        }
      }
    }
    const r = await run(local);
    return {
      value: r.value,
      meta: meta(feature, local.name, started, r, {
        fallbackUsed: lastError !== null,
        success: lastError === null,
        error: lastError,
      }),
    };
  }

  return {
    llmEnabled: llm !== null,

    async parseMeal(text, foods, o) {
      const started = Date.now();
      if (llm && o.allowLlm) {
        try {
          const r = await llm.parseMeal(text);
          if (r.value.length > 0) {
            return { items: resolveItems(r.value, foods), meta: meta('parse_meal', llm.name, started, r) };
          }
        } catch (e) {
          const r = await local.parseMeal(text);
          return {
            items: resolveItems(r.value, foods),
            meta: meta('parse_meal', local.name, started, r, {
              fallbackUsed: true,
              success: false,
              error: errorText(e),
            }),
          };
        }
      }
      const r = await local.parseMeal(text);
      return { items: resolveItems(r.value, foods), meta: meta('parse_meal', local.name, started, r) };
    },

    daySummary(facts, o) {
      // Для пустого дня текст очевиден — не тратим запрос к модели.
      return withGuard('day_summary', facts, o.allowLlm && facts.hasEntries, (e) => e.writeDaySummary(facts), checkDaySummary);
    },

    weeklyReport(facts, o) {
      return withGuard(
        'weekly_report',
        facts,
        o.allowLlm && facts.nutrition.daysWithEntries > 0,
        (e) => e.writeWeeklyReport(facts),
        checkWeeklyReport,
      );
    },
  };
}
