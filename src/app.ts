import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { secureHeaders } from 'hono/secure-headers';
import type { HandleProviderWebhookAction } from './domain/payment/actions/handle-provider-webhook.action.ts';
import type { GetWebhookEndpointsAction } from './domain/webhook/actions/get-webhook-endpoints.action.ts';
import { createErrorHandler } from './http/error-handler.ts';
import { createCheckoutRoutes, type CheckoutRouteActions } from './http/routes/checkout.routes.ts';
import { createHealthRoutes } from './http/routes/health.routes.ts';
import { createWebhookEndpointsRoutes } from './http/routes/webhook-endpoints.routes.ts';
import { createWebhookRoutes } from './http/routes/webhook.routes.ts';
import type { Logger } from './shared/logger/logger.ts';

export interface AppDependencies {
	logger: Logger;
	checkout: CheckoutRouteActions;
	getWebhookEndpoints: Pick<GetWebhookEndpointsAction, 'execute'>;
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
	app.route('/v1/webhook-endpoints', createWebhookEndpointsRoutes(deps.getWebhookEndpoints));
	app.route('/v1/webhooks', createWebhookRoutes(deps.handleWebhook));

	app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
		type: 'http',
		scheme: 'bearer',
		description: 'EÜRwerk-API-Key (`ewk_live_…`) des Mandanten'
	});
	app.doc31('/openapi.json', {
		openapi: '3.1.0',
		info: { title: 'EÜRwerk Payment Gateway', version: '0.2.0' }
	});
	app.get('/docs', Scalar({ url: '/openapi.json' }));

	return app;
};
