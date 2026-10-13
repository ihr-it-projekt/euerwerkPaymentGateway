import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { GetWebhookEndpointsAction } from '../../domain/webhook/actions/get-webhook-endpoints.action.ts';
import type { AppEnv } from '../app-env.ts';
import { apiKeyAuth } from '../middleware/api-key.middleware.ts';
import { errorResponses, WebhookEndpointsSchema } from '../schemas/api.schemas.ts';

const getWebhookEndpointsRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Einrichtung'],
	summary: 'Webhook-URLs für Stripe/PayPal (enthalten den API-Key verschlüsselt)',
	security: [{ Bearer: [] }],
	responses: {
		200: {
			description: 'Webhook-URLs der in EÜRwerk konfigurierten Kanäle',
			content: { 'application/json': { schema: WebhookEndpointsSchema } }
		},
		...errorResponses
	}
});

export const createWebhookEndpointsRoutes = (
	getEndpoints: Pick<GetWebhookEndpointsAction, 'execute'>
): OpenAPIHono<AppEnv> => {
	const app = new OpenAPIHono<AppEnv>();
	app.use('*', apiKeyAuth());

	return app.openapi(getWebhookEndpointsRoute, async (c) =>
		c.json(await getEndpoints.execute(c.get('apiKey')), 200)
	);
};
