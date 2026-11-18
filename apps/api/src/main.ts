import { loadConfig } from './config';
import { createDeps } from './deps';
import { buildServer } from './server';

const config = loadConfig();
const { deps, handle } = createDeps(config);
const app = await buildServer(deps);

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
