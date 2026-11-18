import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './client';

/**
 * YandexGPT (Yandex Cloud Foundation Models), синхронный режим.
 * Требует проверки на реальном ключе перед запуском.
 */
export interface YandexGptConfig {
  apiKey: string;
  folderId: string;
  /** Например, «yandexgpt-lite/latest» или «yandexgpt/latest». */
  model: string;
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface CompletionResponse {
  result?: {
    alternatives?: Array<{ message?: { text?: string } }>;
    usage?: { inputTextTokens?: string | number; completionTokens?: string | number };
    modelVersion?: string;
  };
}

export class YandexGptClient implements LlmClient {
  readonly provider = 'yandexgpt';
  private readonly fetch: typeof fetch;

  constructor(private readonly cfg: YandexGptConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await this.fetch(
      this.cfg.url ?? 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${this.cfg.apiKey}`,
          'x-folder-id': this.cfg.folderId,
        },
        body: JSON.stringify({
          modelUri: `gpt://${this.cfg.folderId}/${this.cfg.model}`,
          completionOptions: {
            stream: false,
            temperature: req.temperature,
            maxTokens: String(req.maxTokens),
          },
          messages: [
            { role: 'system', text: req.system },
            { role: 'user', text: req.user },
          ],
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 30_000),
      },
    );
    if (!res.ok) throw new LlmError(`YandexGPT: ошибка ${res.status}`, res.status);
    const data = (await res.json()) as CompletionResponse;
    const text = data.result?.alternatives?.[0]?.message?.text;
    if (!text) throw new LlmError('YandexGPT: пустой ответ');
    const usage = data.result?.usage;
    return {
      text,
      model: `${this.cfg.model}${data.result?.modelVersion ? `@${data.result.modelVersion}` : ''}`,
      inputTokens: usage?.inputTextTokens != null ? Number(usage.inputTextTokens) : null,
      outputTokens: usage?.completionTokens != null ? Number(usage.completionTokens) : null,
    };
  }
}
