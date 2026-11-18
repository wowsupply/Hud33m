import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';
import { createStaff, login, onboardStudent, useTestDeps } from './helpers';

const { deps } = useTestDeps();
let app: Awaited<ReturnType<typeof buildServer>>;
let base = '';

beforeAll(async () => {
  app = await buildServer(deps);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
});

async function readUntil(res: Response, predicate: (text: string) => boolean, timeoutMs = 3000): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), deadline - Date.now())),
    ]);
    if (chunk.value) text += decoder.decode(chunk.value);
    if (predicate(text) || chunk.done) break;
  }
  await reader.cancel().catch(() => {});
  return text;
}

describe('живые обновления (SSE)', () => {
  it('без входа — 401', async () => {
    const res = await fetch(`${base}/api/events?app=admin`);
    expect(res.status).toBe(401);
  });

  it('наставник получает события только по своим ученицам', async () => {
    await createStaff(deps, '+79991112233', 'mentor', 'Ирина');
    await createStaff(deps, '+79991112244', 'mentor', 'Елена');
    const mentorA = await login(deps, '+79991112233', 'admin');
    const mentorB = await login(deps, '+79991112244', 'admin');
    const a = await onboardStudent(deps, mentorA, '+79990000001');
    const b = await onboardStudent(deps, mentorB, '+79990000002');

    const res = await fetch(`${base}/api/events?app=admin`, { headers: { cookie: `hud_admin_sid=${mentorA.token}` } });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    setTimeout(() => {
      void deps.events.publish({ kind: 'diary', studentId: b.studentId });
      void deps.events.publish({ kind: 'diary', studentId: a.studentId });
    }, 100);
    const text = await readUntil(res, (t) => t.includes('event: change'));
    expect(text).toContain(`"studentId":"${a.studentId}"`);
    expect(text).not.toContain(b.studentId);
  });
});
