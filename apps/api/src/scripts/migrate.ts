import { createDb, runMigrations, seedReferenceData } from '@hud/db';
import { loadConfig } from '../config';

/** Применяет миграции и заполняет справочники (идемпотентно). Запускается при каждом выкладывании. */
const config = loadConfig();
const handle = createDb(config.DATABASE_URL, { max: 1 });
await runMigrations(handle.db);
const seeded = await seedReferenceData(handle.db);
console.log(`Миграции применены. Справочники: +${seeded.dictionary}, продукты: +${seeded.foods}`);
await handle.close();
