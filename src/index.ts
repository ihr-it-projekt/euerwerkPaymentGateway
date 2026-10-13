import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { buildDependencies } from './composition-root.ts';
import { loadEnv } from './config/env.ts';
import { createJsonLogger } from './shared/logger/logger.ts';

const env = loadEnv(process.env);
const logger = createJsonLogger();
const app = createApp(buildDependencies(env, logger));

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	logger.info('Payment Gateway gestartet', { port: info.port });
});

const shutdown = (): void => {
	server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
