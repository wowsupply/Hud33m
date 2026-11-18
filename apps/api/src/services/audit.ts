import { aiRequests, auditLog, type Db } from '@hud/db';
import type { AiCallMeta } from '@hud/ai';

export async function audit(
  db: Db,
  entry: { actorId: string; studentId?: string | null; action: string; meta?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    studentId: entry.studentId ?? null,
    action: entry.action,
    meta: entry.meta ?? {},
  });
}

export async function logAiCall(db: Db, userId: string | null, meta: AiCallMeta): Promise<string> {
  const [row] = await db
    .insert(aiRequests)
    .values({
      userId,
      feature: meta.feature,
      engine: meta.engine,
      model: meta.model,
      promptVersion: meta.promptVersion,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      latencyMs: meta.latencyMs,
      success: meta.success,
      fallbackUsed: meta.fallbackUsed,
      error: meta.error,
    })
    .returning({ id: aiRequests.id });
  return row!.id;
}
