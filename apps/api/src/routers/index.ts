import { router } from '../trpc';
import { adminRouter } from './admin';
import { authRouter } from './auth';
import { commsRouter } from './comms';
import { diaryRouter } from './diary';
import { insightsRouter } from './insights';
import { meRouter } from './me';

export const appRouter = router({
  auth: authRouter,
  me: meRouter,
  diary: diaryRouter,
  insights: insightsRouter,
  comms: commsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
