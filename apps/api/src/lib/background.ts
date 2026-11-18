/**
 * Фоновые задачи, которые не должны задерживать ответ пользователю (доставка push и сообщений в мессенджер).
 * В тестах задачи копятся, чтобы их можно было дождаться через flush().
 */
export interface Background {
  run(task: Promise<unknown>): void;
  flush(): Promise<void>;
}

export function createBackground(onError: (e: unknown) => void): Background {
  const pending = new Set<Promise<unknown>>();
  return {
    run(task) {
      const p = task.catch(onError).finally(() => pending.delete(p));
      pending.add(p);
    },
    async flush() {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}
