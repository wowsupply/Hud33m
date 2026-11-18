import { users } from '@hud/db';
import { normalizePhone } from '@hud/shared';
import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { createDeps } from '../deps';

/**
 * Создаёт первого администратора (владельца проекта):
 *   pnpm create-admin --phone "+79991234567" --name "Имя" [--last "Фамилия"] [--role mentor]
 */
const { values } = parseArgs({
  options: {
    phone: { type: 'string' },
    name: { type: 'string' },
    last: { type: 'string', default: '' },
    role: { type: 'string', default: 'admin' },
  },
});
const phone = values.phone ? normalizePhone(values.phone) : null;
if (!phone || !values.name || !['admin', 'mentor'].includes(values.role!)) {
  console.error('Использование: create-admin --phone "+79991234567" --name "Имя" [--last "Фамилия"] [--role admin|mentor]');
  process.exit(1);
}
const { deps, handle } = createDeps(loadConfig());
const [existing] = await deps.db.select().from(users).where(eq(users.phone, phone));
if (existing) {
  await deps.db.update(users).set({ role: values.role as 'admin' | 'mentor' }).where(eq(users.id, existing.id));
  console.log(`Пользователь ${phone} теперь ${values.role}`);
} else {
  await deps.db.insert(users).values({ phone, firstName: values.name, lastName: values.last!, role: values.role as 'admin' | 'mentor' });
  console.log(`Создан ${values.role}: ${values.name} ${phone}`);
}
await handle.close();
