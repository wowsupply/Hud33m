import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  link: string | null;
  tag: string;
}

export interface PushSender {
  readonly publicKey: string;
  /** 'gone' — подписка больше не действует, её нужно удалить. */
  send(target: PushTarget, payload: PushPayload): Promise<'ok' | 'gone'>;
}

export class WebPushSender implements PushSender {
  constructor(
    readonly publicKey: string,
    privateKey: string,
    subject: string,
  ) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<'ok' | 'gone'> {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: 24 * 3600, timeout: 8000, urgency: 'normal' },
      );
      return 'ok';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw e;
    }
  }
}

/** Для тестов. */
export class FakePushSender implements PushSender {
  readonly publicKey = 'test-public-key';
  readonly sent: Array<{ target: PushTarget; payload: PushPayload }> = [];
  gone = new Set<string>();
  async send(target: PushTarget, payload: PushPayload) {
    if (this.gone.has(target.endpoint)) return 'gone' as const;
    this.sent.push({ target, payload });
    return 'ok' as const;
  }
}
