import { randomUUID } from 'node:crypto';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './client';

/**
 * GigaChat (Сбер). Авторизация: ключ авторизации (Basic) → access token на ~30 минут.
 * Важно: серверы GigaChat используют сертификаты НУЦ Минцифры — корневой сертификат нужно
 * добавить в доверенные (NODE_EXTRA_CA_CERTS), см. docs/DEPLOY.md.
 * Требует проверки на реальном ключе перед запуском.
 */
export interface GigaChatConfig {
  authKey: string;
  /** GIGACHAT_API_PERS (физлица), GIGACHAT_API_B2B или GIGACHAT_API_CORP (юрлица). */
  scope: string;
  model: string;
  authUrl?: string;
  apiUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface TokenResponse {
  access_token: string;
  expires_at: number;
}

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class GigaChatClient implements LlmClient {
  readonly provider = 'gigachat';
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetch: typeof fetch;

  constructor(private readonly cfg: GigaChatConfig) {
    this.fetch = cfg.fetchImpl ?? fetch;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() > 60_000) return this.token.value;
    const res = await this.fetch(this.cfg.authUrl ?? 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        RqUID: randomUUID(),
        Authorization: `Basic ${this.cfg.authKey}`,
      },
      body: `scope=${encodeURIComponent(this.cfg.scope)}`,
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new LlmError(`GigaChat: ошибка авторизации ${res.status}`, res.status);
    const data = (await res.json()) as TokenResponse;
    this.token = { value: data.access_token, expiresAt: data.expires_at };
    return data.access_token;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const token = await this.getToken();
    const res = await this.fetch(`${this.cfg.apiUrl ?? 'https://gigachat.devices.sberbank.ru/api/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        temperature: req.temperature,
        max_tokens: req.maxTokens,
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 30_000),
    });
    if (res.status === 401) this.token = null;
    if (!res.ok) throw new LlmError(`GigaChat: ошибка ${res.status}`, res.status);
    const data = (await res.json()) as ChatResponse;
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new LlmError('GigaChat: пустой ответ');
    return {
      text,
      model: data.model ?? this.cfg.model,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  }
}
