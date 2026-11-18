import type { DbHandle } from '@hud/db';

/** Событие об изменении данных — по нему открытые кабинеты и приложения обновляют экраны. */
export interface AppEvent {
  kind: 'diary' | 'comment' | 'notification' | 'safety' | 'profile';
  /** Ученица, чьи данные изменились. */
  studentId?: string;
  /** Адресат (для уведомлений). */
  userId?: string;
}

export interface EventBus {
  publish(e: AppEvent): Promise<void>;
  subscribe(listener: (e: AppEvent) => void): () => void;
}

/** Для тестов и одного процесса. */
export class MemoryEventBus implements EventBus {
  readonly published: AppEvent[] = [];
  private listeners = new Set<(e: AppEvent) => void>();
  async publish(e: AppEvent) {
    this.published.push(e);
    for (const l of this.listeners) l(e);
  }
  subscribe(listener: (e: AppEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const CHANNEL = 'hud_events';

/**
 * Через PostgreSQL LISTEN/NOTIFY: события из любого процесса (сервер, воркер, несколько копий сервера)
 * доходят до всех открытых SSE-подключений. Отдельный брокер сообщений не нужен.
 */
export class PgEventBus implements EventBus {
  private listeners = new Set<(e: AppEvent) => void>();
  private listening: Promise<unknown> | null = null;

  constructor(private readonly sql: DbHandle['sql']) {}

  async publish(e: AppEvent) {
    await this.sql.notify(CHANNEL, JSON.stringify(e));
  }

  subscribe(listener: (e: AppEvent) => void) {
    this.listeners.add(listener);
    this.listening ??= this.sql.listen(CHANNEL, (payload: string) => {
      let e: AppEvent;
      try {
        e = JSON.parse(payload) as AppEvent;
      } catch {
        return;
      }
      for (const l of this.listeners) l(e);
    });
    return () => this.listeners.delete(listener);
  }
}
