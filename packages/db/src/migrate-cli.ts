import { createDb, runMigrations } from './client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан');
  process.exit(1);
}
const handle = createDb(url, { max: 1 });
await runMigrations(handle.db);
console.log('Миграции применены');
await handle.close();
