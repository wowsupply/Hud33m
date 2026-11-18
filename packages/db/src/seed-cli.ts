import { createDb } from './client';
import { seedReferenceData } from './seed/seed';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL не задан');
  process.exit(1);
}
const handle = createDb(url, { max: 1 });
const res = await seedReferenceData(handle.db);
console.log(`Справочники: +${res.dictionary}, продукты: +${res.foods}`);
await handle.close();
