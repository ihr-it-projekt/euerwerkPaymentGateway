import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { secureHeaders } from 'hono/secure-headers';
import type { Logger } from './shared/logger/logger.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { createAdminRoutes, type AdminRouteConfig } from './http/routes/admin.routes.ts';
import { createCheckoutRoutes, type CheckoutRouteActions } from './http/routes/checkout.routes.ts';
import { createHealthRoutes } from './http/routes/health.routes.ts';
import { createWebhookRoutes } from './http/routes/webhook.routes.ts';
import type { HandleProviderWebhookAction } from './domain/payment/actions/handle-provider-webhook.action.ts';

export interface AppDependencies {
	logger: Logger;
	checkout: CheckoutRouteActions;
	admin: AdminRouteConfig;
	handleWebhook: Pick<HandleProviderWebhookAction, 'execute'>;
}

/** Baut die Hono-App aus fertig verdrahteten Actions (siehe composition-root.ts). */
export const createApp = (deps: AppDependencies): OpenAPIHono => {
	const app = new OpenAPIHono();

	app.use('*', secureHeaders());
	app.onError(createErrorHandler(deps.logger));
	app.notFound((c) =>
		c.json({ error: { code: 'NOT_FOUND', message: 'Route nicht gefunden' } }, 404)
	);

	app.route('/', createHealthRoutes());
	app.route('/v1/checkouts', createCheckoutRoutes(deps.checkout));
	app.route('/v1/webhooks', createWebhookRoutes(deps.handleWebhook));
	app.route('/v1/admin', createAdminRoutes(deps.admin));

	app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
		type: 'http',
		scheme: 'bearer'
	});
	app.doc31('/openapi.json', {
		openapi: '3.1.0',
		info: { title: 'EÜRwerk Payment Gateway', version: '0.1.0' }
	});
	app.get('/docs', Scalar({ url: '/openapi.json' }));

	return app;
};
