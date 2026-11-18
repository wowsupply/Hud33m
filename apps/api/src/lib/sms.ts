export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

/** Для разработки: печатает SMS в лог. */
export class ConsoleSms implements SmsSender {
  readonly sent: Array<{ phone: string; text: string }> = [];
  async send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS] ${phone}: ${text}`);
  }
}

/** SMS.ru — один из российских SMS-шлюзов. Провайдер выбирается с заказчицей. */
export class SmsRu implements SmsSender {
  constructor(
    private readonly apiId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const url = new URL('https://sms.ru/sms/send');
    url.searchParams.set('api_id', this.apiId);
    url.searchParams.set('to', phone.replace(/^\+/, ''));
    url.searchParams.set('msg', text);
    url.searchParams.set('json', '1');
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as { status?: string; status_text?: string };
    if (!res.ok || data.status !== 'OK') {
      throw new Error(`SMS.ru: ${data.status_text ?? res.status}`);
    }
  }
}
