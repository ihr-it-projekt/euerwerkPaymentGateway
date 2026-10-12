import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { buildDependencies } from './composition-root.ts';
import { loadEnv } from './config/env.ts';
import { connectPostgres } from './infrastructure/db/database.ts';
import { createJsonLogger } from './shared/logger/logger.ts';

const env = loadEnv(process.env);
const logger = createJsonLogger();
const connection = connectPostgres(env.DATABASE_URL);
const app = createApp(buildDependencies(env, connection.db, logger));

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
	logger.info('Payment Gateway gestartet', { port: info.port });
});

const shutdown = (): void => {
	server.close(() => {
		void connection.close().then(() => process.exit(0));
	});
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
