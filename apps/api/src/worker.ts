import { loadConfig } from './config';
import { createDeps } from './deps';
import { runTick } from './jobs';

/** Фоновый процесс: раз в минуту выполняет runTick под advisory-блокировкой PostgreSQL. */
const config = loadConfig();
const { deps, handle } = createDeps(config);
const LOCK_ID = 727_001;
let running = false;
let stopped = false;

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    const [lock] = await handle.sql`select pg_try_advisory_lock(${LOCK_ID}) as ok`;
    if (!lock?.ok) return;
    try {
      const r = await runTick(deps);
      if (r.expired || r.endingNotices || r.reminders || r.weeklyReports) console.log('[worker]', JSON.stringify(r));
    } finally {
      await handle.sql`select pg_advisory_unlock(${LOCK_ID})`;
    }
  } catch (e) {
    console.error('[worker] ошибка', e);
  } finally {
    running = false;
  }
}

const timer = setInterval(tick, config.WORKER_INTERVAL_MS);
void tick();
console.log(`[worker] запущен, интервал ${config.WORKER_INTERVAL_MS} мс`);

const shutdown = async () => {
  stopped = true;
  clearInterval(timer);
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
