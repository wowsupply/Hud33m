import { createDb, runMigrations, seedReferenceData } from '@hud/db';
import { TEST_DB_URL } from './env';

/** Пересоздаёт тестовую базу, применяет миграции и справочники. */
export default async function setup() {
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(TEST_DB_URL);
  adminUrl.pathname = '/postgres';
  const admin = createDb(adminUrl.toString(), { max: 1 });
  await admin.sql.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.sql.unsafe(`create database "${dbName}"`);
  await admin.close();

  const handle = createDb(TEST_DB_URL, { max: 1 });
  await runMigrations(handle.db);
  await seedReferenceData(handle.db);
  await handle.close();
}
