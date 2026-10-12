import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { BlankEnv } from 'hono/types';
import type { CreateMerchantAction } from '../../domain/merchant/actions/create-merchant.action.ts';
import { CreateMerchantInputSchema } from '../../domain/merchant/models/merchant.schema.ts';
import { adminAuth } from '../middleware/admin-auth.middleware.ts';
import { CreatedMerchantSchema, errorResponses } from '../schemas/api.schemas.ts';
import { validationHook } from '../validation-hook.ts';

export interface AdminRouteConfig {
	adminApiKey: string;
	publicBaseUrl: string;
	createMerchant: Pick<CreateMerchantAction, 'execute'>;
}

const createMerchantRoute = createRoute({
	method: 'post',
	path: '/merchants',
	tags: ['Admin'],
	summary: 'Merchant (Publisher) anlegen – liefert API-Key und Webhook-Secret einmalig',
	security: [{ Bearer: [] }],
	request: {
		body: { content: { 'application/json': { schema: CreateMerchantInputSchema } }, required: true }
	},
	responses: {
		201: {
			description: 'Merchant angelegt',
			content: { 'application/json': { schema: CreatedMerchantSchema } }
		},
		...errorResponses
	}
});

export const createAdminRoutes = (config: AdminRouteConfig): OpenAPIHono<BlankEnv> => {
	const app = new OpenAPIHono<BlankEnv>({ defaultHook: validationHook });
	app.use('*', adminAuth(config.adminApiKey));

	return app.openapi(createMerchantRoute, async (c) => {
		const { merchant, apiKey } = await config.createMerchant.execute(c.req.valid('json'));
		const webhookBase = `${config.publicBaseUrl}/v1/webhooks`;
		return c.json(
			{
				id: merchant.id,
				name: merchant.name,
				apiKey,
				webhookSigningSecret: merchant.credentials.webhookSigningSecret,
				providerWebhookUrls: {
					stripe: `${webhookBase}/stripe/${merchant.id}`,
					paypal: `${webhookBase}/paypal/${merchant.id}`
				}
			},
			201
		);
	});
};
