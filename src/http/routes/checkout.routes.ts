import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CreateCheckoutAction } from '../../domain/checkout/actions/create-checkout.action.ts';
import type { GetCheckoutAction } from '../../domain/checkout/actions/get-checkout.action.ts';
import { CreateCheckoutInputSchema } from '../../domain/checkout/models/checkout.schema.ts';
import type { AppEnv } from '../app-env.ts';
import { apiKeyAuth } from '../middleware/api-key.middleware.ts';
import {
	CheckoutIdParamSchema,
	CheckoutViewSchema,
	ErrorResponseSchema,
	errorResponses
} from '../schemas/api.schemas.ts';
import { validationHook } from '../validation-hook.ts';

export interface CheckoutRouteActions {
	createCheckout: Pick<CreateCheckoutAction, 'execute'>;
	getCheckout: Pick<GetCheckoutAction, 'execute'>;
}

const json = <T>(schema: T) => ({ 'application/json': { schema } });

const createCheckoutRoute = createRoute({
	method: 'post',
	path: '/',
	tags: ['Checkouts'],
	summary: 'Zahlung anlegen und Weiterleitungs-URL zum Zahlungsanbieter erhalten',
	security: [{ Bearer: [] }],
	request: { body: { content: json(CreateCheckoutInputSchema), required: true } },
	responses: {
		201: { description: 'Checkout angelegt', content: json(CheckoutViewSchema) },
		...errorResponses,
		422: {
			description: 'Provider in EÜRwerk nicht konfiguriert',
			content: json(ErrorResponseSchema)
		}
	}
});

const getCheckoutRoute = createRoute({
	method: 'get',
	path: '/{id}',
	tags: ['Checkouts'],
	summary: 'Checkout-Status live beim Zahlungsanbieter abfragen',
	security: [{ Bearer: [] }],
	request: { params: CheckoutIdParamSchema },
	responses: {
		200: { description: 'Checkout', content: json(CheckoutViewSchema) },
		...errorResponses,
		404: { description: 'Nicht gefunden', content: json(ErrorResponseSchema) }
	}
});

export const createCheckoutRoutes = (actions: CheckoutRouteActions): OpenAPIHono<AppEnv> => {
	const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
	app.use('*', apiKeyAuth());

	return app
		.openapi(createCheckoutRoute, async (c) => {
			const view = await actions.createCheckout.execute(c.get('apiKey'), c.req.valid('json'));
			return c.json(view, 201);
		})
		.openapi(getCheckoutRoute, async (c) => {
			const view = await actions.getCheckout.execute(c.get('apiKey'), c.req.valid('param').id);
			return c.json(view, 200);
		});
};
