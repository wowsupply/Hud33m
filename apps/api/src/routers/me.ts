import { users } from '@hud/db';
import { CONSENT_DOCS, CONSENT_TYPES, isValidTimeZone, MESSENGER_CHANNELS } from '@hud/shared';
import { notificationSettingsSchema, questionnaireSchema } from '@hud/shared/schemas';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getAccessState } from '../services/access';
import { logoutEverywhere } from '../services/auth';
import { acceptConsents, consentState, revokeConsent } from '../services/consents';
import { exportStudentData } from '../services/export';
import { createLinkUrl, messengerStatus, unlinkMessenger } from '../services/messengers';
import { getNotificationSettings, updateNotificationSettings } from '../services/notifications';
import { pushSubscriptionsCount, removePushSubscription, savePushSubscription } from '../services/push';
import { currentTargets, latestQuestionnaire, submitQuestionnaire } from '../services/targets';
import { authedProcedure, router, studentProcedure } from '../trpc';

export const meRouter = router({
  /** Состояние ученицы: доступ, согласия, анкета, цели. */
  get: authedProcedure.query(async ({ ctx }) => {
    const u = ctx.user;
    if (u.role !== 'student') return { user: u, access: null, consents: null, onboarded: true, targets: null };
    const [access, consents, targets] = await Promise.all([
      getAccessState(ctx.deps, u),
      consentState(ctx.deps.db, u.id),
      currentTargets(ctx.deps.db, u.id),
    ]);
    return { user: u, access, consents, onboarded: !!u.onboardedAt, targets };
  }),

  consentDocs: authedProcedure.query(() => CONSENT_TYPES.map((type) => ({ type, ...CONSENT_DOCS[type] }))),

  acceptConsents: studentProcedure
    .input(z.object({ types: z.array(z.enum(CONSENT_TYPES)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const required = CONSENT_TYPES.filter((t) => CONSENT_DOCS[t].required);
      const state = await consentState(ctx.deps.db, ctx.user.id);
      const missing = required.filter((t) => !state[t].accepted && !input.types.includes(t));
      if (missing.length) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Обязательные согласия нужно принять, чтобы вести дневник' });
      }
      await acceptConsents(ctx.deps.db, ctx.user.id, input.types, ctx.userAgent);
      return consentState(ctx.deps.db, ctx.user.id);
    }),

  revokeConsent: studentProcedure
    .input(z.object({ type: z.enum(['ai_processing', 'marketing']) }))
    .mutation(async ({ ctx, input }) => {
      await revokeConsent(ctx.deps.db, ctx.user.id, input.type, ctx.deps.now());
      return consentState(ctx.deps.db, ctx.user.id);
    }),

  questionnaire: studentProcedure.query(({ ctx }) => latestQuestionnaire(ctx.deps.db, ctx.user.id)),

  submitQuestionnaire: studentProcedure.input(questionnaireSchema).mutation(async ({ ctx, input }) => {
    if (!ctx.access.canWrite && ctx.user.onboardedAt) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Доступ к изменениям закрыт' });
    }
    if (input.targetWeightKg > input.weightKg * 1.5 || input.targetWeightKg < input.weightKg * 0.5) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Проверьте желаемый вес' });
    }
    return submitQuestionnaire(ctx.deps, ctx.user, input);
  }),

  settings: studentProcedure.query(async ({ ctx }) => ({
    timezone: ctx.user.timezone,
    notifications: await getNotificationSettings(ctx.deps.db, ctx.user.id),
  })),

  updateSettings: studentProcedure
    .input(z.object({ timezone: z.string().optional(), notifications: notificationSettingsSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.timezone) {
        if (!isValidTimeZone(input.timezone)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Неверный часовой пояс' });
        await ctx.deps.db.update(users).set({ timezone: input.timezone }).where(eq(users.id, ctx.user.id));
      }
      if (input.notifications) await updateNotificationSettings(ctx.deps.db, ctx.user.id, input.notifications);
      return { ok: true };
    }),

  /** Выгрузка всех своих данных (требование законодательства о ПД). */
  exportData: studentProcedure.query(({ ctx }) => exportStudentData(ctx.deps, ctx.user.id)),

  /** Каналы доставки: Web Push и боты в мессенджерах. */
  channels: authedProcedure.query(async ({ ctx }) => ({
    push: {
      publicKey: ctx.deps.push?.publicKey ?? null,
      subscriptions: await pushSubscriptionsCount(ctx.deps, ctx.user.id),
    },
    messengers: await messengerStatus(ctx.deps, ctx.user.id),
  })),

  subscribePush: authedProcedure
    .input(
      z.object({
        endpoint: z.url().max(2000),
        keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(5).max(100) }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await savePushSubscription(ctx.deps, ctx.user.id, { endpoint: input.endpoint, ...input.keys }, ctx.userAgent);
      return { ok: true };
    }),

  unsubscribePush: authedProcedure.input(z.object({ endpoint: z.string().max(2000) })).mutation(async ({ ctx, input }) => {
    await removePushSubscription(ctx.deps, ctx.user.id, input.endpoint);
    return { ok: true };
  }),

  linkMessenger: authedProcedure
    .input(z.object({ channel: z.enum(MESSENGER_CHANNELS) }))
    .mutation(async ({ ctx, input }) => ({ url: await createLinkUrl(ctx.deps, ctx.user.id, input.channel) })),

  unlinkMessenger: authedProcedure.input(z.object({ channel: z.enum(MESSENGER_CHANNELS) })).mutation(async ({ ctx, input }) => {
    await unlinkMessenger(ctx.deps, ctx.user.id, input.channel);
    return { ok: true };
  }),

  logoutEverywhere: authedProcedure.mutation(async ({ ctx }) => {
    await logoutEverywhere(ctx.deps, ctx.user.id);
    ctx.clearSessionCookie();
    return { ok: true };
  }),
});
