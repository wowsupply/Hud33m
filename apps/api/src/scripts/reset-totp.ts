import { users } from '@hud/db';
import { normalizePhone } from '@hud/shared';
import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { createDeps } from '../deps';

/** Сброс двухфакторной защиты наставника (например, при смене телефона): reset-totp --phone "+7…" */
const { values } = parseArgs({ options: { phone: { type: 'string' } } });
const phone = values.phone ? normalizePhone(values.phone) : null;
if (!phone) {
  console.error('Использование: reset-totp --phone "+79991234567"');
  process.exit(1);
}
const { deps, handle } = createDeps(loadConfig());
const rows = await deps.db
  .update(users)
  .set({ totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastCounter: null })
  .where(eq(users.phone, phone))
  .returning({ id: users.id });
console.log(rows.length ? `Двухфакторная защита сброшена для ${phone}` : `Пользователь ${phone} не найден`);
await handle.close();
