import type { AppRouter } from '@hud/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export function makeTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        headers: { 'x-hud-app': 'admin' },
        fetch: (url, opts) => fetch(url, { ...opts, credentials: 'include' }),
      }),
    ],
  });
}
