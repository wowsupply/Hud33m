import { describe, expect, it } from 'vitest';
import { LlmEngine } from '../engines';
import { GigaChatClient } from './gigachat';
import { YandexGptClient } from './yandex';

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe('GigaChatClient', () => {
  it('получает токен и вызывает chat/completions', async () => {
    const { impl, calls } = mockFetch([
      { body: { access_token: 'tok', expires_at: Date.now() + 1_800_000 } },
      {
        body: {
          model: 'GigaChat',
          choices: [{ message: { content: '{"items":[{"name":"Яблоко","grams":180,"grams_estimated":true,"quantity":"1 шт","per100":{"kcal":47,"protein":0.4,"fat":0.4,"carbs":9.8}}]}' } }],
          usage: { prompt_tokens: 300, completion_tokens: 60 },
        },
      },
    ]);
    const engine = new LlmEngine(new GigaChatClient({ authKey: 'key', scope: 'GIGACHAT_API_PERS', model: 'GigaChat', fetchImpl: impl }));
    const r = await engine.parseMeal('яблоко');
    expect(calls[0]?.url).toContain('/api/v2/oauth');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Basic key');
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(r.value[0]).toMatchObject({ name: 'Яблоко', grams: 180, gramsEstimated: true });
    expect(r.inputTokens).toBe(300);
  });
});

describe('YandexGptClient', () => {
  it('формирует запрос и читает ответ', async () => {
    const { impl, calls } = mockFetch([
      {
        body: {
          result: {
            alternatives: [{ message: { role: 'assistant', text: '```json\n{"text":"Записано 2 приёма пищи.","question":null}\n```' } }],
            usage: { inputTextTokens: '250', completionTokens: '40' },
            modelVersion: '1.0',
          },
        },
      },
    ]);
    const client = new YandexGptClient({ apiKey: 'k', folderId: 'b1g', model: 'yandexgpt-lite/latest', fetchImpl: impl });
    const r = await client.complete({ system: 's', user: 'u', maxTokens: 100, temperature: 0.2 });
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.modelUri).toBe('gpt://b1g/yandexgpt-lite/latest');
    expect(r.inputTokens).toBe(250);
    expect(r.text).toContain('Записано');
  });
});
