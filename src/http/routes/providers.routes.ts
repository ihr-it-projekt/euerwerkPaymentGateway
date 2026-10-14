import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { GetProvidersAction } from '../../domain/config/actions/get-providers.action.ts';
import { ProviderNameSchema } from '../../domain/checkout/models/checkout.schema.ts';
import type { AppEnv } from '../app-env.ts';
import { apiKeyAuth } from '../middleware/api-key.middleware.ts';
import { errorResponses } from '../schemas/api.schemas.ts';

const ProvidersSchema = z
	.object({ providers: z.array(ProviderNameSchema) })
	.openapi('Providers', { example: { providers: ['stripe', 'paypal', 'wero'] } });

const getProvidersRoute = createRoute({
	method: 'get',
	path: '/',
	tags: ['Einrichtung'],
	summary: 'In EÜRwerk eingerichtete Zahlungsarten (auch als Verbindungstest)',
	security: [{ Bearer: [] }],
	responses: {
		200: {
			description: 'Zahlungsarten',
			content: { 'application/json': { schema: ProvidersSchema } }
		},
		...errorResponses
	}
});

export const createProvidersRoutes = (
	getProviders: Pick<GetProvidersAction, 'execute'>
): OpenAPIHono<AppEnv> => {
	const app = new OpenAPIHono<AppEnv>();
	app.use('*', apiKeyAuth());

	return app.openapi(getProvidersRoute, async (c) =>
		c.json(await getProviders.execute(c.get('apiKey')), 200)
	);
};
