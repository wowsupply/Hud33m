import { useEffect, useRef } from 'react';

export interface LiveEvent {
  kind: 'diary' | 'comment' | 'notification' | 'safety' | 'profile';
  studentId: string | null;
}

/**
 * Подписка на живые обновления сервера (SSE). Браузер сам переподключается при обрыве.
 * Обработчик вызывается не чаще раза в `throttleMs`, чтобы пачка событий не вызвала шквал запросов.
 */
export function useEventStream(url: string | null, onEvent: (events: LiveEvent[]) => void, throttleMs = 1000) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!url || typeof EventSource === 'undefined') return;
    const source = new EventSource(url, { withCredentials: true });
    let buffer: LiveEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const batch = buffer;
      buffer = [];
      if (batch.length) handler.current(batch);
    };
    source.addEventListener('change', (msg) => {
      try {
        buffer.push(JSON.parse((msg as MessageEvent<string>).data) as LiveEvent);
      } catch {
        return;
      }
      timer ??= setTimeout(flush, throttleMs);
    });
    return () => {
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, [url, throttleMs]);
}
